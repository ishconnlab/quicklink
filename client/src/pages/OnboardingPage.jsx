import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  FileStack,
  CheckCircle2,
  Clock,
  GraduationCap,
  BadgeCheck,
  ListChecks,
  Plus,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, StatCard, Badge } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDate } from '../lib/format.js';

const STATUS_COLORS = {
  draft: 'slate',
  submitted: 'amber',
  under_review: 'amber',
  incomplete: 'red',
  accepted: 'brand',
  rejected: 'red',
  enrolled: 'green',
};

export default function OnboardingPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get('/onboarding');
        if (active) setData(res.data.data);
      } catch (err) {
        toast.error(apiError(err).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageLoader label="Loading onboarding…" />;

  const apps = data?.applications || {};
  const reqs = data?.requirements || {};

  return (
    <div>
      <PageHeader
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        actions={
          <Link to="/admissions/new" className="btn-primary">
            <Plus size={16} /> {t('admissions.new')}
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Published packs" value={data?.packs?.published ?? 0} icon={FileStack} />
        <StatCard
          label="Awaiting decision"
          value={apps.awaitingDecision ?? 0}
          icon={Clock}
          accent="amber"
        />
        <StatCard label="Accepted" value={apps.accepted ?? 0} icon={CheckCircle2} accent="purple" />
        <StatCard
          label="Enrolled"
          value={apps.enrolled ?? 0}
          icon={GraduationCap}
          accent="green"
        />
        <StatCard label="Applications" value={apps.total ?? 0} icon={ClipboardList} />
        <StatCard label="Learners" value={data?.students ?? 0} icon={GraduationCap} />
        <StatCard
          label="Checklist ready"
          value={`${reqs.completion ?? 100}%`}
          icon={ListChecks}
          accent="green"
          hint={`${reqs.verified ?? 0} verified · ${reqs.ready ?? 0} ready`}
        />
        <StatCard
          label="Needs verification"
          value={reqs.needsVerification ?? 0}
          icon={BadgeCheck}
          accent="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent applications</h2>
            <Link to="/admissions" className="text-xs font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {(data?.recentApplications || []).length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No applications yet"
              description="Create an admission pack, then start receiving applications."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentApplications.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/admissions/${a.id}`}
                      className="truncate text-sm font-medium text-slate-800 hover:text-brand-700"
                    >
                      {a.fullName}
                    </Link>
                    <p className="truncate text-xs text-slate-400">
                      {a.reference} · {a.schoolName}
                    </p>
                  </div>
                  <Badge color={STATUS_COLORS[a.status] || 'slate'}>
                    {t(`admissions.status.${a.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Recent activity</h2>
          {(data?.recentEvents || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-slate-700">
                      <span className="font-medium capitalize">{e.entityType}</span> · {e.action}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
