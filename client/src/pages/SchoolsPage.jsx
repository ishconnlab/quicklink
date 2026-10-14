import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Filter,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Pencil,
  Eye,
  School as SchoolIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatNumber, displayCount } from '../lib/format.js';

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export default function SchoolsPage() {
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('active');
  const [district, setDistrict] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [acting, setActing] = useState(false);
  const toast = useToast();
  const debounceRef = useRef();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, status, limit: 15 };
      if (debounced) params.search = debounced;
      if (district) params.district = district;
      if (incompleteOnly) params.incomplete = 'true';
      const res = await api.get('/schools', { params });
      setSchools(res.data.data.schools);
      setPagination(res.data.data.pagination);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, debounced, district, incompleteOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArchive = async () => {
    if (!confirm) return;
    setActing(true);
    try {
      const action = confirm.status === 'archived' ? 'restore' : 'archive';
      await api.post(`/schools/${confirm.id}/${action}`);
      toast.success(`School ${action === 'archive' ? 'archived' : 'restored'} successfully.`);
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Schools"
        subtitle={`${formatNumber(pagination.total)} record(s)`}
        actions={
          <Link to="/schools/new" className="btn-primary">
            <Plus size={18} /> New school
          </Link>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search school, district, holding…"
            className="input pl-9"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`btn-secondary ${showFilters ? 'ring-brand-400' : ''}`}
          aria-label="Filters"
        >
          <Filter size={18} />
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      <div className="mb-3 flex items-center gap-1 rounded-xl bg-slate-200/60 p-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setStatus(t.key);
              setPage(1);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              status === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="card mb-3 animate-fade-in">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">District</label>
              <input
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by district"
                className="input"
              />
            </div>
            <label className="flex items-end gap-2 pb-2.5">
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(e) => {
                  setIncompleteOnly(e.target.checked);
                  setPage(1);
                }}
                className="h-5 w-5 rounded border-slate-300 text-brand-600"
              />
              <span className="text-sm text-slate-700">Only incomplete records</span>
            </label>
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading schools…" />
      ) : schools.length === 0 ? (
        <EmptyState
          icon={SchoolIcon}
          title="No schools found"
          description="Adjust your search or add a new school record."
          action={
            <Link to="/schools/new" className="btn-primary">
              <Plus size={18} /> New school
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {schools.map((s) => (
            <div key={s.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/schools/${s.id}`}
                    className="truncate font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {s.schoolName}
                  </Link>
                  {s.isIncomplete && (
                    <Badge color="amber">
                      <AlertTriangle size={11} /> Incomplete
                    </Badge>
                  )}
                  {s.status === 'archived' && <Badge color="slate">Archived</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {s.holding.name} · {s.district} · {formatDate(s.dateOfCollection)}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    Total: <b className="text-slate-800">{formatNumber(s.totalStudents)}</b>
                  </span>
                  <span>
                    Laptops: <b className="text-slate-800">{displayCount(s.laptops)}</b>
                  </span>
                  <span>
                    Teachers: <b className="text-slate-800">{displayCount(s.teachers)}</b>
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link to={`/schools/${s.id}`} className="btn-ghost p-2.5" aria-label="View">
                  <Eye size={16} />
                </Link>
                <Link to={`/schools/${s.id}/edit`} className="btn-ghost p-2.5" aria-label="Edit">
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setConfirm(s)}
                  className="btn-ghost p-2.5"
                  aria-label={s.status === 'archived' ? 'Restore' : 'Archive'}
                >
                  {s.status === 'archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-secondary"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="btn-secondary"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.status === 'archived' ? 'Restore school' : 'Archive school'}
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={toggleArchive}
              disabled={acting}
              className={confirm?.status === 'archived' ? 'btn-primary' : 'btn-danger'}
            >
              {confirm?.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {confirm?.status === 'archived'
            ? 'This record will become active again and appear in dashboards and reports.'
            : 'This record will be kept in the database but hidden from dashboards and default reports. You can restore it at any time.'}
        </p>
        <p className="mt-2 text-sm font-medium text-slate-900">{confirm?.schoolName}</p>
      </Modal>
    </div>
  );
}
