import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Download,
  Pencil,
  Trash2,
  GraduationCap,
  BadgeCheck,
  Users,
  UserCheck,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal, StatCard } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { TRADE_KEYS, TRADE_LABELS } from '../lib/format.js';

const STATUS_OPTIONS = [
  { key: '', label: 'All statuses' },
  { key: 'enrolled', label: 'Enrolled' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'transferred', label: 'Transferred' },
  { key: 'dropped', label: 'Dropped' },
];

const STATUS_COLORS = {
  enrolled: 'green',
  graduated: 'brand',
  transferred: 'amber',
  dropped: 'red',
};

export default function StudentsPage() {
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [trade, setTrade] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [acting, setActing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (debounced) params.search = debounced;
      if (status) params.status = status;
      if (trade) params.trade = trade;
      const [listRes, statsRes] = await Promise.all([
        api.get('/students', { params }),
        api.get('/students/stats'),
      ]);
      setStudents(listRes.data.data.students);
      setStats(statsRes.data.data);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status, trade]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (status) params.status = status;
      if (trade) params.trade = trade;
      const res = await api.get('/students/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-register-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setActing(true);
    try {
      await api.delete(`/students/${confirm.id}`);
      toast.success('Student removed.');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setActing(false);
    }
  };

  const tradeLabel = (t) => TRADE_LABELS[t] || t || '—';

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Learner enrolment, trades and certification readiness"
        actions={
          <>
            <button onClick={exportCsv} disabled={exporting} className="btn-secondary">
              <Download size={16} /> Export register
            </button>
            <Link to="/students/new" className="btn-primary">
              <Plus size={16} /> Add student
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total learners" value={stats?.total ?? 0} icon={Users} />
        <StatCard
          label="Certification ready"
          value={stats?.certificationReady ?? 0}
          icon={BadgeCheck}
          accent="green"
          hint="Eligible for NESA / RTB exams"
        />
        <StatCard label="Enrolled" value={stats?.byStatus?.enrolled ?? 0} icon={UserCheck} />
        <StatCard
          label="Graduated"
          value={stats?.byStatus?.graduated ?? 0}
          icon={GraduationCap}
          accent="purple"
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, index number or school…"
            className="input pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input sm:w-44">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={trade} onChange={(e) => setTrade(e.target.value)} className="input sm:w-40">
          <option value="">All trades</option>
          {TRADE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TRADE_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <PageLoader label="Loading students…" />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          description="Add learners to a school to track enrolment, trades and certification readiness."
          action={
            <Link to="/students/new" className="btn-primary">
              <Plus size={16} /> Add student
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Index no.</th>
                  <th className="px-4 py-3 font-medium">Full name</th>
                  <th className="px-4 py-3 font-medium">School</th>
                  <th className="px-4 py-3 font-medium">Trade</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.indexNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{s.fullName}</span>
                        {s.certificationReady && (
                          <BadgeCheck size={15} className="text-brand-600" title="Certification ready" />
                        )}
                      </div>
                      {s.guardianPhone && (
                        <p className="text-xs text-slate-400">{s.guardianPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.schoolName}</td>
                    <td className="px-4 py-3 text-slate-600">{tradeLabel(s.trade)}</td>
                    <td className="px-4 py-3 text-slate-600">{s.level || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_COLORS[s.status] || 'slate'}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/students/${s.id}/edit`}
                          className="btn-ghost p-2"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </Link>
                        <button
                          onClick={() => setConfirm(s)}
                          className="btn-ghost p-2 text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 sm:hidden">
            {students.map((s) => (
              <li key={s.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                      {s.fullName}
                      {s.certificationReady && (
                        <BadgeCheck size={15} className="text-brand-600" />
                      )}
                    </p>
                    <p className="font-mono text-xs text-slate-400">{s.indexNumber}</p>
                    <p className="mt-1 text-sm text-slate-600">{s.schoolName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tradeLabel(s.trade)} · {s.level || 'No level'}
                    </p>
                  </div>
                  <Badge color={STATUS_COLORS[s.status] || 'slate'}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Link to={`/students/${s.id}/edit`} className="btn-secondary px-3 py-1.5 text-xs">
                    <Pencil size={14} /> Edit
                  </Link>
                  <button
                    onClick={() => setConfirm(s)}
                    className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove student"
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={remove} disabled={acting} className="btn-primary bg-red-600 hover:bg-red-700">
              Remove
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold">{confirm?.fullName}</span> from the register? This
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
