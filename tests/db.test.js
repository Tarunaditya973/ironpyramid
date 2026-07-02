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

test('getPlan sorts days numerically, not lexically', async () => {
  const store = createStore(memoryBackend());
  const plan = [
    { dayId: 'day-2', focus: 'Back', exercises: [] },
    { dayId: 'day-10', focus: 'Legs', exercises: [] },
    { dayId: 'day-1', focus: 'Chest', exercises: [] },
  ];
  await store.seedPlanIfEmpty(plan);
  const got = await store.getPlan();
  assert.deepEqual(got.map(d => d.dayId), ['day-1', 'day-2', 'day-10']);
});

test('reseedPlan overwrites existing plan days', async () => {
  const store = createStore(memoryBackend());
  await store.seedPlanIfEmpty([{ dayId: 'day-1', focus: 'Old', exercises: [] }]);
  await store.reseedPlan([{ dayId: 'day-1', focus: 'New', exercises: [{ exId: 'x' }] }]);
  const p = await store.getPlan();
  assert.equal(p[0].focus, 'New');
  assert.equal(p[0].exercises.length, 1);
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
