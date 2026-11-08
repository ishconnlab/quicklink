import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Award, CreditCard, GraduationCap, PlusCircle, Radio, ReceiptText, Sparkles, UserCheck, Users, Video } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, SectionHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';

const paymentTone = { not_required: 'slate', unpaid: 'amber', pending: 'brand', paid: 'green', rejected: 'red', waived: 'green' };
const paymentLabel = { not_required: 'Not required', unpaid: 'Unpaid', pending: 'Pending review', paid: 'Paid', rejected: 'Rejected', waived: 'Waived' };

export default function AdminDashboard() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, notifications: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const [response, notificationResponse] = await Promise.all([api.get('/admin/dashboard'), api.get('/users/notifications')]);
      setState({ loading: false, data: response.data.data, notifications: notificationResponse.data.data.notifications });
    } catch (error) {
      toast.error(apiError(error).message);
      setState((current) => ({ ...current, loading: false }));
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  if (state.loading && !state.data) return <PageLoader label="Loading your command center…" />;
  if (!state.data) return <EmptyState title="Dashboard could not load" description="Check the server connection and try again." action={<button className="btn-primary" onClick={load}>Try again</button>} />;

  const { stats, recentEnrollments, upcomingTrainings, recentActivity } = state.data;
  const revenue = stats.revenueByCurrency?.length ? stats.revenueByCurrency.map((item) => formatMoney(item.total, item.currency)).join(' · ') : 'No payments recorded';
  const submissionNotifications = state.notifications.filter((item) => ['assignment', 'project'].includes(item.type));

  const markRead = async (item) => {
    try {
      await api.patch(`/users/notifications/${item.id}/read`);
      setState((current) => ({ ...current, notifications: current.notifications.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification) }));
    } catch (error) { toast.error(apiError(error).message); }
  };

  return <div className="quicklink-dashboard">
    <PageHeader
      className="quicklink-dashboard-header"
      eyebrow="Administration"
      title="Training command center"
      subtitle="Monitor enrollments, payments, live sessions, assessments, and certificates across the platform."
      actions={<><Link to="/enrollments?paymentStatus=pending" className="btn-secondary"><CreditCard size={16} />Verify payments</Link><Link to="/courses/new" className="btn-primary"><PlusCircle size={17} />New training</Link></>}
    />

    <section className="mb-7">
      <SectionHeader title="Platform pulse" description="Live totals across every training." icon={Sparkles} />
      <div className="quicklink-dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active students" value={stats.activeStudents} icon={GraduationCap} hint={`${stats.students} total student accounts`} />
        <StatCard label="Active trainings" value={stats.trainings} icon={Video} hint={`${stats.enrollments} current enrollments`} />
        <StatCard label="Pending payments" value={stats.pendingPayments} icon={CreditCard} accent="amber" hint="Waiting for verification" />
        <StatCard label="Live now" value={stats.liveClasses} icon={Radio} accent={stats.liveClasses ? 'red' : 'slate'} hint={stats.liveClasses ? 'Sessions in progress' : 'No live sessions'} />
        <StatCard label="Certificates" value={stats.certificates} icon={Award} accent="green" hint="Valid certificates issued" />
        <StatCard label="Projects" value={stats.projectSubmissions} icon={ReceiptText} accent="purple" hint="Project submissions received" />
      </div>
    </section>

    <section className="mb-6 rounded-2xl border border-green-200 bg-white p-4 sm:p-5">
      <SectionHeader title="Submission inbox" description="New student work sent to the admin team." icon={ReceiptText} action={<Link to="/courses" className="text-sm font-semibold text-brand-700">Open training manager</Link>} />
      {submissionNotifications.length ? <div className="divide-y divide-slate-100">{submissionNotifications.slice(0, 8).map((item) => <div key={item.id} className={`flex min-w-0 items-center gap-3 py-3 ${item.read ? '' : 'bg-green-50/60'}`}><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-800">{item.title}</span><span className="block break-words text-xs leading-4 text-slate-500">{item.message} · {formatDateTime(item.createdAt)}</span></span><Link to={item.href || '/courses'} onClick={() => markRead(item)} className="btn-secondary min-h-9 shrink-0 px-3">Review</Link></div>)}</div> : <p className="text-sm text-slate-500">New assignment and project submissions will appear here.</p>}
    </section>

    <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-green-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow text-emerald-700">Verified revenue</p><p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{revenue}</p><p className="mt-0.5 text-xs text-slate-500">Confirmed and waived enrollments are not included in revenue.</p></div>
        <Link to="/enrollments" className="btn-secondary">Open enrollment ledger <ArrowRight size={15} /></Link>
      </div>
    </section>

    <div className="mb-7 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="rounded-2xl border border-slate-200/80 bg-white">
        <div className="border-b border-slate-100 p-4 sm:p-5"><SectionHeader title="Recent enrollments" description="The latest students who joined a training." action={<Link to="/enrollments" className="text-sm font-semibold text-brand-700">View all</Link>} icon={Users} /></div>
        {recentEnrollments.length ? <div className="divide-y divide-slate-100">{recentEnrollments.map((enrollment) => <div key={enrollment.id} className="flex flex-wrap items-center gap-3 p-4 transition hover:bg-green-50/30">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-brand-800 ring-1 ring-green-100">{enrollment.student?.name?.slice(0, 1)?.toUpperCase() || '?'}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{enrollment.student?.name || 'Student'}</p><p className="truncate text-xs text-slate-500">{enrollment.class?.title || 'Training'} · {formatDateTime(enrollment.enrolledAt)}</p></div>
          <Badge color={paymentTone[enrollment.paymentStatus] || 'slate'}>{paymentLabel[enrollment.paymentStatus] || enrollment.paymentStatus}</Badge>
          {enrollment.paymentReference && <Link to={`/enrollments?search=${encodeURIComponent(enrollment.student?.email || '')}`} className="text-xs font-semibold text-brand-700 hover:underline">Review</Link>}
        </div>)}</div> : <div className="p-5"><EmptyState title="No enrollments yet" description="Student enrollments will appear here." /></div>}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
          <SectionHeader title="Upcoming trainings" description="Scheduled to start soon." icon={Video} />
          {upcomingTrainings.length ? <div className="space-y-2">{upcomingTrainings.map((training) => <Link key={training.id} to={`/courses/${training.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-green-200 hover:bg-green-50/40"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-brand-700"><Video size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{training.title}</span><span className="block text-xs text-slate-500">{formatDateTime(training.startsAt)} · {training.enrolledCount} enrolled</span></span><ArrowRight size={14} className="text-slate-300" /></Link>)}</div> : <p className="text-sm text-slate-500">No upcoming start dates.</p>}
          <Link to="/courses/new" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-green-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-green-50"><PlusCircle size={14} /> Create a training</Link>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
          <SectionHeader title="Quick actions" icon={Sparkles} />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { to: '/enrollments?paymentStatus=pending', label: 'Verify payments', icon: CreditCard },
              { to: '/students', label: 'Manage students', icon: Users },
              { to: '/registrations', label: 'Registration queue', icon: UserCheck },
              { to: '/certificates', label: 'Certificates', icon: Award },
              { to: '/courses', label: 'Manage trainings', icon: GraduationCap },
              { to: '/classes', label: 'Live classes', icon: Radio },
              { to: '/settings', label: 'Platform settings', icon: Activity },
            ].map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-green-200 hover:bg-green-50/40"><Icon size={16} className="text-brand-700" />{label}</Link>)}
          </div>
        </div>
      </section>
    </div>

    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5">
      <SectionHeader title="Recent activity" description="The latest actions across the platform." icon={Activity} action={<Link to="/enrollments" className="text-sm font-semibold text-brand-700">Open operations</Link>} />
      {recentActivity.length ? <ol className="relative space-y-3 border-l border-green-100 pl-4">{recentActivity.map((entry) => <li key={entry.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" /><p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">{entry.actorName || 'System'}</span> {entry.message}</p><p className="mt-0.5 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p></li>)}</ol> : <EmptyState title="No activity yet" description="Actions will appear here as your team manages the platform." />}
    </section>
  </div>;
}
