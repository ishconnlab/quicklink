import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, GraduationCap, Users } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import CourseAssignments from '../components/CourseAssignments.jsx';

export default function CourseDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [completion, setCompletion] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = (await api.get(`/courses/${id}`)).data.data.course;
      setCourse(next);
      if (next.enrolled) {
        const [state, mine] = await Promise.all([api.get(`/courses/${id}/completion`), api.get('/certificates/mine')]);
        setCompletion(state.data.data);
        setCertificate(mine.data.data.certificates.find((item) => item.courseId === id) || null);
      } else { setCompletion(null); setCertificate(null); }
    }
    catch (error) { setCourse(null); toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const enroll = async () => {
    setEnrolling(true);
    try { const response = await api.post(`/courses/${id}/enroll`); setCourse(response.data.data.course); toast.success('You are enrolled in this course.'); }
    catch (error) { toast.error(apiError(error).message); await load(); }
    finally { setEnrolling(false); }
  };
  const issueCertificate = async () => {
    try { const response = await api.post(`/courses/${id}/certificate`); setCertificate(response.data.data.certificate); toast.success('Certificate issued.'); }
    catch (error) { toast.error(apiError(error).message); await load(); }
  };
  const downloadCertificate = async () => {
    if (!certificate) return;
    try { const response = await api.get(`/certificates/${certificate.id}.pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `quicklink-certificate-${certificate.code}.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { toast.error(apiError(error).message); }
  };
  if (loading) return <PageLoader label="Loading course…" />;
  if (!course) return <EmptyState title="Course unavailable" description="This course may be unpublished or no longer available." action={<Link to="/courses" className="btn-secondary">Browse courses</Link>} />;
  return <div className="min-w-0"><Link to="/courses" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />All courses</Link>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[16/7] max-h-80 bg-gradient-to-br from-brand-700 to-sky-600">{course.thumbnailUrl ? <img src={course.thumbnailUrl} alt={`Cover for ${course.title}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white"><GraduationCap size={64} /></div>}</div>
      <div className="p-5 sm:p-8"><div className="mb-3 flex flex-wrap gap-2"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge>{course.trade && <Badge>{course.trade}</Badge>}<Badge color={course.enrollmentStatus === 'enrolled' ? 'green' : 'slate'}>{course.enrollmentStatus}</Badge></div>
        <PageHeader title={course.title} subtitle={course.introduction || ''} actions={course.enrolled ? <Link to={`/classes/${course.id}`} className="btn-primary"><CheckCircle2 size={16} />Continue learning</Link> : <button disabled={enrolling || course.enrollmentStatus !== 'open'} onClick={enroll} className="btn-primary">{enrolling ? <Spinner size={16} /> : <Users size={16} />}{course.enrollmentStatus === 'open' ? 'Enroll in course' : course.enrollmentStatus}</button>} />
        <div className="grid gap-4 lg:grid-cols-3"><article className="lg:col-span-2"><h2 className="mb-2 font-semibold text-slate-900">About this course</h2><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{course.description || course.introduction || 'Course information will be provided by the instructor.'}</p></article>
          <aside className="rounded-xl bg-slate-50 p-4"><h2 className="mb-3 font-semibold text-slate-900">Course information</h2><p className="text-sm text-slate-600">Teacher: {course.teachers?.map((teacher) => teacher.name).join(', ') || course.teacher?.name || 'Not assigned'}</p><p className="mt-2 text-sm text-slate-600">{course.enrolledCount} enrolled · {course.seatsAvailable} seats remaining</p><p className="mt-2 text-sm text-slate-600">{course.learningMaterials?.length || 0} learning materials</p></aside></div>
        <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen size={18} />Learning materials</h2>{course.enrolled && course.learningMaterials?.length > 0 && <Badge color={course.readingComplete ? 'green' : 'brand'}>{course.readingProgress || 0}% read</Badge>}</div>{course.enrolled ? course.learningMaterials?.length ? <ul className="space-y-2">{course.learningMaterials.map((material) => <li key={material.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><Link to={`/learn?book=${material.id}&course=${course.id}`} className="font-medium text-brand-700 hover:underline">{material.title}</Link><p className="text-xs text-slate-500">{material.format?.toUpperCase()} · {material.level}{material.progress ? ` · ${material.progress.completed ? 'Complete' : `${Math.round(material.progress.progressPercent || 0)}%`}` : ' · Not started'}</p></div><Link to={`/learn?book=${material.id}&course=${course.id}`} className="btn-secondary">{material.progress ? 'Continue Reading' : 'Start Reading'}</Link></div></li>)}</ul> : <p className="text-sm text-slate-500">No materials have been linked to this course yet.</p> : <p className="text-sm text-slate-500">Enroll in this course to access its learning materials.</p>}</section>
        {course.enrolled || user?.role === 'owner' || user?.role === 'teacher' ? <CourseAssignments course={course} user={user} /> : <section className="mt-7"><h2 className="font-semibold text-slate-900">Practical Work</h2><p className="mt-2 text-sm text-slate-600">Enroll in this course to view assignments and feedback.</p></section>}
        {course.enrolled && completion && <section className="mt-8 border-t border-slate-200 pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Course completion</h2><p className="mt-1 text-sm text-slate-600">{completion.eligible ? 'All configured completion requirements are met.' : 'Finish the remaining requirements to earn your certificate.'}</p></div>{certificate && !certificate.revoked ? <button className="btn-primary" onClick={downloadCertificate}>Download certificate</button> : completion.eligible && <button className="btn-primary" onClick={issueCertificate}>Issue certificate</button>}</div><ul className="mt-3 space-y-2">{completion.checks.map((check) => <li key={check.key} className="flex items-start gap-2 text-sm"><span className={check.complete ? 'text-emerald-600' : 'text-amber-600'}>{check.complete ? '✓' : '○'}</span><span><span className="font-medium text-slate-800">{check.label}</span><span className="ml-2 text-slate-500">{check.detail}</span></span></li>)}</ul>{certificate && <p className="mt-3 text-xs text-slate-500">Certificate ID {certificate.code} · <Link className="text-brand-700 underline" to={certificate.verificationPath}>Verify</Link></p>}</section>}
      </div>
    </section>
  </div>;
}
