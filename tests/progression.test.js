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
