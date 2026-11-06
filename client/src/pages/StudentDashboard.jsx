import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, Clock3, GraduationCap, Share2 } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function StudentDashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [followBusy, setFollowBusy] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([api.get('/courses', { params: { enrolled: true, limit: 100 } }), api.get('/learning/summary'), api.get('/certificates/mine'), api.get('/users/teachers')])
      .then(([courses, summary, certs, teacherResponse]) => { setData({ courses: courses.data.data.courses, summary: summary.data.data }); setCertificates(certs.data.data.certificates); setTeachers(teacherResponse.data.data.teachers); })
      .catch((error) => toast.error(apiError(error).message))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <PageLoader label="Loading your dashboard…" />;
  if (!data) return <EmptyState title="Dashboard could not load" description="Check your connection and try again." action={<button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>} />;
  const download = async (certificate) => {
    try { const response = await api.get(`/certificates/${certificate.id}.pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ishconnect-quicklink-certificate-${certificate.code}.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { toast.error(apiError(error).message); }
  };
  const share = async (certificate) => {
    const origin = new URL(api.defaults.baseURL || '/', window.location.origin).origin;
    const url = `${origin}${certificate.sharePath || certificate.verificationPath}`;
    try {
      if (navigator.share) await navigator.share({ title: `${certificate.courseTitle} certificate`, text: `Verified IshConnect certificate for ${certificate.studentName} via QuickLink Learning Portal`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Certificate sharing link copied.'); }
    } catch (error) {
      if (error.name !== 'AbortError') toast.error('Could not share the certificate link.');
    }
  };
  const toggleFollow = async (teacher) => {
    setFollowBusy(teacher.id);
    try {
      if (teacher.following) await api.delete(`/users/teachers/${teacher.id}/follow`);
      else await api.post(`/users/teachers/${teacher.id}/follow`);
      setTeachers((current) => current.map((item) => item.id === teacher.id ? { ...item, following: !teacher.following } : item));
    } catch (error) { toast.error(apiError(error).message); }
    finally { setFollowBusy(''); }
  };
  return <div><PageHeader title="My learning" subtitle="Your courses, recent reading, and progress in one place." />
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><StatCard label="Enrolled courses" value={data.courses.length} icon={GraduationCap} /><StatCard label="Books started" value={data.summary.booksStarted} icon={Clock3} accent="amber" /><StatCard label="Books completed" value={data.summary.completedBooks} icon={CheckCircle2} accent="green" /></div>
    <section className="mb-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">My courses</h2><Link to="/courses" className="text-sm font-semibold text-brand-700">Browse courses</Link></div>{data.courses.length ? <div className="grid gap-3 sm:grid-cols-2">{data.courses.map((course) => <article key={course.id} className="card"><div className="flex flex-wrap gap-2"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge></div><h3 className="mt-2 break-words font-semibold text-slate-900">{course.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.introduction || course.description}</p>{course.learningMaterials?.length > 0 && <div className="mt-3"><div className="flex justify-between text-xs text-slate-500"><span>Reading progress</span><span>{course.readingProgress || 0}%</span></div><div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${course.readingProgress || 0}%` }} /></div></div>}<div className="mt-3 flex gap-2"><Link to={`/courses/${course.id}`} className="btn-primary">Continue learning</Link><Link to={`/classes/${course.id}`} className="btn-secondary">Classroom</Link></div></article>)}</div> : <EmptyState icon={GraduationCap} title="No enrolled courses" description="Explore the course catalog and enroll to start learning." action={<Link to="/courses" className="btn-primary">Browse courses</Link>} />}</section>
    <section className="mb-7"><h2 className="mb-3 text-base font-bold text-slate-900">Teachers</h2>{teachers.length ? <div className="grid gap-2 sm:grid-cols-2">{teachers.map((teacher) => <article key={teacher.id} className="card flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{teacher.name}</p><p className="text-sm text-slate-500">{teacher.email}</p></div><button className={teacher.following ? 'btn-secondary' : 'btn-primary'} disabled={followBusy === teacher.id} onClick={() => toggleFollow(teacher)}>{followBusy === teacher.id ? 'Saving…' : teacher.following ? 'Following · Unfollow' : 'Follow teacher'}</button></article>)}</div> : <EmptyState title="No teachers available" description="Teachers will appear here when an administrator creates their accounts." />}</section>
    <section><h2 className="mb-3 text-base font-bold text-slate-900">Continue reading</h2>{data.summary.recentlyRead.length ? <div className="grid gap-2 sm:grid-cols-2">{data.summary.recentlyRead.map((book) => <Link key={book.id} to={`/learn?book=${book.id}`} className="card flex items-center gap-3 hover:border-brand-300"><BookOpen size={20} className="shrink-0 text-brand-700" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-800">{book.title}</span><span className="text-xs text-slate-500">{book.positionType} {book.positionIndex}{book.progressPercent ? ` · ${Math.round(book.progressPercent)}%` : ''}</span></span><span className="text-xs font-semibold text-brand-700">Continue</span></Link>)}</div> : <EmptyState icon={BookOpen} title="No reading progress yet" description="Open a learning resource to start tracking your progress." action={<Link to="/learn" className="btn-primary">Open library</Link>} />}</section>
    {certificates.length > 0 && <section className="mt-7"><h2 className="mb-3 text-base font-bold text-slate-900">My certificates</h2><div className="grid gap-2 sm:grid-cols-2">{certificates.filter((certificate) => !certificate.revoked).map((certificate) => <article key={certificate.id} className="card"><h3 className="break-words font-semibold text-slate-900">{certificate.courseTitle}</h3><p className="mt-1 text-xs text-slate-500">{certificate.level} · Issued {new Date(certificate.issuedAt).toLocaleDateString()} · {certificate.code}</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={() => download(certificate)}>Download PDF</button><button className="btn-secondary" onClick={() => share(certificate)}><Share2 size={15} />Share</button><Link className="btn-secondary" to={certificate.verificationPath}>Verify</Link></div></article>)}</div></section>}
  </div>;
}
