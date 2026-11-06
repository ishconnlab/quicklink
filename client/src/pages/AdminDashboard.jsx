import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, BookOpenCheck, ClipboardCheck, GraduationCap, Radio, Users, UsersRound } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, StatCard } from '../components/layout.jsx';
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

  return <div>
    <PageHeader title="Admin dashboard" subtitle="Enrollment, account, class, certificate, and teacher-following activity." />
    <div className="mb-5 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 sm:items-end">
      <label className="block"><span className="label">Class level</span><select className="input" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option>{LEVELS.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="block"><span className="label">Enrollment status</span><select className="input" value={enrollment} onChange={(event) => setEnrollment(event.target.value)}><option value="all">All active classes</option><option value="open">Open for enrollment</option></select></label>
      <p className="text-xs text-slate-500 sm:col-span-2">Filters apply to class, enrollment, and live-class counts. Account and certificate totals remain system-wide.</p>
    </div>
    <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <StatCard label="Active students" value={summary.activeStudents} icon={GraduationCap} />
      <StatCard label="Active teachers" value={summary.activeTeachers} icon={Users} accent="purple" />
      <StatCard label="Active classes" value={summary.activeClasses} icon={BookOpenCheck} />
      <StatCard label="Current enrollments" value={summary.currentEnrollments} icon={UsersRound} accent="green" />
      <StatCard label="Pending registrations" value={summary.pendingRegistrations} icon={ClipboardCheck} accent="amber" />
      <StatCard label="Live classes" value={summary.liveClasses} icon={Radio} accent="amber" />
      <StatCard label="Certificates issued" value={summary.certificatesIssued} icon={Award} accent="green" />
    </div>
    <section className="card">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-semibold text-slate-900">Teacher followers</h2><p className="mt-1 text-sm text-slate-500">See which students follow each teacher.</p></div>
        <label className="block w-full sm:max-w-sm"><span className="label">Teacher</span><select className="input" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Select a teacher</option>{summary.teachersByFollowers.map((teacher) => <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.name} · {teacher.followers} followers</option>)}</select></label>
      </div>
      {teacherId && followers.length ? <ul className="divide-y divide-slate-100">{followers.map((follower) => <li key={follower.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-medium text-slate-800">{follower.name}</span><span className="text-slate-500">{follower.email}</span></li>)}</ul> : <EmptyState title={teacherId ? 'No followers yet' : 'No followed teachers yet'} description={teacherId ? 'Students who follow this teacher will appear here.' : 'Teacher follower counts will appear here when students follow them.'} />}
    </section>
  </div>;
}
