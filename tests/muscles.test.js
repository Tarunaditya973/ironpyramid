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

test('rear delts do NOT also light front delts', () => {
  assert.deepEqual(normalizeMuscles('Rear Delts'), ['rear-delts']);
});

test('side delts do NOT also light front delts', () => {
  assert.deepEqual(normalizeMuscles('Side Delts'), ['side-delts']);
});

test('"ab" substring match does not spuriously match unrelated words', () => {
  assert.ok(!normalizeMuscles('Cable').includes('abs'));
});
