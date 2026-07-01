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
