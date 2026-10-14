// Minimal promise-based IndexedDB wrapper used for offline drafts and the
// synchronization queue. No external dependency required.

const DB_NAME = 'quicklink';
const DB_VERSION = 1;
export const STORES = { DRAFTS: 'drafts', QUEUE: 'syncQueue', META: 'meta' };

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
        db.createObjectStore(STORES.DRAFTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const store = db.createObjectStore(STORES.QUEUE, { keyPath: 'clientId' });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const result = fn(objectStore);
    transaction.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const idb = {
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  delete: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  getAllByStatus: (store, status) =>
    tx(store, 'readonly', (s) => s.index('status').getAll(status)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};

// Stable client id for offline records.
export function makeClientId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `ql-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default idb;
