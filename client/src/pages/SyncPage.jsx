import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Plus,
  CloudUpload,
} from 'lucide-react';
import { PageHeader, Badge } from '../components/layout.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { formatDateTime, formatNumber } from '../lib/format.js';

const STATUS = {
  pending: { label: 'Pending Sync', color: 'amber', Icon: Clock },
  syncing: { label: 'Syncing…', color: 'brand', Icon: RefreshCw },
  synced: { label: 'Synced', color: 'green', Icon: CheckCircle2 },
  failed: { label: 'Sync Failed', color: 'red', Icon: AlertTriangle },
};

export default function SyncPage() {
  const { online, queue, pendingCount, syncing, syncNow, discard, refresh } = useSync();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleSync = async () => {
    setWorking(true);
    await syncNow();
    setWorking(false);
  };

  const totalTrades = (rec) =>
    ['sod', 'nit', 'csa', 'acc', 'other'].reduce(
      (a, k) => a + (Number(rec.payload?.trades?.[k]) || 0),
      0
    );

  return (
    <div>
      <PageHeader
        title="Offline sync"
        subtitle="Records captured on this device"
        actions={
          <button
            onClick={handleSync}
            disabled={!online || syncing || working || pendingCount === 0}
            className="btn-primary"
          >
            {syncing || working ? <RefreshCw size={18} className="animate-spin" /> : <CloudUpload size={18} />}
            Sync now
          </button>
        }
      />

      <div
        className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
          online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
        }`}
      >
        {online ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
        <span>
          {online
            ? `Online. ${pendingCount} record(s) awaiting sync.`
            : 'Offline. Records captured now are stored on this device and sync automatically when you reconnect.'}
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
          <CloudUpload size={36} className="mb-3 text-slate-300" />
          <p className="font-semibold text-slate-800">No locally captured records</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Records created while offline will appear here with their sync status.
          </p>
          <Link to="/schools/new" className="btn-primary mt-4">
            <Plus size={18} /> New school
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((rec) => {
            const meta = STATUS[rec.status] || STATUS.pending;
            const Icon = meta.Icon;
            return (
              <div key={rec.clientId} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">
                        {rec.payload?.schoolName || 'Untitled record'}
                      </p>
                      <Badge color={meta.color}>
                        <Icon size={11} className={rec.status === 'syncing' ? 'animate-spin' : ''} />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {rec.payload?.holding} · {rec.payload?.district}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Total students: {formatNumber(totalTrades(rec))} · Captured{' '}
                      {formatDateTime(rec.createdAt)}
                      {rec.attempts > 0 ? ` · ${rec.attempts} attempt(s)` : ''}
                    </p>
                    {rec.lastError && (
                      <p className="mt-1 text-xs text-red-600">{rec.lastError}</p>
                    )}
                  </div>
                  {rec.status !== 'syncing' && (
                    <button
                      onClick={() => discard(rec.clientId)}
                      className="btn-ghost p-2 text-slate-400 hover:text-red-600"
                      title="Remove from queue"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
