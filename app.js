import { createStore, idbBackend } from './src/db.js';
import { prefillSets, suggestIncrease } from './src/progression.js';
import { unionMuscles } from './src/muscles.js';
import { highlightMuscles } from './src/musclemap.js';
import { buildPlanIndex, volumeByMuscleForWeek, weekStartISO, e1rmTrend, prHistory } from './src/volume.js';
import { serializeBackup, parseBackup } from './src/csv.js';

const store = createStore(idbBackend());
let plan = [];
let currentDay = null;
let draft = {}; // exId -> [{weight,reps,done}]

const PLAN_VERSION = '2'; // bump whenever data/plan.json changes so the stored plan refreshes

async function boot() {
  const seed = await (await fetch('data/plan.json')).json();
  if ((await store.getSetting('planVersion')) !== PLAN_VERSION) {
    await store.reseedPlan(seed);            // refresh plan; leaves sessions & PRs intact
    await store.setSetting('planVersion', PLAN_VERSION);
  } else {
    await store.seedPlanIfEmpty(seed);
  }
  if (!(await store.getPR('conventional-deadlift'))) {
    await store.upsertPR({ exId: 'conventional-deadlift', bestWeight: 156, dateISO: '2026-07-01' });
  }
  plan = await store.getPlan();
  const sessions = await store.getSessions();
  buildDaySelect();
  currentDay = plan[0];
  await renderDay(sessions);
  wireNav();
  registerSW();
}

function buildDaySelect() {
  const host = document.getElementById('day-pills');
  host.innerHTML = plan.map((d, i) =>
    `<button class="day-pill${i === 0 ? ' active' : ''}" data-dayid="${d.dayId}">${d.dayId.replace('day-', 'Day ')}</button>`
  ).join('');
  host.querySelectorAll('.day-pill').forEach(btn => {
    btn.onclick = async () => {
      currentDay = plan.find(d => d.dayId === btn.dataset.dayid);
      draft = {};
      host.querySelectorAll('.day-pill').forEach(b => b.classList.toggle('active', b === btn));
      await renderDay(await store.getSessions());
    };
  });
}

async function renderDay(sessions) {
  document.getElementById('day-focus').textContent = currentDay.focus;
  // muscle map
  const mapHost = document.getElementById('muscle-map');
  if (!mapHost.dataset.loaded) {
    mapHost.innerHTML = await (await fetch('assets/body.svg')).text();
    mapHost.dataset.loaded = '1';
  }
  const union = unionMuscles(currentDay.exercises);
  highlightMuscles(document.getElementById('bodymap'), union);

  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  let n = 0;
  for (const ex of currentDay.exercises) {
    const pf = prefillSets(ex.exId, sessions, ex.scheme);
    draft[ex.exId] = draft[ex.exId] || pf.map(s => ({ ...s }));
    const sug = suggestIncrease(ex.exId, sessions, ex);
    list.appendChild(renderExercise(ex, draft[ex.exId], sug, ++n));
  }
}

function renderExercise(ex, sets, sug, num) {
  const el = document.createElement('div');
  el.className = 'exercise';
  const prim = ex.primary.map(m => `<span class="mtag prim">${m}</span>`).join('');
  const sec = ex.secondary.map(m => `<span class="mtag">${m}</span>`).join('');
  const demo = ex.demoUrl ? `<a class="demo" href="${ex.demoUrl}" target="_blank" rel="noopener">▶ demo</a>` : '';
  el.innerHTML = `
    <div class="ex-top">
      <span class="ex-num">${String(num).padStart(2, '0')}</span>
      <h3 class="ex-name">${ex.name}</h3>
      <span class="chip">${ex.setType}</span>
    </div>
    <div class="muscles">${prim}${sec}</div>
    ${sug.suggest ? `<div class="cue"><span>▲</span><span>${sug.message}</span></div>` : ''}
    <div class="scheme">${ex.scheme}${demo}</div>
    <div class="sets">
      <div class="set-head"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span>Done</span></div>
    </div>`;
  const setsHost = el.querySelector('.sets');
  el.addEventListener('pointerover', () =>
    highlightMuscles(document.getElementById('bodymap'), { primary: ex.primary, secondary: ex.secondary }));
  sets.forEach((s, i) => setsHost.appendChild(renderSetRow(ex.exId, i, s)));
  return el;
}

function renderSetRow(exId, i, s) {
  const row = document.createElement('div');
  row.className = 'setrow';
  row.innerHTML = `
    <span class="set-idx">${i + 1}</span>
    <div class="stepper"><button class="dn">−</button><input type="number" inputmode="decimal" class="w" value="${s.weight}"><button class="up">+</button></div>
    <div class="stepper"><button class="dn">−</button><input type="number" inputmode="numeric" class="r" value="${s.reps}"><button class="up">+</button></div>
    <button class="done-toggle ${s.done ? 'done' : ''}" aria-label="Mark set done">✓</button>`;
  const w = row.querySelector('.w'), r = row.querySelector('.r');
  const wStep = row.children[1], rStep = row.children[2];
  wStep.querySelector('.dn').onclick = () => { w.value = Math.max(0, (+w.value) - 2.5); s.weight = +w.value; };
  wStep.querySelector('.up').onclick = () => { w.value = (+w.value) + 2.5; s.weight = +w.value; };
  rStep.querySelector('.dn').onclick = () => { r.value = Math.max(0, (+r.value) - 1); s.reps = +r.value; };
  rStep.querySelector('.up').onclick = () => { r.value = (+r.value) + 1; s.reps = +r.value; };
  w.oninput = () => s.weight = +w.value;
  r.oninput = () => s.reps = +r.value;
  const done = row.querySelector('.done-toggle');
  done.onclick = () => { s.done = !s.done; done.classList.toggle('done', s.done); };
  return row;
}

document.getElementById('save-session').onclick = async () => {
  const entries = currentDay.exercises
    .map(ex => ({ exId: ex.exId, sets: (draft[ex.exId] || []).filter(s => s.done) }))
    .filter(e => e.sets.length > 0);
  if (entries.length === 0) { alert('No completed sets to save — tap the ✓ on the sets you finished.'); return; }
  const dateISO = new Date().toISOString().slice(0, 10);
  const session = { sessionId: `${dateISO}-${currentDay.dayId}-${Date.now()}`, dateISO, dayId: currentDay.dayId, entries };
  await store.saveSession(session);
  // update PRs (only from exercises with a saved entry, using that entry's completed sets)
  for (const entry of entries) {
    const best = Math.max(0, ...entry.sets.map(s => s.weight || 0));
    const pr = await store.getPR(entry.exId);
    if (!pr || best > (pr.bestWeight || 0)) await store.upsertPR({ exId: entry.exId, bestWeight: best, dateISO });
  }
  alert('Session saved!');
  draft = {};
  await renderDay(await store.getSessions());
};

function wireNav() {
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.view));
}
function showView(name) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  ['today', 'dashboard', 'data'].forEach(v => document.getElementById(`view-${v}`).hidden = v !== name);
  if (name === 'dashboard') window.renderDashboard?.();
  if (name === 'data') window.renderDataView?.();
}
function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

window.renderDashboard = async function () {
  const sessions = await store.getSessions();
  const idx = buildPlanIndex(plan);
  const host = document.getElementById('view-dashboard');
  const week = weekStartISO(new Date().toISOString().slice(0, 10));
  const vol = volumeByMuscleForWeek(sessions, idx, week);
  const maxVol = Math.max(1, ...Object.values(vol));

  const volRows = Object.entries(vol).sort((a, b) => b[1] - a[1]).map(([m, v]) =>
    `<div class="bar-row"><span>${m}</span><div class="bar-track"><div class="bar" style="width:${(v / maxVol) * 100}%"></div></div><span>${Math.round(v)}</span></div>`
  ).join('') || '<p class="muted">No sets logged this week yet.</p>';

  const bigLifts = ['conventional-deadlift', 'barbell-back-squat', 'flat-barbell-bench-press'];
  const prRowsArr = [];
  for (const exId of bigLifts) {
    const prRecord = await store.getPR(exId);
    const sessionPR = prHistory(sessions, exId);
    const bestWeight = Math.max(prRecord?.bestWeight || 0, sessionPR.bestWeight);
    const label = (idx.get(exId)?.name) || exId;
    prRowsArr.push(`<div class="pr"><span class="lift">${label}</span><span class="stat">best <b>${bestWeight || 0}kg</b> · e1RM ${sessionPR.bestE1RM || 0}kg</span></div>`);
  }
  const prRows = prRowsArr.join('');

  const trend = e1rmTrend(sessions, 'conventional-deadlift');
  const trendTxt = trend.length ? trend.map(t => `${t.dateISO}: ${t.e1rm}kg`).join(' → ') : 'Log a deadlift to start the trend.';

  host.innerHTML = `
    <div class="card"><h3>Weekly volume — week of ${week}</h3>${volRows}</div>
    <div class="card"><h3>Personal records</h3>${prRows}</div>
    <div class="card"><h3>Deadlift e1RM trend</h3><p class="muted">${trendTxt}</p></div>`;
};

window.renderDataView = async function () {
  const host = document.getElementById('view-data');
  host.innerHTML = `
    <div class="card"><h3>Backup</h3>
      <button id="export-json" class="primary-btn">Export backup (JSON)</button>
      <p class="muted" style="margin-top:12px">Your data lives only on this device. Export regularly — this file is your only copy.</p>
      <input type="file" id="import-file" accept="application/json" class="file-in">
    </div>`;
  document.getElementById('export-json').onclick = async () => {
    const state = {
      sessions: await store.getSessions(),
      prs: await store.getAllPRs(),
      settings: await store.getAllSettings(),
    };
    const blob = new Blob([serializeBackup(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ironpyramid-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  document.getElementById('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const state = parseBackup(text);
      for (const s of state.sessions || []) await store.saveSession(s);
      for (const p of state.prs || []) await store.upsertPR(p);
      for (const st of state.settings || []) await store.setSetting(st.key, st.value);
      alert('Backup imported.');
    } catch (err) {
      alert('Import failed: could not read that backup file. ' + (err && err.message ? err.message : ''));
    }
  };
};

boot();
