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
