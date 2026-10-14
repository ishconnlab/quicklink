import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  getQueue,
  getPendingCount,
  syncPending,
  subscribe,
  queueRecord,
  removeRecord,
  isSyncing,
} from '../lib/sync.js';
import { useToast } from './ToastContext.jsx';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const wasOffline = useRef(!navigator.onLine);

  const refresh = useCallback(async () => {
    const [q, count] = await Promise.all([getQueue(), getPendingCount()]);
    setQueue(q);
    setPendingCount(count);
    setSyncing(isSyncing());
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);

  const runSync = useCallback(
    async (silent = false) => {
      const result = await syncPending();
      await refresh();
      if (!silent) {
        if (result.offline) {
          toast.info('Still offline — records stay queued until connection returns.');
        } else if (result.synced > 0) {
          toast.success(`${result.synced} record(s) synced to the server.`);
        } else if (result.failed > 0) {
          toast.error(`${result.failed} record(s) failed to sync.`);
        } else if (result.remaining === 0) {
          toast.info('Everything is already up to date.');
        }
      }
      return result;
    },
    [refresh, toast]
  );

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true);
      if (wasOffline.current) {
        toast.success('Back online — syncing pending records…');
        wasOffline.current = false;
      }
      await runSync(true).then((r) => {
        if (r?.synced > 0) toast.success(`${r.synced} pending record(s) synced.`);
        if (r?.failed > 0) toast.error(`${r.failed} record(s) could not be synced.`);
      });
    };
    const handleOffline = () => {
      setOnline(false);
      wasOffline.current = true;
      toast.info('Offline mode — new records will be saved locally and synced later.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync, toast]);

  // Periodically attempt sync when there are pending items and we're online.
  useEffect(() => {
    if (!online || pendingCount === 0) return undefined;
    const id = setInterval(() => runSync(true), 30000);
    return () => clearInterval(id);
  }, [online, pendingCount, runSync]);

  const enqueue = useCallback(
    async (payload) => {
      const record = await queueRecord(payload);
      await refresh();
      return record;
    },
    [refresh]
  );

  const discard = useCallback(
    async (clientId) => {
      await removeRecord(clientId);
      await refresh();
    },
    [refresh]
  );

  return (
    <SyncContext.Provider
      value={{ online, queue, pendingCount, syncing, syncNow: () => runSync(false), enqueue, discard, refresh }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
