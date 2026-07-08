import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionIdsFor } from '../src/musclemap.js';

test('regionIdsFor returns front, back and paired ids', () => {
  assert.deepEqual(regionIdsFor(['chest']).sort(),
    ['b-chest', 'b-chest-r', 'f-chest', 'f-chest-r']);
});
