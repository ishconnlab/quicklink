import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpenCheck, ClipboardCheck, GraduationCap, Radio, SlidersHorizontal, UserRound, Users, UsersRound } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, SectionHeader, StatCard } from '../components/layout.jsx';
import { Badge } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const LEVELS = ['all', 'L3', 'L4', 'L5', 'Bootcamp', 'Training'];

export default function AdminDashboard() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [summary, setSummary] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [level, setLevel] = useState('all');
  const [enrollment, setEnrollment] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/users/dashboard-summary', { params: { level, enrollment } });
      setSummary(response.data.data);
      setTeacherId((current) => response.data.data.teachersByFollowers.some((teacher) => teacher.teacherId === current)
        ? current : response.data.data.teachersByFollowers[0]?.teacherId || '');
    } catch (error) {
      toastRef.current.error(apiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [level, enrollment]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    if (!teacherId) { setFollowers([]); return; }
    let active = true;
    api.get('/users/followers', { params: { teacherId } })
      .then((response) => { if (active) setFollowers(response.data.data.followers); })
      .catch((error) => { if (active) toastRef.current.error(apiError(error).message); });
    return () => { active = false; };
  }, [teacherId]);

  if (loading && !summary) return <PageLoader label="Loading admin dashboard…" />;
  if (!summary) return <EmptyState title="Dashboard could not load" description="Check your connection and try again." action={<button className="btn-primary" onClick={loadSummary}>Try again</button>} />;

  const shortcuts = [
    { to: '/users', title: 'People & accounts', description: 'Approve students, create teachers, and manage access.', icon: UserRound },
    { to: '/registrations', title: 'Registrations', description: 'Review public training forms and enroll applicants.', icon: ClipboardCheck },
    { to: '/classes', title: 'Courses & classes', description: 'Publish courses, assign teachers, and schedule sessions.', icon: BookOpenCheck },
  ];

  return <div>
    <PageHeader
      title="Admin dashboard"
      subtitle="A clear view of enrollment, teaching activity, accounts, certificates, and training registrations."
      actions={<><Link to="/registrations" className="btn-secondary">Review registrations</Link><Link to="/users" className="btn-primary">Manage people</Link></>}
    />

    {summary.pendingRegistrations > 0 && <Link to="/registrations" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-white p-4 shadow-sm transition hover:border-amber-300">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><ClipboardCheck size={19} /></span><div><p className="text-sm font-bold text-amber-950">{summary.pendingRegistrations} registration{summary.pendingRegistrations === 1 ? '' : 's'} waiting</p><p className="text-xs text-amber-700">Review applicants and enroll approved students.</p></div></div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800">Open queue <ArrowRight size={16} /></span>
    </Link>}

    <section className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><SlidersHorizontal size={16} className="text-brand-700" /> Dashboard filters</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Class level</span><select className="input" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option>{LEVELS.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="block"><span className="label">Enrollment status</span><select className="input" value={enrollment} onChange={(event) => setEnrollment(event.target.value)}><option value="all">All active classes</option><option value="open">Open for enrollment</option></select></label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Filters apply to class, enrollment, and live-class counts. Account and certificate totals remain system-wide.</p>
    </section>

    <section className="mb-7">
      <SectionHeader title="Platform overview" description="Key numbers from across your learning workspace." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Active students" value={summary.activeStudents} icon={GraduationCap} />
        <StatCard label="Active teachers" value={summary.activeTeachers} icon={Users} accent="purple" />
        <StatCard label="Active classes" value={summary.activeClasses} icon={BookOpenCheck} />
        <StatCard label="Current enrollments" value={summary.currentEnrollments} icon={UsersRound} accent="green" />
        <StatCard label="Pending registrations" value={summary.pendingRegistrations} icon={ClipboardCheck} accent="amber" />
        <StatCard label="Live classes" value={summary.liveClasses} icon={Radio} accent="amber" />
        <StatCard label="Certificates issued" value={summary.certificatesIssued} icon={Award} accent="green" />
      </div>
    </section>

    <section className="mb-7">
      <SectionHeader title="Workspace shortcuts" description="Jump straight to the areas that keep QuickLink moving." />
      <div className="grid gap-3 md:grid-cols-3">
        {shortcuts.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><Icon size={20} /></span>
          <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Open <ArrowRight size={15} className="transition group-hover:translate-x-0.5" /></span>
        </Link>)}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
      <SectionHeader
        title="Teacher followers"
        description="See which students are following each teacher."
        action={<label className="block w-full sm:w-72"><span className="label">Teacher</span><select className="input" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Select a teacher</option>{summary.teachersByFollowers.map((teacher) => <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.name} · {teacher.followers} followers</option>)}</select></label>}
      />
      {teacherId && followers.length ? <ul className="divide-y divide-slate-100">{followers.map((follower) => <li key={follower.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{follower.name?.slice(0, 1)?.toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{follower.name}</span><span className="block truncate text-xs text-slate-500">{follower.email}</span></span></div><Badge color="brand">Follower</Badge></li>)}</ul> : <EmptyState title={teacherId ? 'No followers yet' : 'No followed teachers yet'} description={teacherId ? 'Students who follow this teacher will appear here.' : 'Teacher follower counts will appear here when students follow them.'} />}
    </section>
  </div>;
}
