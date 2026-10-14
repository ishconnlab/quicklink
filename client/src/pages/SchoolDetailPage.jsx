import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Clock,
  MapPin,
  Building2,
  CalendarDays,
  FileText,
  Laptop,
  GraduationCap,
  UserCircle,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  displayCount,
  TRADE_KEYS,
  TRADE_LABELS,
} from '../lib/format.js';

export default function SchoolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [school, setSchool] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        api.get(`/schools/${id}`),
        api.get(`/schools/${id}/history`),
      ]);
      setSchool(s.data.data.school);
      setHistory(h.data.data.history);
    } catch (err) {
      toast.error(apiError(err).message);
      navigate('/schools', { replace: true });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArchive = async () => {
    setActing(true);
    try {
      const action = school.status === 'archived' ? 'restore' : 'archive';
      await api.post(`/schools/${id}/${action}`);
      toast.success(`School ${action === 'archive' ? 'archived' : 'restored'}.`);
      load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <PageLoader label="Loading school record…" />;
  if (!school) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <PageHeader
        title={school.schoolName}
        subtitle={school.holding.name}
        actions={
          <>
            <Link to={`/schools/${id}/edit`} className="btn-secondary">
              <Pencil size={16} /> Edit
            </Link>
            <button
              onClick={toggleArchive}
              disabled={acting}
              className={school.status === 'archived' ? 'btn-primary' : 'btn-secondary'}
            >
              {acting ? (
                <Spinner size={16} />
              ) : school.status === 'archived' ? (
                <ArchiveRestore size={16} />
              ) : (
                <Archive size={16} />
              )}
              {school.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {school.status === 'archived' ? (
          <Badge color="slate">Archived</Badge>
        ) : (
          <Badge color="green">Active</Badge>
        )}
        {school.isIncomplete ? (
          <Badge color="amber">
            <AlertTriangle size={11} /> Incomplete data
          </Badge>
        ) : (
          <Badge color="brand">Complete</Badge>
        )}
        {school.clientId && <Badge color="slate">Offline record</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card sm:col-span-2">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="flex items-center gap-1 text-xs uppercase text-slate-400">
                <MapPin size={12} /> District
              </p>
              <p className="mt-1 font-medium text-slate-800">{school.district}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs uppercase text-slate-400">
                <CalendarDays size={12} /> Collected
              </p>
              <p className="mt-1 font-medium text-slate-800">
                {formatDate(school.dateOfCollection)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs uppercase text-slate-400">
                <Laptop size={12} /> Laptops
              </p>
              <p className="mt-1 font-medium text-slate-800">{displayCount(school.laptops)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs uppercase text-slate-400">
                <GraduationCap size={12} /> Teachers
              </p>
              <p className="mt-1 font-medium text-slate-800">{displayCount(school.teachers)}</p>
            </div>
          </div>
        </div>

        <div className="card sm:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Students by trade</h2>
            <Badge color="brand">Total: {formatNumber(school.totalStudents)}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TRADE_KEYS.map((k) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs font-medium uppercase text-slate-400">{TRADE_LABELS[k]}</p>
                <p
                  className={`mt-1 text-lg font-bold ${
                    school.trades[k] === null ? 'text-amber-500' : 'text-slate-900'
                  }`}
                >
                  {displayCount(school.trades[k])}
                </p>
              </div>
            ))}
          </div>
          {school.isIncomplete && (
            <p className="mt-3 text-xs text-amber-600">
              Missing values:{' '}
              {school.incompleteFields
                .map((f) => f.replace('trades.', '').toUpperCase())
                .join(', ')}
              . Unknown values are not counted as zero.
            </p>
          )}
        </div>

        {school.feedback && (
          <div className="card sm:col-span-2">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText size={16} /> Additional feedback
            </h2>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{school.feedback}</p>
          </div>
        )}

        <div className="card sm:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserCircle size={16} /> Record metadata
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-slate-400">Recorded by</dt>
              <dd className="mt-0.5 text-slate-700">{school.recordedByName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Created</dt>
              <dd className="mt-0.5 text-slate-700">{formatDateTime(school.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Updated</dt>
              <dd className="mt-0.5 text-slate-700">{formatDateTime(school.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Record ID</dt>
              <dd className="mt-0.5 truncate font-mono text-xs text-slate-500">{school.id}</dd>
            </div>
          </dl>
        </div>

        <div className="card sm:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock size={16} /> Change history
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No history recorded.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                  <p className="text-sm font-medium capitalize text-slate-800">{h.action}</p>
                  <p className="text-xs text-slate-400">
                    {h.actorName || 'System'} · {formatDateTime(h.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
