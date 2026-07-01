# IronPyramid Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first PWA that turns Tarun's 6-day gym split into an active tracker with an interactive muscle map, set logging, a progressive-overload coach, and a dashboard.

**Architecture:** Everything is client-side. Vanilla JS ES modules with no build step. Pure logic (muscle mapping, CSV/plan parsing, progression math, volume aggregation) lives in `src/*.js` and is unit-tested under Node. A storage-backend-injection pattern lets the same store logic run on an in-memory backend (tests) and IndexedDB (browser). A service worker caches the app shell for offline use.

**Tech Stack:** HTML, CSS, vanilla JavaScript (ES modules), IndexedDB, Service Worker, Node's built-in test runner (`node --test`). No npm dependencies.

## Global Constraints

- **No runtime dependencies.** The app must run from static files with no framework and no build step. Dev/test uses only Node's built-in `node --test` and `node:assert`.
- **ES modules everywhere.** `package.json` sets `"type": "module"` so the same `.js` files load in both the browser (`<script type="module">`) and Node tests.
- **Units:** kilograms. Bodyweight seed `72`, height `179`, deadlift PR seed `156`.
- **Muscle taxonomy keys (canonical, used by data + SVG):** `chest, front-delts, side-delts, rear-delts, traps, lats, mid-back, lower-back, biceps, triceps, forearms, abs, obliques, glutes, quads, hamstrings, calves, cardio`.
- **e1RM formula:** Epley — `weight * (1 + reps/30)`.
- **Every git commit message ends with the trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Seed data source:** `seed/gym_workout_tracker.csv` (already in repo).

## File Structure

```
ironpyramid/
├── package.json              # {"type":"module"}, test script
├── .gitignore
├── index.html                # app shell + view containers
├── styles.css
├── app.js                    # UI wiring: views, event handlers, boot
├── src/
│   ├── muscles.js            # taxonomy + raw-name → key normalization + day union
│   ├── csv.js                # parse seed CSV → plan; backup serialize/parse; default increment
│   ├── progression.js        # e1RM, scheme parsing, prefill, add-weight suggestion
│   ├── volume.js             # weekly volume per muscle, e1RM trend, PR history
│   ├── db.js                 # store logic + memoryBackend + idbBackend
│   └── musclemap.js          # DOM: highlight regions in the SVG
├── assets/
│   └── body.svg              # schematic front/back body, region ids = taxonomy keys
├── data/
│   └── plan.json             # generated: node scripts/build-plan.js
├── scripts/
│   └── build-plan.js         # reads seed CSV → writes data/plan.json
├── manifest.webmanifest
├── service-worker.js
├── icons/                    # icon-192.png, icon-512.png (generated)
├── tests/
│   ├── muscles.test.js
│   ├── csv.test.js
│   ├── progression.test.js
│   ├── volume.test.js
│   └── db.test.js
└── seed/
    └── gym_workout_tracker.csv
```

---

## Task 1: Project scaffolding & test harness

**Files:**
- Create: `package.json`, `.gitignore`, `tests/smoke.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: a working `node --test` harness for all later tasks

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ironpyramid",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "build-plan": "node scripts/build-plan.js"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Write a smoke test at `tests/smoke.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('harness runs', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run the harness**

Run: `node --test`
Expected: `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tests/smoke.test.js
git commit -m "chore: scaffold project and node test harness"
```

---

## Task 2: Muscle taxonomy & name normalization (`src/muscles.js`)

The seed CSV has messy muscle strings like `Shoulders (Front/Side Delts)`, `Back; Hamstrings; Glutes`, `Core (Abs; Obliques)`. This module turns them into canonical taxonomy keys and computes a day's combined muscles.

**Files:**
- Create: `src/muscles.js`, `tests/muscles.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MUSCLE_KEYS: string[]`
  - `normalizeMuscles(raw: string): string[]` — returns unique taxonomy keys
  - `unionMuscles(exercises: {primary:string[], secondary:string[]}[]): {primary:string[], secondary:string[]}`

- [ ] **Step 1: Write failing tests at `tests/muscles.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLE_KEYS, normalizeMuscles, unionMuscles } from '../src/muscles.js';

test('taxonomy contains expected keys', () => {
  ['chest', 'triceps', 'lats', 'quads', 'hamstrings', 'calves'].forEach(k =>
    assert.ok(MUSCLE_KEYS.includes(k), `missing ${k}`));
});

test('simple semicolon list', () => {
  assert.deepEqual(normalizeMuscles('Triceps; Front Delts').sort(),
    ['front-delts', 'triceps']);
});

test('shoulders parenthetical expands to front and side delts', () => {
  assert.deepEqual(normalizeMuscles('Shoulders (Front/Side Delts)').sort(),
    ['front-delts', 'side-delts']);
});

test('bare "Back" maps to full posterior back set', () => {
  assert.deepEqual(normalizeMuscles('Back').sort(),
    ['lats', 'lower-back', 'mid-back']);
});

test('qualified mid-back does NOT pull in lower-back', () => {
  assert.deepEqual(normalizeMuscles('Mid-Back; Lats').sort(),
    ['lats', 'mid-back']);
});

test('core parenthetical', () => {
  assert.deepEqual(normalizeMuscles('Core (Abs; Obliques)').sort(),
    ['abs', 'obliques']);
});

test('empty string yields empty array', () => {
  assert.deepEqual(normalizeMuscles(''), []);
});

test('unionMuscles merges and dedupes', () => {
  const out = unionMuscles([
    { primary: ['chest'], secondary: ['triceps'] },
    { primary: ['chest'], secondary: ['front-delts'] },
  ]);
  assert.deepEqual(out.primary.sort(), ['chest']);
  assert.deepEqual(out.secondary.sort(), ['front-delts', 'triceps']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/muscles.test.js`
Expected: FAIL (`normalizeMuscles is not a function` / module not found).

- [ ] **Step 3: Implement `src/muscles.js`**

```javascript
export const MUSCLE_KEYS = [
  'chest', 'front-delts', 'side-delts', 'rear-delts', 'traps', 'lats',
  'mid-back', 'lower-back', 'biceps', 'triceps', 'forearms', 'abs',
  'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'cardio',
];

// Each token from the raw string is scanned for these keyword rules, in order.
// A rule matches if its `kw` appears in the (punctuation-stripped) token.
const RULES = [
  { kw: 'front delt', keys: ['front-delts'] },
  { kw: 'side delt', keys: ['side-delts'] },
  { kw: 'rear delt', keys: ['rear-delts'] },
  { kw: 'shoulder', keys: ['front-delts', 'side-delts'] },
  { kw: 'delt', keys: ['front-delts'] },
  { kw: 'tricep', keys: ['triceps'] },
  { kw: 'bicep', keys: ['biceps'] },
  { kw: 'forearm', keys: ['forearms'] },
  { kw: 'trap', keys: ['traps'] },
  { kw: 'lat', keys: ['lats'] },
  { kw: 'rhomboid', keys: ['mid-back'] },
  { kw: 'upper back', keys: ['mid-back'] },
  { kw: 'mid-back', keys: ['mid-back'] },
  { kw: 'mid back', keys: ['mid-back'] },
  { kw: 'lower back', keys: ['lower-back'] },
  { kw: 'chest', keys: ['chest'] },
  { kw: 'oblique', keys: ['obliques'] },
  { kw: 'core', keys: ['abs'] },
  { kw: 'ab', keys: ['abs'] },
  { kw: 'glute', keys: ['glutes'] },
  { kw: 'quad', keys: ['quads'] },
  { kw: 'hamstring', keys: ['hamstrings'] },
  { kw: 'calf', keys: ['calves'] },
  { kw: 'calves', keys: ['calves'] },
  { kw: 'cardio', keys: ['cardio'] },
  // Bare "back" (deadlift-style) lights the whole posterior back. Checked last
  // so qualified terms above win; guarded so it only fires when no qualified
  // back term already matched this token.
  { kw: 'back', keys: ['lats', 'mid-back', 'lower-back'], bareBack: true },
];

function tokenize(raw) {
  // split on ; , / ( ) and normalize whitespace/case
  return raw
    .replace(/[()]/g, ' ')
    .split(/[;,/]/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeMuscles(raw) {
  if (!raw) return [];
  const found = new Set();
  for (const token of tokenize(raw)) {
    const clean = token.replace(/[^a-z\s-]/g, ' ');
    const qualifiedBack = /(mid|lower|upper)\s*-?\s*back/.test(clean);
    for (const rule of RULES) {
      if (rule.bareBack && qualifiedBack) continue; // don't over-light
      if (clean.includes(rule.kw)) rule.keys.forEach(k => found.add(k));
    }
  }
  return [...found];
}

export function unionMuscles(exercises) {
  const primary = new Set();
  const secondary = new Set();
  for (const ex of exercises) {
    (ex.primary || []).forEach(m => primary.add(m));
    (ex.secondary || []).forEach(m => secondary.add(m));
  }
  return { primary: [...primary], secondary: [...secondary] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/muscles.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/muscles.js tests/muscles.test.js
git commit -m "feat: muscle taxonomy and CSV name normalization"
```

---

## Task 3: CSV parsing, default increment & backup serialization (`src/csv.js`)

**Files:**
- Create: `src/csv.js`, `tests/csv.test.js`

**Interfaces:**
- Consumes: `normalizeMuscles` from `src/muscles.js`
- Produces:
  - `splitCsvLine(line: string): string[]`
  - `defaultIncrementKg(name: string): number`
  - `parseCsvToPlan(csv: string): Day[]` where
    `Day = {dayId:string, focus:string, exercises: Exercise[]}` and
    `Exercise = {exId:string, name:string, order:number, setType:string, scheme:string, primary:string[], secondary:string[], increment:number, demoUrl:string, notes:string}`.
    `exId` is `slugify(name)`.
  - `serializeBackup(state: {sessions, prs, settings}): string` (pretty JSON)
  - `parseBackup(json: string): {sessions, prs, settings}`

- [ ] **Step 1: Write failing tests at `tests/csv.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCsvLine, defaultIncrementKg, parseCsvToPlan, serializeBackup, parseBackup } from '../src/csv.js';

const HEADER = 'Day,Day Focus,Order,Exercise,Set Type,Target Sets x Reps,Primary Muscle,Secondary Muscle,Progression Cue,Demo/Tutorial Link,W1 Weight (kg),W1 Reps,W2 Weight (kg),W2 Reps,W3 Weight (kg),W3 Reps,W4 Weight (kg),W4 Reps,Notes';

test('splitCsvLine handles plain fields', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('splitCsvLine keeps empty trailing fields', () => {
  assert.deepEqual(splitCsvLine('a,,'), ['a', '', '']);
});

test('defaultIncrementKg: barbell compound = 2.5', () => {
  assert.equal(defaultIncrementKg('Flat Barbell Bench Press'), 2.5);
});

test('defaultIncrementKg: dumbbell/isolation = 1', () => {
  assert.equal(defaultIncrementKg('Lateral Raise + Front Raise (Superset)'), 1);
});

test('parseCsvToPlan builds days and exercises', () => {
  const csv = [
    HEADER,
    'Day 1,Chest & Triceps,1,Flat Barbell Bench Press,Pyramid,4 sets: 12/10/8/6 reps,Chest,Triceps; Front Delts,cue,http://x,,,,,,,,,note',
    'Day 1,Chest & Triceps,2,Cable / Pec-Deck Flyes,Normal,3x15,Chest,Front Delts,cue,http://y,,,,,,,,,',
  ].join('\n');
  const plan = parseCsvToPlan(csv);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].dayId, 'day-1');
  assert.equal(plan[0].focus, 'Chest & Triceps');
  assert.equal(plan[0].exercises.length, 2);
  const bench = plan[0].exercises[0];
  assert.equal(bench.exId, 'flat-barbell-bench-press');
  assert.equal(bench.setType, 'Pyramid');
  assert.deepEqual(bench.primary, ['chest']);
  assert.deepEqual(bench.secondary.sort(), ['front-delts', 'triceps']);
  assert.equal(bench.increment, 2.5);
  assert.equal(bench.demoUrl, 'http://x');
});

test('backup round-trips', () => {
  const state = { sessions: [{ sessionId: 's1', dateISO: '2026-07-01', dayId: 'day-1', entries: [] }], prs: [{ exId: 'deadlift', bestWeight: 156 }], settings: [{ key: 'units', value: 'kg' }] };
  const restored = parseBackup(serializeBackup(state));
  assert.deepEqual(restored, state);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/csv.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/csv.js`**

```javascript
import { normalizeMuscles } from './muscles.js';

export function splitCsvLine(line) {
  // Minimal CSV: supports double-quoted fields with commas inside.
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function defaultIncrementKg(name) {
  const n = name.toLowerCase();
  if (/(barbell|bench|squat|deadlift|row|press|thrust)/.test(n) && !/dumbbell|db /.test(n)) {
    return 2.5;
  }
  return 1;
}

export function parseCsvToPlan(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = lines.slice(1).map(splitCsvLine);
  const days = [];
  const byId = new Map();
  for (const r of rows) {
    const [dayLabel, focus, order, name, setType, scheme, primaryRaw, secondaryRaw, , demoUrl, , , , , , , , , notes] = r;
    const dayId = slugify(dayLabel);
    if (!byId.has(dayId)) {
      const day = { dayId, focus, exercises: [] };
      byId.set(dayId, day);
      days.push(day);
    }
    byId.get(dayId).exercises.push({
      exId: slugify(name),
      name,
      order: Number(order) || byId.get(dayId).exercises.length + 1,
      setType,
      scheme,
      primary: normalizeMuscles(primaryRaw),
      secondary: normalizeMuscles(secondaryRaw),
      increment: defaultIncrementKg(name),
      demoUrl,
      notes: notes || '',
    });
  }
  return days;
}

export function serializeBackup(state) {
  return JSON.stringify(state, null, 2);
}

export function parseBackup(json) {
  return JSON.parse(json);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/csv.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/csv.js tests/csv.test.js
git commit -m "feat: CSV-to-plan parser and backup serialization"
```

---

## Task 4: Progression engine (`src/progression.js`)

**Files:**
- Create: `src/progression.js`, `tests/progression.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `epley1RM(weight:number, reps:number): number`
  - `parseScheme(setType:string, scheme:string): {sets:number, topReps:number|null, isTimed:boolean, perLeg:boolean}`
  - `lastSessionForExercise(exId:string, sessions:Session[]): Session|null` (latest by dateISO)
  - `prefillSets(exId:string, sessions:Session[], scheme:string): {weight:number, reps:number, done:boolean}[]`
  - `suggestIncrease(exId:string, sessions:Session[], exercise:Exercise): {suggest:boolean, increment:number, message:string}`

- [ ] **Step 1: Write failing tests at `tests/progression.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epley1RM, parseScheme, prefillSets, suggestIncrease, lastSessionForExercise } from '../src/progression.js';

test('epley1RM formula', () => {
  assert.equal(epley1RM(100, 0), 100);
  assert.ok(Math.abs(epley1RM(100, 6) - 120) < 1e-9);
});

test('parseScheme reads "4 sets: 12/10/8/6 reps"', () => {
  const s = parseScheme('Pyramid', '4 sets: 12/10/8/6 reps');
  assert.equal(s.sets, 4);
  assert.equal(s.topReps, 6);
  assert.equal(s.isTimed, false);
});

test('parseScheme reads "3x15"', () => {
  const s = parseScheme('Normal', '3x15');
  assert.equal(s.sets, 3);
  assert.equal(s.topReps, 15);
});

test('parseScheme flags timed holds', () => {
  const s = parseScheme('Normal', '3 sets x 45-60 sec hold');
  assert.equal(s.isTimed, true);
});

const sessions = [
  { sessionId: 's1', dateISO: '2026-06-24', dayId: 'day-1',
    entries: [{ exId: 'bench', sets: [{ weight: 60, reps: 12 }, { weight: 65, reps: 6 }] }] },
  { sessionId: 's2', dateISO: '2026-07-01', dayId: 'day-1',
    entries: [{ exId: 'bench', sets: [{ weight: 62, reps: 12 }, { weight: 67, reps: 6 }] }] },
];

test('lastSessionForExercise picks the most recent', () => {
  assert.equal(lastSessionForExercise('bench', sessions).sessionId, 's2');
});

test('prefillSets uses last session weights/reps, not done', () => {
  const pf = prefillSets('bench', sessions, '4 sets: 12/10/8/6 reps');
  assert.equal(pf.length, 4);
  assert.equal(pf[0].weight, 62);
  assert.equal(pf[0].done, false);
});

test('suggestIncrease fires when top set hit target reps', () => {
  const ex = { exId: 'bench', increment: 2.5, setType: 'Pyramid', scheme: '4 sets: 12/10/8/6 reps' };
  const out = suggestIncrease('bench', sessions, ex);
  assert.equal(out.suggest, true);
  assert.equal(out.increment, 2.5);
});

test('suggestIncrease does not fire when target missed', () => {
  const miss = [{ sessionId: 's3', dateISO: '2026-07-01', dayId: 'day-1',
    entries: [{ exId: 'bench', sets: [{ weight: 70, reps: 4 }] }] }];
  const ex = { exId: 'bench', increment: 2.5, setType: 'Pyramid', scheme: '4 sets: 12/10/8/6 reps' };
  assert.equal(suggestIncrease('bench', miss, ex).suggest, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/progression.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/progression.js`**

```javascript
export function epley1RM(weight, reps) {
  if (!weight) return 0;
  return weight * (1 + reps / 30);
}

export function parseScheme(setType, scheme) {
  const isTimed = /sec|hold|min/i.test(scheme);
  const perLeg = /per leg/i.test(scheme);
  let sets = 0;
  let topReps = null;

  const setsColon = scheme.match(/(\d+)\s*sets?\s*:\s*([\d/]+)/i); // "4 sets: 12/10/8/6"
  const nxr = scheme.match(/(\d+)\s*x\s*([\d-]+)/i);               // "3x15" or "4x12"
  const rounds = scheme.match(/(\d+)\s*rounds?/i);                 // "3 rounds: ..."

  if (setsColon) {
    sets = Number(setsColon[1]);
    const reps = setsColon[2].split('/').map(Number).filter(n => !isNaN(n));
    topReps = reps.length ? reps[reps.length - 1] : null;
  } else if (nxr) {
    sets = Number(nxr[1]);
    topReps = Number(nxr[2].split('-')[0]);
  } else if (rounds) {
    sets = Number(rounds[1]);
  }
  if (!sets) sets = 3;
  return { sets, topReps, isTimed, perLeg };
}

export function lastSessionForExercise(exId, sessions) {
  const withEx = sessions.filter(s => s.entries.some(e => e.exId === exId));
  if (!withEx.length) return null;
  return withEx.slice().sort((a, b) => a.dateISO < b.dateISO ? 1 : -1)[0];
}

export function prefillSets(exId, sessions, scheme) {
  const { sets } = parseScheme('', scheme);
  const last = lastSessionForExercise(exId, sessions);
  const lastSets = last ? (last.entries.find(e => e.exId === exId).sets) : [];
  const out = [];
  for (let i = 0; i < sets; i++) {
    const prev = lastSets[i] || lastSets[lastSets.length - 1] || { weight: 0, reps: 0 };
    out.push({ weight: prev.weight || 0, reps: prev.reps || 0, done: false });
  }
  return out;
}

export function suggestIncrease(exId, sessions, exercise) {
  const { topReps } = parseScheme(exercise.setType, exercise.scheme);
  const last = lastSessionForExercise(exId, sessions);
  if (!last || topReps == null) return { suggest: false, increment: 0, message: '' };
  const sets = last.entries.find(e => e.exId === exId).sets;
  const top = sets[sets.length - 1];
  if (top && top.reps >= topReps) {
    return {
      suggest: true,
      increment: exercise.increment,
      message: `Hit ${topReps} reps last time → try +${exercise.increment}kg on the top set.`,
    };
  }
  return { suggest: false, increment: 0, message: '' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/progression.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progression.js tests/progression.test.js
git commit -m "feat: progression engine (e1RM, scheme parse, prefill, suggestion)"
```

---

## Task 5: Volume, e1RM trend & PR history (`src/volume.js`)

**Files:**
- Create: `src/volume.js`, `tests/volume.test.js`

**Interfaces:**
- Consumes: `epley1RM` from `src/progression.js`
- Produces:
  - `weekStartISO(dateISO:string): string` (Monday of that week, `YYYY-MM-DD`)
  - `buildPlanIndex(plan:Day[]): Map<exId, Exercise>`
  - `volumeByMuscleForWeek(sessions, planIndex, weekStart): Record<muscle, number>`
  - `e1rmTrend(sessions, exId): {dateISO, e1rm}[]`
  - `prHistory(sessions, exId): {bestWeight:number, bestE1RM:number, dateISO:string|null}`

- [ ] **Step 1: Write failing tests at `tests/volume.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStartISO, buildPlanIndex, volumeByMuscleForWeek, e1rmTrend, prHistory } from '../src/volume.js';

const plan = [{ dayId: 'day-1', focus: 'Chest', exercises: [
  { exId: 'bench', name: 'Bench', primary: ['chest'], secondary: ['triceps'] },
]}];
const idx = buildPlanIndex(plan);

const sessions = [
  { sessionId: 's1', dateISO: '2026-06-30', dayId: 'day-1',
    entries: [{ exId: 'bench', sets: [{ weight: 60, reps: 10, done: true }, { weight: 65, reps: 6, done: true }] }] },
];

test('weekStartISO returns Monday', () => {
  assert.equal(weekStartISO('2026-07-01'), '2026-06-29'); // Wed -> Mon
});

test('volumeByMuscleForWeek attributes to primary muscle', () => {
  const vol = volumeByMuscleForWeek(sessions, idx, weekStartISO('2026-06-30'));
  // 60*10 + 65*6 = 990
  assert.equal(vol.chest, 990);
});

test('e1rmTrend returns best e1RM per session date', () => {
  const t = e1rmTrend(sessions, 'bench');
  assert.equal(t.length, 1);
  assert.ok(t[0].e1rm > 65);
});

test('prHistory returns best weight', () => {
  assert.equal(prHistory(sessions, 'bench').bestWeight, 65);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/volume.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/volume.js`**

```javascript
import { epley1RM } from './progression.js';

export function weekStartISO(dateISO) {
  const d = new Date(dateISO + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function buildPlanIndex(plan) {
  const idx = new Map();
  for (const day of plan) for (const ex of day.exercises) idx.set(ex.exId, ex);
  return idx;
}

export function volumeByMuscleForWeek(sessions, planIndex, weekStart) {
  const totals = {};
  for (const s of sessions) {
    if (weekStartISO(s.dateISO) !== weekStart) continue;
    for (const entry of s.entries) {
      const ex = planIndex.get(entry.exId);
      if (!ex) continue;
      const setVol = entry.sets.reduce((sum, st) => sum + (st.weight || 0) * (st.reps || 0), 0);
      for (const m of ex.primary) totals[m] = (totals[m] || 0) + setVol;
    }
  }
  return totals;
}

export function e1rmTrend(sessions, exId) {
  return sessions
    .filter(s => s.entries.some(e => e.exId === exId))
    .sort((a, b) => a.dateISO < b.dateISO ? -1 : 1)
    .map(s => {
      const sets = s.entries.find(e => e.exId === exId).sets;
      const best = Math.max(0, ...sets.map(st => epley1RM(st.weight || 0, st.reps || 0)));
      return { dateISO: s.dateISO, e1rm: Math.round(best * 10) / 10 };
    });
}

export function prHistory(sessions, exId) {
  let bestWeight = 0, bestE1RM = 0, dateISO = null;
  for (const s of sessions) {
    const entry = s.entries.find(e => e.exId === exId);
    if (!entry) continue;
    for (const st of entry.sets) {
      if ((st.weight || 0) > bestWeight) { bestWeight = st.weight; dateISO = s.dateISO; }
      bestE1RM = Math.max(bestE1RM, epley1RM(st.weight || 0, st.reps || 0));
    }
  }
  return { bestWeight, bestE1RM: Math.round(bestE1RM * 10) / 10, dateISO };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/volume.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/volume.js tests/volume.test.js
git commit -m "feat: volume aggregation, e1RM trend, and PR history"
```

---

## Task 6: Storage layer with injectable backend (`src/db.js`)

Store logic is tested against an in-memory backend; the browser uses an IndexedDB backend with the same interface.

**Files:**
- Create: `src/db.js`, `tests/db.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `memoryBackend(): Backend` where `Backend = {get(store,key), getAll(store), put(store,key,value), count(store)}` (all async)
  - `idbBackend(dbName:string): Backend`
  - `createStore(backend): Store` with async methods: `seedPlanIfEmpty(plan)`, `getPlan()`, `saveSession(session)`, `getSessions()`, `upsertPR(pr)`, `getPR(exId)`, `getAllPRs()`, `setSetting(key,value)`, `getSetting(key)`, `getAllSettings()`
- Store constants: object store names `plan`, `sessions`, `prs`, `settings`.

- [ ] **Step 1: Write failing tests at `tests/db.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend, createStore } from '../src/db.js';

test('seedPlanIfEmpty only seeds once', async () => {
  const store = createStore(memoryBackend());
  const plan = [{ dayId: 'day-1', focus: 'Chest', exercises: [] }];
  assert.equal(await store.seedPlanIfEmpty(plan), true);
  assert.equal(await store.seedPlanIfEmpty(plan), false); // already seeded
  const got = await store.getPlan();
  assert.equal(got.length, 1);
  assert.equal(got[0].dayId, 'day-1');
});

test('sessions persist and read back', async () => {
  const store = createStore(memoryBackend());
  await store.saveSession({ sessionId: 's1', dateISO: '2026-07-01', dayId: 'day-1', entries: [] });
  const all = await store.getSessions();
  assert.equal(all.length, 1);
  assert.equal(all[0].sessionId, 's1');
});

test('PR upsert and settings', async () => {
  const store = createStore(memoryBackend());
  await store.upsertPR({ exId: 'deadlift', bestWeight: 156 });
  assert.equal((await store.getPR('deadlift')).bestWeight, 156);
  await store.setSetting('units', 'kg');
  assert.equal(await store.getSetting('units'), 'kg');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/db.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/db.js`**

```javascript
const STORES = { plan: 'dayId', sessions: 'sessionId', prs: 'exId', settings: 'key' };

export function memoryBackend() {
  const data = { plan: new Map(), sessions: new Map(), prs: new Map(), settings: new Map() };
  return {
    async get(store, key) { return data[store].get(key) ?? null; },
    async getAll(store) { return [...data[store].values()]; },
    async put(store, key, value) { data[store].set(key, value); },
    async count(store) { return data[store].size; },
  };
}

export function idbBackend(dbName = 'ironpyramid') {
  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  return {
    async get(store, key) { return (await tx(store, 'readonly', s => s.get(key))) ?? null; },
    async getAll(store) { return await tx(store, 'readonly', s => s.getAll()); },
    async put(store, key, value) { return await tx(store, 'readwrite', s => s.put(value)); },
    async count(store) { return await tx(store, 'readonly', s => s.count()); },
  };
}

export function createStore(backend) {
  return {
    async seedPlanIfEmpty(plan) {
      if (await backend.count('plan') > 0) return false;
      for (const day of plan) await backend.put('plan', day.dayId, day);
      return true;
    },
    async getPlan() {
      const days = await backend.getAll('plan');
      return days.sort((a, b) => a.dayId < b.dayId ? -1 : 1);
    },
    async saveSession(session) { await backend.put('sessions', session.sessionId, session); },
    async getSessions() { return await backend.getAll('sessions'); },
    async upsertPR(pr) { await backend.put('prs', pr.exId, pr); },
    async getPR(exId) { return await backend.get('prs', exId); },
    async getAllPRs() { return await backend.getAll('prs'); },
    async setSetting(key, value) { await backend.put('settings', key, { key, value }); },
    async getSetting(key) { const r = await backend.get('settings', key); return r ? r.value : null; },
    async getAllSettings() { return await backend.getAll('settings'); },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/db.test.js`
Expected: PASS. Also run the full suite: `node --test` (expect all green).

- [ ] **Step 5: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: storage layer with in-memory and IndexedDB backends"
```

---

## Task 7: Generate `data/plan.json` from the seed CSV

**Files:**
- Create: `scripts/build-plan.js`
- Generate: `data/plan.json`

**Interfaces:**
- Consumes: `parseCsvToPlan` from `src/csv.js`
- Produces: `data/plan.json` (array of Day objects) used by the app at boot

- [ ] **Step 1: Write `scripts/build-plan.js`**

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsvToPlan } from '../src/csv.js';

const csv = readFileSync(new URL('../seed/gym_workout_tracker.csv', import.meta.url), 'utf8');
const plan = parseCsvToPlan(csv);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/plan.json', import.meta.url), JSON.stringify(plan, null, 2));
console.log(`Wrote data/plan.json: ${plan.length} days, ${plan.reduce((n, d) => n + d.exercises.length, 0)} exercises`);
```

- [ ] **Step 2: Run it**

Run: `node scripts/build-plan.js`
Expected: prints `Wrote data/plan.json: 7 days, 34 exercises` (7 days incl. rest day).

- [ ] **Step 3: Sanity-check the output**

Run: `node -e "const p=require('./data/plan.json'); console.log(p[0].dayId, p[0].exercises[0].primary)"`
Expected: `day-1 [ 'chest' ]` (note: this uses CommonJS require via node; if it errors under ESM, use `node --input-type=module -e "import('./data/plan.json',{with:{type:'json'}}).then(m=>console.log(m.default[0].dayId))"`).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-plan.js data/plan.json
git commit -m "feat: generate plan.json from seed CSV"
```

---

## Task 8: Muscle map SVG + highlight module (`assets/body.svg`, `src/musclemap.js`)

Schematic (not anatomical) front/back figures; each muscle region is a shape whose `id` is the taxonomy key, prefixed `f-` (front) or `b-` (back). The highlight module toggles classes.

**Files:**
- Create: `assets/body.svg`, `src/musclemap.js`, `tests/musclemap.test.js`
- Create (manual check): `assets/map-preview.html`

**Interfaces:**
- Consumes: nothing
- Produces: `regionIdsFor(muscles:string[]): string[]` (pure, returns `f-<key>` and `b-<key>` ids) and `highlightMuscles(svgRoot, {primary, secondary})` (DOM side effect)

- [ ] **Step 1: Write failing test at `tests/musclemap.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionIdsFor } from '../src/musclemap.js';

test('regionIdsFor returns front and back ids', () => {
  assert.deepEqual(regionIdsFor(['chest']).sort(), ['b-chest', 'f-chest']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/musclemap.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/musclemap.js`**

```javascript
export function regionIdsFor(muscles) {
  const ids = [];
  for (const m of muscles) { ids.push(`f-${m}`, `b-${m}`); }
  return ids;
}

export function highlightMuscles(svgRoot, { primary = [], secondary = [] }) {
  svgRoot.querySelectorAll('.primary, .secondary').forEach(el =>
    el.classList.remove('primary', 'secondary'));
  for (const id of regionIdsFor(secondary)) {
    const el = svgRoot.getElementById(id);
    if (el) el.classList.add('secondary');
  }
  for (const id of regionIdsFor(primary)) {
    const el = svgRoot.getElementById(id);
    if (el) el.classList.add('primary'); // primary wins over secondary
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/musclemap.test.js`
Expected: PASS.

- [ ] **Step 5: Create `assets/body.svg`** (schematic; regions carry ids `f-<key>` / `b-<key>`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" id="bodymap">
  <style>
    .region { fill:#3a3f4b; stroke:#20232a; stroke-width:1; transition:fill .2s; }
    .region.secondary { fill:#f0a020; }
    .region.primary { fill:#e0402f; }
    .label { fill:#9aa0aa; font: 10px sans-serif; text-anchor:middle; }
  </style>
  <text x="100" y="14" class="label">FRONT</text>
  <text x="300" y="14" class="label">BACK</text>
  <!-- FRONT figure (left) -->
  <g id="front">
    <ellipse id="f-head" cx="100" cy="35" rx="14" ry="16" class="region"/>
    <rect id="f-front-delts" x="70" y="55" width="60" height="14" rx="6" class="region"/>
    <rect id="f-side-delts" x="62" y="58" width="12" height="14" rx="5" class="region"/>
    <rect id="f-chest" x="76" y="72" width="48" height="26" rx="6" class="region"/>
    <rect id="f-biceps" x="62" y="80" width="12" height="34" rx="5" class="region"/>
    <rect id="f-abs" x="84" y="100" width="32" height="34" rx="5" class="region"/>
    <rect id="f-obliques" x="76" y="102" width="8" height="30" rx="4" class="region"/>
    <rect id="f-forearms" x="60" y="116" width="12" height="30" rx="5" class="region"/>
    <rect id="f-quads" x="82" y="138" width="16" height="52" rx="6" class="region"/>
    <rect id="f-quads-r" x="102" y="138" width="16" height="52" rx="6" class="region"/>
    <rect id="f-calves" x="84" y="196" width="14" height="40" rx="5" class="region"/>
    <rect id="f-cardio" x="90" y="72" width="20" height="10" rx="4" class="region" opacity="0"/>
  </g>
  <!-- BACK figure (right) -->
  <g id="back">
    <ellipse id="b-head" cx="300" cy="35" rx="14" ry="16" class="region"/>
    <rect id="b-traps" x="284" y="52" width="32" height="16" rx="6" class="region"/>
    <rect id="b-rear-delts" x="270" y="58" width="16" height="14" rx="5" class="region"/>
    <rect id="b-mid-back" x="278" y="70" width="44" height="22" rx="6" class="region"/>
    <rect id="b-lats" x="276" y="90" width="48" height="24" rx="8" class="region"/>
    <rect id="b-triceps" x="262" y="80" width="12" height="34" rx="5" class="region"/>
    <rect id="b-lower-back" x="286" y="114" width="28" height="18" rx="5" class="region"/>
    <rect id="b-glutes" x="282" y="132" width="36" height="22" rx="8" class="region"/>
    <rect id="b-hamstrings" x="282" y="156" width="16" height="42" rx="6" class="region"/>
    <rect id="b-hamstrings-r" x="302" y="156" width="16" height="42" rx="6" class="region"/>
  </g>
</svg>
```

Note: some muscles have paired shapes (e.g. `f-quads` + `f-quads-r`). To keep highlight simple, give BOTH shapes the same id is invalid; instead the paired shape uses a `-r` suffix and `highlightMuscles` is extended to also match `<key>-r`. Update `regionIdsFor` accordingly in Step 6.

- [ ] **Step 6: Extend `regionIdsFor` for paired regions and update the test**

Replace `regionIdsFor` in `src/musclemap.js`:

```javascript
export function regionIdsFor(muscles) {
  const ids = [];
  for (const m of muscles) {
    ids.push(`f-${m}`, `b-${m}`, `f-${m}-r`, `b-${m}-r`);
  }
  return ids;
}
```

Update `tests/musclemap.test.js`:

```javascript
test('regionIdsFor returns front, back and paired ids', () => {
  assert.deepEqual(regionIdsFor(['chest']).sort(),
    ['b-chest', 'b-chest-r', 'f-chest', 'f-chest-r']);
});
```

Run: `node --test tests/musclemap.test.js`
Expected: PASS.

- [ ] **Step 7: Create `assets/map-preview.html` for manual visual check**

```html
<!doctype html><meta charset="utf-8"><title>Map preview</title>
<body style="background:#14161a">
<div id="host"></div>
<script type="module">
  import { highlightMuscles } from '../src/musclemap.js';
  const svg = await (await fetch('./body.svg')).text();
  document.getElementById('host').innerHTML = svg;
  const root = document.getElementById('bodymap');
  // Bench press: primary chest, secondary triceps + front delts
  highlightMuscles(root, { primary: ['chest'], secondary: ['triceps', 'front-delts'] });
</script>
</body>
```

- [ ] **Step 8: Manual verification**

Run: `python3 -m http.server 8000` (from repo root), open `http://localhost:8000/assets/map-preview.html`.
Expected: front chest is red; front-delts and triceps (front biceps region stands in) are orange. Confirm regions visibly change color.

- [ ] **Step 9: Commit**

```bash
git add assets/body.svg assets/map-preview.html src/musclemap.js tests/musclemap.test.js
git commit -m "feat: schematic muscle map SVG and highlight module"
```

---

## Task 9: App shell, boot, and Today view (`index.html`, `styles.css`, `app.js`)

**Files:**
- Create: `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Consumes: `createStore`, `idbBackend` (`src/db.js`); `parseCsvToPlan`? no — loads `data/plan.json`; `prefillSets`, `suggestIncrease` (`src/progression.js`); `highlightMuscles` (`src/musclemap.js`); `unionMuscles` (`src/muscles.js`)
- Produces: a running Today view that seeds the plan, renders the selected day, logs sets to IndexedDB, and highlights muscles

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#14161a">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
  <title>IronPyramid</title>
</head>
<body>
  <header>
    <h1>IronPyramid</h1>
    <nav>
      <button data-view="today" class="active">Today</button>
      <button data-view="dashboard">Dashboard</button>
      <button data-view="data">Data</button>
    </nav>
  </header>

  <main>
    <section id="view-today">
      <div class="daybar">
        <label>Day: <select id="day-select"></select></label>
        <span id="day-focus" class="focus"></span>
      </div>
      <div id="muscle-map"></div>
      <div id="exercise-list"></div>
      <button id="save-session" class="primary-btn">Save session</button>
    </section>

    <section id="view-dashboard" hidden></section>
    <section id="view-data" hidden></section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
:root { --bg:#14161a; --card:#1e2229; --ink:#e8eaed; --muted:#9aa0aa; --accent:#e0402f; --accent2:#f0a020; }
* { box-sizing:border-box; }
body { margin:0; font-family:-apple-system,system-ui,sans-serif; background:var(--bg); color:var(--ink); }
header { padding:12px 16px; border-bottom:1px solid #2a2f38; position:sticky; top:0; background:var(--bg); }
header h1 { margin:0 0 8px; font-size:18px; }
nav button { background:none; border:1px solid #2a2f38; color:var(--muted); padding:6px 12px; border-radius:8px; margin-right:6px; }
nav button.active { color:var(--ink); border-color:var(--accent); }
main { padding:16px; max-width:640px; margin:0 auto; }
.daybar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.focus { color:var(--muted); }
select { background:var(--card); color:var(--ink); border:1px solid #2a2f38; border-radius:8px; padding:6px; }
#muscle-map svg { width:100%; height:auto; background:var(--card); border-radius:12px; padding:8px; }
.exercise { background:var(--card); border-radius:12px; padding:12px; margin:10px 0; }
.exercise h3 { margin:0 0 4px; font-size:15px; }
.badge { font-size:11px; color:var(--bg); background:var(--accent2); border-radius:6px; padding:2px 6px; margin-left:6px; }
.chips span { font-size:11px; color:var(--muted); border:1px solid #2a2f38; border-radius:10px; padding:1px 6px; margin-right:4px; }
.cue { color:var(--accent2); font-size:12px; margin:6px 0; }
.setrow { display:flex; align-items:center; gap:8px; margin:6px 0; }
.setrow .idx { width:22px; color:var(--muted); }
.stepper { display:flex; align-items:center; gap:4px; }
.stepper button { width:34px; height:34px; font-size:18px; border-radius:8px; border:1px solid #2a2f38; background:#262b34; color:var(--ink); }
.stepper input { width:52px; height:34px; text-align:center; background:#262b34; color:var(--ink); border:1px solid #2a2f38; border-radius:8px; }
.done-toggle { margin-left:auto; width:34px; height:34px; border-radius:50%; border:2px solid #2a2f38; background:none; color:var(--ink); }
.done-toggle.done { background:var(--accent); border-color:var(--accent); }
.primary-btn { width:100%; padding:14px; font-size:16px; background:var(--accent); color:#fff; border:none; border-radius:12px; margin-top:12px; }
a.demo { color:var(--accent2); font-size:12px; }
```

- [ ] **Step 3: Create `app.js`**

```javascript
import { createStore, idbBackend } from './src/db.js';
import { prefillSets, suggestIncrease, parseScheme } from './src/progression.js';
import { unionMuscles } from './src/muscles.js';
import { highlightMuscles } from './src/musclemap.js';

const store = createStore(idbBackend());
let plan = [];
let currentDay = null;
let draft = {}; // exId -> [{weight,reps,done}]

async function boot() {
  const seed = await (await fetch('data/plan.json')).json();
  await store.seedPlanIfEmpty(seed);
  plan = await store.getPlan();
  const sessions = await store.getSessions();
  buildDaySelect();
  currentDay = plan[0];
  await renderDay(sessions);
  wireNav();
  registerSW();
}

function buildDaySelect() {
  const sel = document.getElementById('day-select');
  sel.innerHTML = plan.map(d => `<option value="${d.dayId}">${d.dayId.replace('day-', 'Day ')}</option>`).join('');
  sel.onchange = async () => {
    currentDay = plan.find(d => d.dayId === sel.value);
    draft = {};
    await renderDay(await store.getSessions());
  };
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
  for (const ex of currentDay.exercises) {
    const pf = prefillSets(ex.exId, sessions, ex.scheme);
    draft[ex.exId] = draft[ex.exId] || pf.map(s => ({ ...s }));
    const sug = suggestIncrease(ex.exId, sessions, ex);
    list.appendChild(renderExercise(ex, draft[ex.exId], sug));
  }
}

function renderExercise(ex, sets, sug) {
  const el = document.createElement('div');
  el.className = 'exercise';
  const chips = [...ex.primary.map(m => `<span>${m}</span>`), ...ex.secondary.map(m => `<span>${m}</span>`)].join('');
  el.innerHTML = `
    <h3>${ex.name}<span class="badge">${ex.setType}</span></h3>
    <div class="chips">${chips}</div>
    ${sug.suggest ? `<div class="cue">${sug.message}</div>` : ''}
    <div class="scheme" style="color:var(--muted);font-size:12px">${ex.scheme}</div>
    <a class="demo" href="${ex.demoUrl}" target="_blank" rel="noopener">▶ demo</a>
    <div class="sets"></div>`;
  const setsHost = el.querySelector('.sets');
  el.addEventListener('pointerover', () =>
    highlightMuscles(document.getElementById('bodymap'), { primary: ex.primary, secondary: ex.secondary }), { once: false });
  sets.forEach((s, i) => setsHost.appendChild(renderSetRow(ex.exId, i, s)));
  return el;
}

function renderSetRow(exId, i, s) {
  const row = document.createElement('div');
  row.className = 'setrow';
  row.innerHTML = `
    <span class="idx">${i + 1}</span>
    <div class="stepper"><button data-d="-2.5">−</button><input type="number" class="w" value="${s.weight}"> kg <button data-d="2.5">+</button></div>
    <div class="stepper"><button data-d="-1">−</button><input type="number" class="r" value="${s.reps}"> reps <button data-d="1">+</button></div>
    <button class="done-toggle ${s.done ? 'done' : ''}">✓</button>`;
  const w = row.querySelector('.w'), r = row.querySelector('.r');
  const btns = row.querySelectorAll('.stepper button');
  btns[0].onclick = () => { w.value = Math.max(0, (+w.value) - 2.5); s.weight = +w.value; };
  btns[1].onclick = () => { w.value = (+w.value) + 2.5; s.weight = +w.value; };
  btns[2].onclick = () => { r.value = Math.max(0, (+r.value) - 1); s.reps = +r.value; };
  btns[3].onclick = () => { r.value = (+r.value) + 1; s.reps = +r.value; };
  w.oninput = () => s.weight = +w.value;
  r.oninput = () => s.reps = +r.value;
  const done = row.querySelector('.done-toggle');
  done.onclick = () => { s.done = !s.done; done.classList.toggle('done', s.done); };
  return row;
}

document.getElementById('save-session').onclick = async () => {
  const entries = currentDay.exercises.map(ex => ({ exId: ex.exId, sets: draft[ex.exId] }));
  const dateISO = new Date().toISOString().slice(0, 10);
  const session = { sessionId: `${dateISO}-${currentDay.dayId}-${Date.now()}`, dateISO, dayId: currentDay.dayId, entries };
  await store.saveSession(session);
  // update PRs
  for (const ex of currentDay.exercises) {
    const best = Math.max(0, ...draft[ex.exId].map(s => s.weight || 0));
    const pr = await store.getPR(ex.exId);
    if (!pr || best > (pr.bestWeight || 0)) await store.upsertPR({ exId: ex.exId, bestWeight: best, dateISO });
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

boot();
```

- [ ] **Step 4: Manual verification**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.
Expected: Day selector lists Day 1–7; selecting a day shows its exercises with pre-filled zero sets, muscle chips, demo links, and the map highlights that day's muscles. Steppers change values. Tapping ✓ marks a set done. "Save session" persists (reload → the just-saved numbers pre-fill next time).

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: app shell and Today view with logging and live muscle map"
```

---

## Task 10: Dashboard view

**Files:**
- Modify: `app.js` (add `renderDashboard`), `index.html` (dashboard markup is built dynamically), `styles.css` (chart styles)

**Interfaces:**
- Consumes: `buildPlanIndex`, `volumeByMuscleForWeek`, `weekStartISO`, `e1rmTrend`, `prHistory` (`src/volume.js`)
- Produces: `window.renderDashboard()` invoked by nav

- [ ] **Step 1: Add chart + dashboard styles to `styles.css`**

```css
.bar { height:18px; background:var(--accent); border-radius:4px; }
.bar-row { display:grid; grid-template-columns:90px 1fr 60px; align-items:center; gap:8px; margin:4px 0; font-size:12px; }
.card { background:var(--card); border-radius:12px; padding:12px; margin:10px 0; }
.card h3 { margin:0 0 8px; font-size:14px; }
.pr { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid #2a2f38; }
```

- [ ] **Step 2: Append dashboard code to `app.js`**

```javascript
import { buildPlanIndex, volumeByMuscleForWeek, weekStartISO, e1rmTrend, prHistory } from './src/volume.js';

window.renderDashboard = async function () {
  const sessions = await store.getSessions();
  const idx = buildPlanIndex(plan);
  const host = document.getElementById('view-dashboard');
  const week = weekStartISO(new Date().toISOString().slice(0, 10));
  const vol = volumeByMuscleForWeek(sessions, idx, week);
  const maxVol = Math.max(1, ...Object.values(vol));

  const volRows = Object.entries(vol).sort((a, b) => b[1] - a[1]).map(([m, v]) =>
    `<div class="bar-row"><span>${m}</span><div class="bar" style="width:${(v / maxVol) * 100}%"></div><span>${Math.round(v)}</span></div>`
  ).join('') || '<p style="color:var(--muted)">No sets logged this week yet.</p>';

  const bigLifts = ['conventional-deadlift', 'barbell-back-squat', 'flat-barbell-bench-press'];
  const prRows = bigLifts.map(exId => {
    const pr = prHistory(sessions, exId);
    const label = (idx.get(exId)?.name) || exId;
    return `<div class="pr"><span>${label}</span><span>best ${pr.bestWeight || 0}kg · e1RM ${pr.bestE1RM || 0}kg</span></div>`;
  }).join('');

  const trend = e1rmTrend(sessions, 'conventional-deadlift');
  const trendTxt = trend.length ? trend.map(t => `${t.dateISO}: ${t.e1rm}kg`).join(' → ') : 'Log a deadlift to start the trend.';

  host.innerHTML = `
    <div class="card"><h3>Weekly volume by muscle (week of ${week})</h3>${volRows}</div>
    <div class="card"><h3>PRs (deadlift seeded at 156kg)</h3>${prRows}</div>
    <div class="card"><h3>Deadlift e1RM trend</h3><p style="font-size:12px;color:var(--muted)">${trendTxt}</p></div>`;
};
```

- [ ] **Step 3: Seed the deadlift PR at boot (so the dashboard shows 156kg before any log)**

In `app.js` `boot()`, after `await store.seedPlanIfEmpty(seed);` add:

```javascript
  if (!(await store.getPR('conventional-deadlift'))) {
    await store.upsertPR({ exId: 'conventional-deadlift', bestWeight: 156, dateISO: '2026-07-01' });
  }
```

- [ ] **Step 4: Manual verification**

Run server, open app, log a session on Day 1, switch to **Dashboard**.
Expected: volume bars appear for chest/triceps etc.; PR card shows deadlift best 156kg; trend line text updates once a deadlift is logged.

- [ ] **Step 5: Commit**

```bash
git add app.js styles.css
git commit -m "feat: dashboard with weekly volume, PRs, and e1RM trend"
```

---

## Task 11: Data view — export / import backup

**Files:**
- Modify: `app.js` (add `renderDataView`)

**Interfaces:**
- Consumes: `serializeBackup`, `parseBackup` (`src/csv.js`); store methods
- Produces: `window.renderDataView()`

- [ ] **Step 1: Append data-view code to `app.js`**

```javascript
import { serializeBackup, parseBackup } from './src/csv.js';

window.renderDataView = async function () {
  const host = document.getElementById('view-data');
  host.innerHTML = `
    <div class="card"><h3>Backup</h3>
      <button id="export-json" class="primary-btn">Export backup (JSON)</button>
      <p style="color:var(--muted);font-size:12px">Your data lives only on this device. Export regularly.</p>
      <input type="file" id="import-file" accept="application/json">
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
    const text = await e.target.files[0].text();
    const state = parseBackup(text);
    for (const s of state.sessions || []) await store.saveSession(s);
    for (const p of state.prs || []) await store.upsertPR(p);
    for (const st of state.settings || []) await store.setSetting(st.key, st.value);
    alert('Backup imported.');
  };
};
```

- [ ] **Step 2: Manual verification**

Open app → **Data** → Export backup downloads a JSON file containing your sessions. Import that file on a fresh browser profile → sessions reappear on the dashboard.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: data view with JSON backup export/import"
```

---

## Task 12: PWA manifest, icons & offline service worker

**Files:**
- Create: `manifest.webmanifest`, `service-worker.js`, `icons/icon-192.png`, `icons/icon-512.png`

**Interfaces:**
- Consumes: all app-shell files
- Produces: installable, offline-capable PWA

- [ ] **Step 1: Create `manifest.webmanifest`**

```json
{
  "name": "IronPyramid",
  "short_name": "IronPyramid",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#14161a",
  "theme_color": "#14161a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run (needs ImageMagick; if unavailable, create any 192/512 PNGs):

```bash
mkdir -p icons
python3 - <<'PY'
# Minimal solid-color PNGs via zlib, no dependencies.
import zlib, struct
def png(path, size, rgb):
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d)&0xffffffff)
    raw = b''.join(b'\x00' + bytes(rgb)*size for _ in range(size))
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    with open(path,'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'); f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(raw))); f.write(chunk(b'IEND', b''))
png('icons/icon-192.png', 192, (224,64,47))
png('icons/icon-512.png', 512, (224,64,47))
print('icons written')
PY
```
Expected: `icons written`; two PNG files exist.

- [ ] **Step 3: Create `service-worker.js`**

```javascript
const CACHE = 'ironpyramid-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './src/db.js', './src/progression.js', './src/volume.js', './src/muscles.js', './src/csv.js', './src/musclemap.js',
  './data/plan.json', './assets/body.svg', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match('./index.html'))));
});
```

- [ ] **Step 4: Manual verification (offline)**

Run server, open app, then in DevTools → Application → Service Workers confirm it's activated. Toggle "Offline" and reload — the app still loads and shows the plan.

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest service-worker.js icons/
git commit -m "feat: PWA manifest, icons, and offline service worker"
```

---

## Task 13: Deploy for iPhone install

**Files:**
- Create: `README.md` (run + deploy instructions)

**Interfaces:**
- Consumes: the full static app
- Produces: a live HTTPS URL installable on iPhone

- [ ] **Step 1: Write `README.md`**

```markdown
# IronPyramid

Offline-first PWA gym tracker. No build step, no dependencies.

## Run locally
    python3 -m http.server 8000
Open http://localhost:8000/

## Rebuild plan.json after editing seed/gym_workout_tracker.csv
    node scripts/build-plan.js

## Test
    node --test

## Deploy (to install on iPhone, HTTPS is required)
Easiest: drag this folder onto https://app.netlify.com/drop — you get an HTTPS URL.
Or via GitHub Pages: push to a GitHub repo, enable Pages on the default branch (root).

## Install on iPhone
Open the HTTPS URL in Safari → Share → Add to Home Screen.
```

- [ ] **Step 2: Verify the production build serves cleanly**

Run: `python3 -m http.server 8000` and load every view (Today, Dashboard, Data). Confirm no console errors.

- [ ] **Step 3: Deploy** (choose one)

- Netlify drop: drag the `ironpyramid/` folder to https://app.netlify.com/drop.
- GitHub Pages: `git remote add origin <repo>` → `git push -u origin main` → enable Pages (branch `main`, folder `/`).

Expected: an HTTPS URL that loads the app.

- [ ] **Step 4: Install on iPhone**

In Safari, open the URL → Share → Add to Home Screen. Launch from the icon; confirm it opens fullscreen and works with airplane mode on (offline).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: run, test, and deploy instructions"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Offline PWA install → Tasks 12, 13.
- Interactive muscle map → Tasks 8, 9.
- Fast set logging (steppers, tap-complete, grouped supersets) → Task 9. *(Supersets render as one exercise card with the compound name from the CSV; component-movement sub-rows are a future enhancement, not required by the acceptance criteria.)*
- Progression engine (prefill + add-weight prompt + e1RM) → Tasks 4, 9.
- Dashboard (weekly volume, e1RM trend, PR history) → Tasks 5, 10.
- Import/export → Tasks 3, 11.
- Deadlift seeded at 156kg → Task 10 Step 3.
- Data model (plan/sessions/prs/settings) → Task 6.
- Testable pure modules → Tasks 2–6, 8.

**Placeholder scan:** No TBD/TODO; every code step contains full code.

**Type consistency:** `exId`/`dayId`/`sessionId` naming, `{weight,reps,done}` set shape, and `{primary,secondary}` muscle arrays are consistent across `db.js`, `progression.js`, `volume.js`, `musclemap.js`, and `app.js`. Store method names (`seedPlanIfEmpty`, `saveSession`, `getSessions`, `upsertPR`, `getPR`, `getAllPRs`, `setSetting`, `getSetting`, `getAllSettings`) match between Task 6 and their callers in Tasks 9–11.

**Known limitations (acceptable for Phase 1):** the SVG is schematic, not anatomical; timed/hold exercises (planks) log reps as seconds; supersets log as a single grouped card.
```
