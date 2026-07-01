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
