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
