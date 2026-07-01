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
