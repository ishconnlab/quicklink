import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, BookOpenCheck, CheckCircle2, Clock3, GraduationCap, Share2, UsersRound } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, SectionHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function StudentDashboard() {
  const { user } = useAuth();
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
    try { const response = await api.get(`/certificates/${certificate.code}.pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ishconnect-quicklink-certificate-${certificate.code}.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
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
  const firstName = user?.name?.split(' ')[0] || 'there';
  return <div>
    <PageHeader
      title="My learning"
      subtitle={`Welcome back, ${firstName}. Your courses, reading activity, and achievements are all here.`}
      actions={<><Link to="/courses" className="btn-secondary">Browse courses</Link><Link to="/learn" className="btn-primary">Open library</Link></>}
    />

    <section className="mb-7">
      <SectionHeader title="Your snapshot" description="A quick view of the learning you have started and completed." icon={BookOpenCheck} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Enrolled courses" value={data.courses.length} icon={GraduationCap} hint="Active learning paths" />
        <StatCard label="Books started" value={data.summary.booksStarted} icon={Clock3} accent="amber" hint="Resources opened" />
        <StatCard label="Books completed" value={data.summary.completedBooks} icon={CheckCircle2} accent="green" hint="Finished reading" />
      </div>
    </section>

    <section className="mb-8">
      <SectionHeader title="My courses" description="Continue where you left off or review your classes." action={<Link to="/courses" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">View all <ArrowRight size={15} /></Link>} icon={GraduationCap} />
      {data.courses.length ? <div className="grid gap-4 sm:grid-cols-2">
        {data.courses.map((course) => <article key={course.id} className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="h-1 bg-gradient-to-r from-brand-500 to-emerald-600" />
          <div className="p-5">
            <div className="flex flex-wrap gap-2"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge>{course.enrolled && <Badge color="green">Enrolled</Badge>}</div>
            <h3 className="mt-3 break-words text-base font-bold leading-6 text-slate-900">{course.title}</h3>
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">{course.introduction || course.description || 'Open the course to review its learning objectives and materials.'}</p>
            {course.learningMaterials?.length > 0 && <div className="mt-4"><div className="flex justify-between text-xs font-medium text-slate-500"><span>Reading progress</span><span>{course.readingProgress || 0}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-600" style={{ width: `${course.readingProgress || 0}%` }} /></div></div>}
            <div className="mt-4 flex gap-2"><Link to={`/courses/${course.id}`} className="btn-primary flex-1">Continue learning</Link><Link to={`/classes/${course.id}`} className="btn-secondary">Classroom</Link></div>
          </div>
        </article>)}
      </div> : <EmptyState icon={GraduationCap} title="No enrolled courses" description="Explore the course catalog and enroll to start learning." action={<Link to="/courses" className="btn-primary">Browse courses</Link>} />}
    </section>

    <section className="mb-8">
      <SectionHeader title="Continue reading" description="Pick up your most recent resources." action={data.summary.recentlyRead.length ? <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400"><BookOpen size={14} /> {data.summary.recentlyRead.length} recent</span> : null} icon={BookOpen} />
      {data.summary.recentlyRead.length ? <div className="grid gap-3 sm:grid-cols-2">{data.summary.recentlyRead.map((book) => <Link key={book.id} to={`/learn?book=${book.id}`} className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><BookOpen size={20} /></span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-slate-800">{book.title}</span><span className="mt-0.5 block text-xs text-slate-500">{book.positionType} {book.positionIndex}{book.progressPercent ? ` · ${Math.round(book.progressPercent)}%` : ''}</span></span><ArrowRight size={17} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" /></Link>)}</div> : <EmptyState icon={BookOpen} title="No reading progress yet" description="Open a learning resource to start tracking your progress." action={<Link to="/learn" className="btn-primary">Open library</Link>} />}
    </section>

    <section className="mb-8">
      <SectionHeader title="Your teachers" description="Follow instructors to stay connected to their classes and updates." icon={UsersRound} />
      {teachers.length ? <div className="grid gap-3 sm:grid-cols-2">{teachers.map((teacher) => <article key={teacher.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-emerald-800 text-sm font-bold text-white">{teacher.name?.slice(0, 1)?.toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{teacher.name}</p><p className="truncate text-sm text-slate-500">{teacher.email}</p></div></div><button className={teacher.following ? 'btn-secondary' : 'btn-primary'} disabled={followBusy === teacher.id} onClick={() => toggleFollow(teacher)}>{followBusy === teacher.id ? 'Saving…' : teacher.following ? 'Following · Unfollow' : 'Follow teacher'}</button></article>)}</div> : <EmptyState title="No teachers available" description="Teachers will appear here when an administrator creates their accounts." />}
    </section>

    {certificates.length > 0 && <section>
      <SectionHeader title="My certificates" description="Download, verify, or share your achievements." icon={Award} />
      <div className="grid gap-3 sm:grid-cols-2">{certificates.filter((certificate) => !certificate.revoked).map((certificate) => <article key={certificate.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Award size={21} /></span><div className="min-w-0"><h3 className="break-words font-bold text-slate-900">{certificate.courseTitle}</h3><p className="mt-1 text-xs text-slate-500">{certificate.level} · Issued {new Date(certificate.issuedAt).toLocaleDateString()} · {certificate.code}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" onClick={() => download(certificate)}>Download PDF</button><button className="btn-secondary" onClick={() => share(certificate)}><Share2 size={15} />Share</button><Link className="btn-secondary" to={certificate.verificationPath}>Verify</Link></div></article>)}</div>
    </section>}
  </div>;
}
