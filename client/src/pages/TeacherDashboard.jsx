import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpenCheck, CalendarDays, ClipboardCheck, FileText, Radio, UsersRound } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, SectionHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const boundaries = (period) => {
  const end = new Date();
  const start = new Date(end);
  if (period === 'daily') start.setHours(0, 0, 0, 0);
  if (period === 'weekly') { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); }
  if (period === 'monthly') { start.setHours(0, 0, 0, 0); start.setDate(1); }
  return { from: start.toISOString(), to: end.toISOString() };
};

export default function TeacherDashboard() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [classes, setClasses] = useState([]);
  const [work, setWork] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [classResponse, followerResponse] = await Promise.all([
        api.get('/classes', { params: { limit: 100 } }),
        api.get('/users/followers'),
      ]);
      const classData = classResponse.data.data.classes;
      setClasses(classData);
      setFollowers(followerResponse.data.data.followers);
      const settled = await Promise.allSettled(classData.map(async (item) => {
        const [assignmentResponse, certificateResponse] = await Promise.all([
          api.get(`/classes/${item.id}/assignments`), api.get(`/courses/${item.id}/certificates`),
        ]);
        return { classItem: item, assignments: assignmentResponse.data.data.assignments, certificates: certificateResponse.data.data.certificates };
      }));
      const results = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      setWork(results.flatMap(({ classItem, assignments }) => assignments.map((assignment) => ({ ...assignment, classItem }))));
      setCertificates(results.flatMap(({ classItem, certificates: rows }) => rows.map((certificate) => ({ ...certificate, classItem }))));
      const rejected = settled.filter((result) => result.status === 'rejected').length;
      if (rejected) toastRef.current.error('Some class summaries could not load. Open the class to retry its details.');
    } catch (error) {
      const message = apiError(error).message;
      setLoadError(message);
      toastRef.current.error(message);
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const downloadReport = async (classItem, period) => {
    try {
      const response = await api.get(`/classes/${classItem.id}/report.pdf`, { params: boundaries(period), responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `quicklink-${period}-attendance-${classItem.id}.pdf`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(apiError(error).message); }
  };

  if (loading) return <PageLoader label="Loading teacher dashboard…" />;
  if (loadError) return <EmptyState title="Dashboard could not load" description={loadError} action={<button className="btn-primary" onClick={load}>Try again</button>} />;
  const pending = work.reduce((sum, assignment) => sum + (assignment.pendingCount || 0), 0);
  const liveCount = classes.filter((item) => item.liveSession).length;
  return <div>
    <PageHeader
      title="Teacher dashboard"
      subtitle="Your classes, student activity, and teaching resources in one place."
      actions={<Link to="/classes" className="btn-primary"><BookOpenCheck size={16} /> View classes</Link>}
    />

    <section className="mb-8">
      <SectionHeader title="Your teaching snapshot" description="A quick look at today's teaching activity." icon={CalendarDays} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="My classes" value={classes.length} icon={BookOpenCheck} />
        <StatCard label="Live now" value={liveCount} icon={Radio} accent="amber" />
        <StatCard label="Assignments" value={work.length} icon={FileText} />
        <StatCard label="To review" value={pending} icon={ClipboardCheck} accent="amber" />
        <StatCard label="Certificates" value={certificates.filter((item) => !item.revoked).length} icon={Award} accent="green" />
        <StatCard label="Followers" value={followers.length} icon={UsersRound} accent="purple" />
      </div>
    </section>

    <section className="mb-8">
      <SectionHeader title="Classes and attendance" description="Open a class, review submissions, or export an attendance report." icon={BookOpenCheck} />
      {classes.length ? <div className="grid gap-3 lg:grid-cols-2">
        {classes.map((item) => <article key={item.id} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><BookOpenCheck size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link to={`/classes/${item.id}`} className="break-words font-bold text-slate-900 hover:text-brand-700">{item.title}</Link>
                {item.liveSession && <Badge color="red"><Radio size={12} /> Live now</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{item.subject} · {item.level} · {item.students?.length || 0} students</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {item.liveSession && <Link to={`/classes/sessions/${item.liveSession.id}/live`} className="btn-primary"><Radio size={15} /> Join live class</Link>}
            <Link to={`/courses/${item.id}`} className="btn-secondary">Review assignments</Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-400"><CalendarDays size={14} /> Attendance report</span>
            {['daily', 'weekly', 'monthly'].map((period) => <button key={period} className="btn-ghost min-h-9 px-3 py-1.5 capitalize" onClick={() => downloadReport(item, period)}>{period}</button>)}
          </div>
        </article>)}
      </div> : <EmptyState icon={BookOpenCheck} title="No classes assigned" description="Your classes will appear here once an administrator assigns you to one." action={<Link to="/classes" className="btn-secondary">Browse classes</Link>} />}
    </section>

    <section className="mb-8">
      <SectionHeader title="Assignments" description="Track published work and review student submissions." icon={ClipboardCheck} />
      {work.length ? <div className="space-y-2">
        {work.map((assignment) => <article key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-800">{assignment.title}</p>
            <p className="mt-1 text-xs text-slate-500">{assignment.classItem.title} · {assignment.published ? 'Published' : 'Draft'}{assignment.dueAt ? ` · Due ${new Date(assignment.dueAt).toLocaleDateString()}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={assignment.pendingCount ? 'amber' : 'slate'}>{assignment.pendingCount || 0} to review</Badge>
            <Link className="btn-secondary" to={`/courses/${assignment.classItem.id}`}>Review submissions <ArrowRight size={15} /></Link>
          </div>
        </article>)}
      </div> : <EmptyState icon={ClipboardCheck} title="No assignments yet" description="Create an assignment in one of your classes to give students work to complete." />}
    </section>

    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionHeader title="My followers" description="Students who follow your teaching updates." icon={UsersRound} />
        {followers.length ? <div className="grid gap-2">
          {followers.map((follower) => <article key={follower.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-emerald-800 text-sm font-bold text-white">{follower.name?.slice(0, 1)?.toUpperCase() || '?'}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{follower.name}</p><p className="truncate text-sm text-slate-500">{follower.email}</p></div>
            <p className="shrink-0 text-right text-xs text-slate-400">Following since<br />{new Date(follower.followedAt).toLocaleDateString()}</p>
          </article>)}
        </div> : <EmptyState icon={UsersRound} title="No followers yet" description="Students who follow you will appear here." />}
      </section>

      <section>
        <SectionHeader title="Student certificates" description="Verify achievements issued to students in your classes." icon={Award} />
        {certificates.length ? <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400"><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Issued</th><th className="p-3">Status</th><th className="p-3">Verify</th></tr></thead>
            <tbody>{certificates.map((certificate) => <tr key={certificate.id} className="border-b border-slate-50 last:border-0">
              <td className="p-3 font-medium text-slate-700">{certificate.studentName}</td>
              <td className="p-3">{certificate.courseTitle} · {certificate.level}</td>
              <td className="p-3 whitespace-nowrap">{new Date(certificate.issuedAt).toLocaleDateString()}</td>
              <td className="p-3"><Badge color={certificate.revoked ? 'red' : 'green'}>{certificate.revoked ? 'Revoked' : 'Valid'}</Badge></td>
              <td className="p-3"><Link className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800" to={certificate.verificationPath}>Verify <ArrowRight size={14} /></Link></td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState icon={Award} title="No certificates issued yet" description="Student certificates will appear here when they complete course requirements." />}
      </section>
    </div>
  </div>;
}
