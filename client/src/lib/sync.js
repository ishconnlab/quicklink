import api, { apiError } from '../api/client.js';
import idb, { STORES } from './db.js';

// Statuses: 'pending' (queued, not yet saved), 'syncing', 'synced', 'failed'.
const listeners = new Set();
let syncing = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn());
}

async function notify() {
  emit();
}

export async function getQueue() {
  const all = await idb.getAll(STORES.QUEUE);
  // Most recent first.
  return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getPendingCount() {
  const all = await idb.getAll(STORES.QUEUE);
  return all.filter((r) => r.status !== 'synced').length;
}

export async function queueRecord(payload) {
  const record = {
    clientId: payload.clientId,
    status: 'pending',
    attempts: 0,
    lastError: null,
    payload,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await idb.put(STORES.QUEUE, record);
  await notify();
  return record;
}

export async function removeRecord(clientId) {
  await idb.delete(STORES.QUEUE, clientId);
  await notify();
}

export async function updateRecord(clientId, patch) {
  const existing = await idb.get(STORES.QUEUE, clientId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  await idb.put(STORES.QUEUE, updated);
  await notify();
  return updated;
}

/**
 * Attempt to synchronize all queued records.
 * Returns { synced, failed, remaining }.
 * A record is only ever marked 'synced' after the server returns success, so
 * the UI never shows "saved" before MongoDB confirms the write.
 */
export async function syncPending() {
  if (syncing) return { syncing: true };
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, offline: true };
  }

  syncing = true;
  await notify();

  const queue = await getQueue();
  const toSync = queue.filter((r) => r.status === 'pending' || r.status === 'failed');
  let synced = 0;
  let failed = 0;

  for (const record of toSync) {
    await updateRecord(record.clientId, { status: 'syncing' });
    try {
      // confirmDuplicate avoids a 409 when the same offline record is retried.
      const res = await api.post('/schools', {
        ...record.payload,
        clientId: record.clientId,
        confirmDuplicate: true,
      });
      if (res.data?.success) {
        await idb.put(STORES.QUEUE, {
          ...record,
          status: 'synced',
          serverId: res.data.data.school.id,
          syncedAt: Date.now(),
          lastError: null,
          updatedAt: Date.now(),
        });
        synced += 1;
      } else {
        throw new Error('Unexpected response');
      }
    } catch (err) {
      const info = apiError(err);
      failed += 1;
      await updateRecord(record.clientId, {
        status: info.offline ? 'pending' : 'failed',
        attempts: (record.attempts || 0) + 1,
        lastError: info.message,
      });
      if (info.offline) break; // stop early if connectivity dropped
    }
  }

  syncing = false;
  await notify();
  return { synced, failed, remaining: toSync.length - synced };
}

export function isSyncing() {
  return syncing;
}
