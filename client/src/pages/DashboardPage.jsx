import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  School as SchoolIcon,
  Users,
  Laptop,
  GraduationCap,
  AlertTriangle,
  Plus,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, StatCard } from '../components/layout.jsx';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { formatNumber, formatDate, TRADE_LABELS, TRADE_KEYS } from '../lib/format.js';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { online, pendingCount, syncNow } = useSync();

  useEffect(() => {
    let active = true;
    api
      .get('/dashboard')
      .then((res) => active && setData(res.data.data))
      .catch((err) => active && toast.error(apiError(err).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageLoader label="Loading dashboard…" />;
  if (!data) return null;

  const { totals, recent, byHolding, byDistrict, incompleteSchools } = data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live statistics from MongoDB"
        actions={
          <>
            <button
              onClick={() => syncNow()}
              className="btn-secondary"
              disabled={!online || pendingCount === 0}
            >
              Sync{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
            <Link to="/schools/new" className="btn-primary">
              <Plus size={18} /> New school
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Holdings" value={formatNumber(totals.holdings)} icon={Building2} />
        <StatCard label="Schools" value={formatNumber(totals.schools)} icon={SchoolIcon} accent="purple" />
        <StatCard label="Students" value={formatNumber(totals.students)} icon={Users} accent="green" />
        <StatCard label="Laptops" value={formatNumber(totals.laptops)} icon={Laptop} accent="brand" />
        <StatCard label="Teachers" value={formatNumber(totals.teachers)} icon={GraduationCap} accent="slate" />
        <StatCard
          label="Incomplete"
          value={formatNumber(totals.incomplete)}
          icon={AlertTriangle}
          accent="amber"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Students by trade</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TRADE_KEYS.map((key) => (
              <div key={key} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs font-medium uppercase text-slate-400">{TRADE_LABELS[key]}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatNumber(totals.trades[key])}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-900">Data quality</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Active records</span>
              <span className="font-semibold">{formatNumber(totals.schools)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Archived</span>
              <span className="font-semibold">{formatNumber(totals.archivedSchools)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Incomplete</span>
              <span className="font-semibold text-amber-600">
                {formatNumber(totals.incomplete)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Pending sync</span>
              <span className="font-semibold text-brand-600">{pendingCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">By holding / project</h2>
          </div>
          {byHolding.length === 0 ? (
            <p className="text-sm text-slate-400">No records yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byHolding.map((h) => (
                <li key={h.id || h.name} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{h.name}</p>
                    <p className="text-xs text-slate-400">{h.schools} school(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatNumber(h.students)}</p>
                    <p className="text-xs text-slate-400">students</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">By district</h2>
          {byDistrict.length === 0 ? (
            <p className="text-sm text-slate-400">No records yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byDistrict.map((d) => (
                <li key={d.district} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin size={14} className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{d.district}</p>
                      <p className="text-xs text-slate-400">{d.schools} school(s)</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{formatNumber(d.students)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recently recorded</h2>
            <Link to="/schools" className="flex items-center gap-1 text-xs font-medium text-brand-600">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400">No records yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/schools/${s.id}`}
                    className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{s.schoolName}</p>
                      <p className="truncate text-xs text-slate-400">
                        {s.district} · {formatDate(s.dateOfCollection)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatNumber(s.totalStudents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Schools with incomplete data</h2>
          </div>
          {incompleteSchools.length === 0 ? (
            <p className="text-sm text-slate-400">All records are complete.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {incompleteSchools.map((s) => (
                <li key={s.id} className="py-2.5">
                  <Link to={`/schools/${s.id}`} className="block hover:opacity-80">
                    <p className="truncate text-sm font-medium text-slate-800">{s.schoolName}</p>
                    <p className="text-xs text-amber-600">
                      Missing:{' '}
                      {s.incompleteFields
                        .map((f) => f.replace('trades.', '').toUpperCase())
                        .join(', ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
