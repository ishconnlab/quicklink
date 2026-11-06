import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, BookOpenCheck, FileText, Users, UsersRound } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, StatCard } from '../components/layout.jsx';
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
  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (error) { toastRef.current.error(apiError(error).message); }
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
  const pending = work.reduce((sum, assignment) => sum + (assignment.pendingCount || 0), 0);
  const liveCount = classes.filter((item) => item.liveSession).length;
  return <div>
    <PageHeader title="Teacher dashboard" subtitle="Manage your classes, follow student work, review certificates, and export attendance." actions={<Link to="/classes" className="btn-secondary">All classes</Link>} />
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"><StatCard label="My classes" value={classes.length} icon={BookOpenCheck} /><StatCard label="Live now" value={liveCount} icon={Users} accent="amber" /><StatCard label="Assignments" value={work.length} icon={FileText} /><StatCard label="To review" value={pending} icon={FileText} accent="amber" /><StatCard label="Certificates" value={certificates.filter((item) => !item.revoked).length} icon={Award} accent="green" /><StatCard label="Followers" value={followers.length} icon={UsersRound} accent="purple" /></div>
    <section className="mb-7"><h2 className="mb-3 text-base font-bold text-slate-900">Classes and attendance reports</h2>{classes.length ? <div className="grid gap-3 lg:grid-cols-2">{classes.map((item) => <article key={item.id} className="card"><div className="flex flex-wrap items-start justify-between gap-2"><div><Link to={`/classes/${item.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{item.title}</Link><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.level} · {item.students.length} students</p></div>{item.liveSession && <Badge color="red">Live now</Badge>}</div><div className="mt-4 flex flex-wrap gap-2">{item.liveSession && <Link to={`/classes/sessions/${item.liveSession.id}/live`} className="btn-primary">Join live class</Link>}<Link to={`/courses/${item.id}`} className="btn-secondary">Assignments and submissions</Link>{['daily', 'weekly', 'monthly'].map((period) => <button key={period} className="btn-secondary capitalize" onClick={() => downloadReport(item, period)}>{period} PDF</button>)}</div></article>)}</div> : <EmptyState title="No classes assigned" description="Ask an administrator to assign you to a class." />}</section>
    <section className="mb-7"><h2 className="mb-3 text-base font-bold text-slate-900">My followers</h2>{followers.length ? <div className="grid gap-2 sm:grid-cols-2">{followers.map((follower) => <article key={follower.id} className="card flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{follower.name}</p><p className="text-sm text-slate-500">{follower.email}</p></div><p className="text-xs text-slate-400">Following since {new Date(follower.followedAt).toLocaleDateString()}</p></article>)}</div> : <EmptyState title="No followers yet" description="Students who follow you will appear here." />}</section>
    <section className="mb-7"><h2 className="mb-3 text-base font-bold text-slate-900">Student certificates</h2>{certificates.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase text-slate-400"><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Issued</th><th className="p-3">Status</th><th className="p-3">Verify</th></tr></thead><tbody>{certificates.map((certificate) => <tr key={certificate.id} className="border-b border-slate-50"><td className="p-3">{certificate.studentName}</td><td className="p-3">{certificate.courseTitle} · {certificate.level}</td><td className="p-3">{new Date(certificate.issuedAt).toLocaleDateString()}</td><td className="p-3"><Badge color={certificate.revoked ? 'red' : 'green'}>{certificate.revoked ? 'Revoked' : 'Valid'}</Badge></td><td className="p-3"><Link className="text-brand-700 underline" to={certificate.verificationPath}>Verify</Link></td></tr>)}</tbody></table></div> : <EmptyState icon={Award} title="No certificates issued yet" description="Certificates appear here when enrolled students complete their course requirements." />}</section>
    <section><h2 className="mb-3 text-base font-bold text-slate-900">Assignments</h2>{work.length ? <div className="space-y-2">{work.map((assignment) => <article key={assignment.id} className="card flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">{assignment.title}</p><p className="mt-1 text-xs text-slate-500">{assignment.classItem.title} · {assignment.published ? 'Published' : 'Draft'}{assignment.dueAt ? ` · Due ${new Date(assignment.dueAt).toLocaleDateString()}` : ''}</p></div><div className="flex items-center gap-2"><Badge color={assignment.pendingCount ? 'amber' : 'slate'}>{assignment.pendingCount || 0} to review</Badge><Link className="btn-secondary" to={`/courses/${assignment.classItem.id}`}>Review submissions</Link></div></article>)}</div> : <EmptyState title="No assignments yet" description="Open one of your courses to create an assignment for its students." />}</section>
  </div>;
}
