import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Download, ClipboardList, Clock, CheckCircle2, GraduationCap } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, StatCard } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';

const STATUS_OPTIONS = ['', 'submitted', 'under_review', 'incomplete', 'accepted', 'rejected', 'enrolled'];
const STATUS_COLORS = {
  draft: 'slate',
  submitted: 'amber',
  under_review: 'amber',
  incomplete: 'red',
  accepted: 'brand',
  rejected: 'red',
  enrolled: 'green',
};

export default function AdmissionsPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
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
      const [listRes, statsRes] = await Promise.all([
        api.get('/admissions', { params }),
        api.get('/admissions/stats'),
      ]);
      setApps(listRes.data.data.applications);
      setStats(statsRes.data.data);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (status) params.status = status;
      const res = await api.get('/admissions/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `admissions-${new Date().toISOString().slice(0, 10)}.csv`;
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

  return (
    <div>
      <PageHeader
        title={t('admissions.title')}
        subtitle={t('admissions.subtitle')}
        actions={
          <>
            <button onClick={exportCsv} disabled={exporting} className="btn-secondary">
              <Download size={16} /> Export
            </button>
            <Link to="/admissions/new" className="btn-primary">
              <Plus size={16} /> {t('admissions.new')}
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Applications" value={stats?.total ?? 0} icon={ClipboardList} />
        <StatCard
          label="Awaiting decision"
          value={(stats?.byStatus?.submitted ?? 0) + (stats?.byStatus?.under_review ?? 0)}
          icon={Clock}
          accent="amber"
        />
        <StatCard label="Accepted" value={stats?.byStatus?.accepted ?? 0} icon={CheckCircle2} accent="purple" />
        <StatCard label="Enrolled" value={stats?.byStatus?.enrolled ?? 0} icon={GraduationCap} accent="green" />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admissions.search')}
            className="input pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input sm:w-52">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {t(`admissions.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <PageLoader label="Loading applications…" />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No applications yet"
          description="Create an admission pack, then record applications to review and enrol learners."
          action={
            <Link to="/admissions/new" className="btn-primary">
              <Plus size={16} /> {t('admissions.new')}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/admissions/${a.id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                    {a.fullName}
                  </Link>
                  <p className="font-mono text-xs text-slate-400">{a.reference}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {a.schoolName}
                    {a.level ? ` · ${a.level}` : ''}
                  </p>
                  {a.guardian?.phone && (
                    <p className="text-xs text-slate-400">Guardian: {a.guardian.phone}</p>
                  )}
                </div>
                <Badge color={STATUS_COLORS[a.status] || 'slate'}>{t(`admissions.status.${a.status}`)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
