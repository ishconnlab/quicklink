import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, Pencil, Share2, Users } from 'lucide-react';
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
  const [certificationAssessment, setCertificationAssessment] = useState(null);
  const [certificationAnswers, setCertificationAnswers] = useState({});
  const [certificationSubmitting, setCertificationSubmitting] = useState(false);
  const [certificate, setCertificate] = useState(null);
  const [certificateCandidates, setCertificateCandidates] = useState([]);
  const [certificatePage, setCertificatePage] = useState(1);
  const [certificatePages, setCertificatePages] = useState(1);
  const [certificateTotal, setCertificateTotal] = useState(0);
  const [certificateLoading, setCertificateLoading] = useState(false);
  const [issuingIds, setIssuingIds] = useState([]);
  const [editingCertificate, setEditingCertificate] = useState(null);
  const [savingCertificateName, setSavingCertificateName] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = (await api.get(`/courses/${id}`)).data.data.course;
      setCourse(next);
      if (next.enrolled) {
        const [state, mine, assessment] = await Promise.all([
          api.get(`/courses/${id}/completion`),
          api.get('/certificates/mine'),
          user?.role === 'student' ? api.get(`/courses/${id}/certification-assessment`) : Promise.resolve(null),
        ]);
        let ownCertificate = mine.data.data.certificates.find((item) => item.courseId === id) || null;
        if (user?.role === 'student' && state.data.data.eligible && !ownCertificate) {
          try {
            ownCertificate = (await api.post(`/courses/${id}/certificate`)).data.data.certificate;
          } catch (error) {
            toast.error(apiError(error).message);
          }
        }
        setCompletion(state.data.data);
        setCertificate(ownCertificate);
        setCertificationAssessment(assessment?.data.data || null);
      } else { setCompletion(null); setCertificate(null); setCertificationAssessment(null); }
    }
    catch (error) { setCourse(null); toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [id, user?.role]);
  useEffect(() => { load(); }, [load]);
  const loadCertificateCandidates = useCallback(async (page = certificatePage) => {
    setCertificateLoading(true);
    try {
      const response = await api.get(`/courses/${id}/certificate-candidates`, { params: { page, limit: 50 } });
      setCertificateCandidates(response.data.data.candidates);
      setCertificatePages(response.data.data.pages);
      setCertificateTotal(response.data.data.total);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setCertificateLoading(false); }
  }, [certificatePage, id, toast]);
  useEffect(() => {
    if (user?.role === 'owner' && course?.id === id) loadCertificateCandidates(certificatePage);
  }, [user?.role, course?.id, id, certificatePage, loadCertificateCandidates]);
  const enroll = async () => {
    setEnrolling(true);
    try { await api.post(`/courses/${id}/enroll`); await load(); toast.success('You are enrolled in this course.'); }
    catch (error) { toast.error(apiError(error).message); await load(); }
    finally { setEnrolling(false); }
  };
  const certificationAnswersCount = Object.keys(certificationAnswers).length;
  const submitCertificationAssessment = async () => {
    if (!certificationAssessment || certificationAnswersCount !== certificationAssessment.questions.length) return;
    setCertificationSubmitting(true);
    try {
      await api.post(`/courses/${id}/certification-assessment`, {
        answers: Object.entries(certificationAnswers).map(([questionIndex, optionIndex]) => ({ questionIndex: Number(questionIndex), optionIndex })),
      });
      setCertificationAnswers({});
      await load();
      toast.success('Certification assessment submitted.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setCertificationSubmitting(false); }
  };
  const issueCertificate = async () => {
    try { const response = await api.post(`/courses/${id}/certificate`); setCertificate(response.data.data.certificate); toast.success('Certificate issued.'); }
    catch (error) { toast.error(apiError(error).message); await load(); }
  };
  const downloadCertificate = async (target = certificate) => {
    if (!target) return;
    try { const response = await api.get(`/certificates/${target.id}.pdf`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ishconnect-quicklink-certificate-${target.code}.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { toast.error(apiError(error).message); }
  };
  const shareCertificate = async (target) => {
    const origin = new URL(api.defaults.baseURL || '/', window.location.origin).origin;
    const url = `${origin}${target.sharePath || target.verificationPath}`;
    try {
      if (navigator.share) await navigator.share({ title: `${target.courseTitle} certificate`, text: `Verified IshConnect certificate for ${target.studentName} via QuickLink Learning Portal`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Certificate sharing link copied.'); }
    } catch (error) {
      if (error.name !== 'AbortError') toast.error('Could not share the certificate link.');
    }
  };
  const issueForStudents = async (studentIds) => {
    if (!studentIds.length) return;
    setIssuingIds(studentIds);
    try {
      const response = await api.post(`/courses/${id}/certificates/issue`, { studentIds });
      const { issuedCount, results } = response.data.data;
      const skipped = results.length - issuedCount;
      toast.success(`${issuedCount} certificate${issuedCount === 1 ? '' : 's'} issued${skipped ? `; ${skipped} student${skipped === 1 ? '' : 's'} not eligible` : ''}.`);
      await loadCertificateCandidates(certificatePage);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setIssuingIds([]); }
  };
  const saveCertificateName = async (event) => {
    event.preventDefault();
    if (!editingCertificate) return;
    setSavingCertificateName(true);
    try {
      await api.patch(`/certificates/${editingCertificate.id}/name`, { studentName: editingCertificate.studentName });
      setEditingCertificate(null);
      toast.success('Certificate name updated.');
      await loadCertificateCandidates(certificatePage);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSavingCertificateName(false); }
  };
  if (loading) return <PageLoader label="Loading course…" />;
  if (!course) return <EmptyState title="Course unavailable" description="This course may be unpublished or no longer available." action={<Link to="/courses" className="btn-secondary">Browse courses</Link>} />;
  return <div className="min-w-0"><Link to="/courses" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />All courses</Link>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[16/7] max-h-80 bg-gradient-to-br from-brand-700 to-sky-600">{course.thumbnailUrl ? <img src={course.thumbnailUrl} alt={`Cover for ${course.title}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white"><GraduationCap size={64} /></div>}</div>
      <div className="min-w-0 p-4 sm:p-8"><div className="mb-3 flex flex-wrap gap-2"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge>{course.trade && <Badge>{course.trade}</Badge>}<Badge color={course.enrollmentStatus === 'enrolled' ? 'green' : 'slate'}>{course.enrollmentStatus}</Badge></div>
        <PageHeader title={course.title} subtitle={course.introduction || ''} actions={course.enrolled ? <Link to={`/classes/${course.id}`} className="btn-primary"><CheckCircle2 size={16} />Continue learning</Link> : <button disabled={enrolling || course.enrollmentStatus !== 'open'} onClick={enroll} className="btn-primary">{enrolling ? <Spinner size={16} /> : <Users size={16} />}{course.enrollmentStatus === 'open' ? 'Enroll in course' : course.enrollmentStatus}</button>} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-3"><article className="min-w-0 lg:col-span-2"><h2 className="mb-2 font-semibold text-slate-900">About this course</h2><p className="break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{course.description || course.introduction || 'Course information will be provided by the instructor.'}</p></article>
          <aside className="rounded-xl bg-slate-50 p-4"><h2 className="mb-3 font-semibold text-slate-900">Course information</h2><p className="text-sm text-slate-600">Teacher: {course.teachers?.map((teacher) => teacher.name).join(', ') || course.teacher?.name || 'Not assigned'}</p><p className="mt-2 text-sm text-slate-600">{course.enrolledCount} enrolled · {course.seatsAvailable} seats remaining</p><p className="mt-2 text-sm text-slate-600">{course.learningMaterials?.length || 0} learning materials</p></aside></div>
        <section className="mt-7 min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen size={18} />Learning materials</h2>{course.enrolled && course.learningMaterials?.length > 0 && <Badge color={course.readingComplete ? 'green' : 'brand'}>{course.readingProgress || 0}% read</Badge>}</div>{course.enrolled ? course.learningMaterials?.length ? <ul className="space-y-2">{course.learningMaterials.map((material) => <li key={material.id} className="min-w-0 rounded-lg border border-slate-200 p-3"><div className="flex min-w-0 flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center"><div className="min-w-0"><Link to={`/learn?book=${material.id}&course=${course.id}`} className="break-words font-medium text-brand-700 hover:underline">{material.title}</Link><p className="break-words text-xs text-slate-500">{material.format?.toUpperCase()} · {material.level}{material.progress ? ` · ${material.progress.completed ? 'Complete' : `${Math.round(material.progress.progressPercent || 0)}%`}` : ' · Not started'}</p></div><Link to={`/learn?book=${material.id}&course=${course.id}`} className="btn-secondary w-full sm:w-auto">{material.progress ? 'Continue reading' : 'Start reading'}</Link></div></li>)}</ul> : <p className="text-sm text-slate-500">No materials have been linked to this course yet.</p> : <p className="text-sm text-slate-500">Enroll in this course to access its learning materials.</p>}</section>
        {course.enrolled || user?.role === 'owner' || user?.role === 'teacher' ? <CourseAssignments course={course} user={user} onCompletionChange={load} /> : <section className="mt-7"><h2 className="font-semibold text-slate-900">Practical Work</h2><p className="mt-2 text-sm text-slate-600">Enroll in this course to view assignments and feedback.</p></section>}
        {course.enrolled && user?.role === 'student' && certificationAssessment?.enabled && <section className="mt-8 border-t border-slate-200 pt-6">
          <div className="mb-4"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Award size={18} />Certification assessment</h2><p className="mt-1 text-sm leading-6 text-slate-600">Answer all 10 multiple-choice questions. You need 80% to pass and have up to three attempts.</p></div>
          {!certificationAssessment.configured && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">The administrator has not finished configuring this assessment yet.</p>}
          {certificationAssessment.configured && !certificationAssessment.assignmentsComplete && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Complete and pass all required theory and practical assignments before this assessment becomes available.</p>}
          {certificationAssessment.passed && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Assessment passed. You can now meet the certification assessment requirement.</p>}
          {!certificationAssessment.passed && certificationAssessment.latestAttempt && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Latest score: {certificationAssessment.latestAttempt.score}%. {certificationAssessment.attemptsRemaining} attempt{certificationAssessment.attemptsRemaining === 1 ? '' : 's'} remaining.</p>}
          {certificationAssessment.questions?.length === 10 && <div className="space-y-4">
            {certificationAssessment.questions.map((question, questionIndex) => <fieldset key={question.id} className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
              <legend className="max-w-full px-1 text-sm font-semibold leading-6 text-slate-800">{questionIndex + 1}. {question.prompt}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm leading-5 text-slate-700 hover:bg-slate-50">
                <input className="mt-1 shrink-0" type="radio" name={`certification-question-${question.id}`} checked={certificationAnswers[question.id] === optionIndex} onChange={() => setCertificationAnswers((current) => ({ ...current, [question.id]: optionIndex }))} />
                <span className="min-w-0 break-words">{option}</span>
              </label>)}</div>
            </fieldset>)}
            <button type="button" className="btn-primary w-full sm:w-auto" disabled={certificationSubmitting || certificationAnswersCount !== certificationAssessment.questions.length} onClick={submitCertificationAssessment}>{certificationSubmitting ? <Spinner size={16} /> : <Check size={16} />}Submit assessment ({certificationAnswersCount}/10 answered)</button>
          </div>}
          {!certificationAssessment.passed && certificationAssessment.configured && certificationAssessment.attemptsRemaining === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No attempts remain. Contact the administrator for help.</p>}
        </section>}
        {user?.role === 'owner' && <section className="mt-8 border-t border-slate-200 pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Award size={18} />Training certificates</h2><p className="mt-1 text-sm text-slate-500">{certificateTotal} enrolled student{certificateTotal === 1 ? '' : 's'} · certificates can only be issued when all configured completion requirements are met.</p></div>
            <button className="btn-primary" disabled={certificateLoading || issuingIds.length > 0 || !certificateCandidates.some((candidate) => candidate.eligible && !candidate.certificate)} onClick={() => issueForStudents(certificateCandidates.filter((candidate) => candidate.eligible && !candidate.certificate).map((candidate) => candidate.studentId))}>
              {issuingIds.length > 0 ? <Spinner size={16} /> : <Award size={16} />}Issue eligible on this page
            </button>
          </div>
          {certificateLoading ? <div className="py-8 text-center"><Spinner size={22} /></div> : certificateCandidates.length === 0 ? <EmptyState icon={Users} title="No enrolled students" description="Students must be enrolled in this training before certificates can be issued." /> : <>
            <div className="space-y-2">{certificateCandidates.map((candidate) => <article key={candidate.studentId} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="font-medium text-slate-900">{candidate.name}</p>{candidate.registeredName !== candidate.name && <p className="text-xs text-slate-600">Registration name: {candidate.registeredName}</p>}<p className="break-all text-xs text-slate-500">{candidate.email}</p><p className={`mt-1 text-xs ${candidate.certificate?.revokedAt ? 'text-red-700' : candidate.certificate ? 'text-emerald-700' : candidate.eligible ? 'text-emerald-700' : 'text-amber-700'}`}>{candidate.certificate?.revokedAt ? 'Certificate revoked' : candidate.certificate ? `Certificate issued as ${candidate.certificate.studentName} · ${candidate.certificate.code}` : candidate.eligible ? 'Eligible for certificate' : candidate.outstanding.join(' · ') || 'Not eligible'}</p>
                {editingCertificate?.id === candidate.certificate?.id && <form className="mt-2 flex flex-wrap gap-2" onSubmit={saveCertificateName}><input className="input min-w-0 flex-1" aria-label="Certificate name" required minLength={2} maxLength={120} value={editingCertificate.studentName} onChange={(event) => setEditingCertificate((current) => ({ ...current, studentName: event.target.value }))} /><button className="btn-primary" disabled={savingCertificateName}>{savingCertificateName ? <Spinner size={15} /> : <Check size={15} />}Save name</button><button type="button" className="btn-secondary" disabled={savingCertificateName} onClick={() => setEditingCertificate(null)}>Cancel</button></form>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">{candidate.certificate && !candidate.certificate.revokedAt ? <><button className="btn-secondary" onClick={() => downloadCertificate(candidate.certificate)}>Download PDF</button><button className="btn-secondary" onClick={() => shareCertificate(candidate.certificate)}><Share2 size={15} />Share</button><Link className="btn-secondary" to={candidate.certificate.verificationPath}>Verify</Link><button className="btn-secondary" onClick={() => setEditingCertificate({ id: candidate.certificate.id, studentName: candidate.certificate.studentName })}><Pencil size={15} />Edit name</button></> : <button className="btn-primary" disabled={!candidate.eligible || issuingIds.length > 0} onClick={() => issueForStudents([candidate.studentId])}>{issuingIds.includes(candidate.studentId) ? <Spinner size={15} /> : <Award size={15} />}Issue certificate</button>}</div>
            </article>)}</div>
            {certificatePages > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={certificatePage <= 1} onClick={() => setCertificatePage((page) => page - 1)}><ChevronLeft size={16} />Previous</button><span className="text-sm text-slate-500">Page {certificatePage} of {certificatePages}</span><button className="btn-secondary" disabled={certificatePage >= certificatePages} onClick={() => setCertificatePage((page) => page + 1)}>Next<ChevronRight size={16} /></button></div>}
          </>}
        </section>}
        {course.enrolled && completion && <section className="mt-8 border-t border-slate-200 pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Course completion</h2><p className="mt-1 text-sm text-slate-600">{completion.eligible ? 'All configured completion requirements are met.' : 'Finish the remaining requirements to earn your certificate.'}</p></div>{certificate && !certificate.revoked ? <button className="btn-primary" onClick={downloadCertificate}>Download certificate</button> : completion.eligible && <button className="btn-primary" onClick={issueCertificate}>Issue certificate</button>}</div><ul className="mt-3 space-y-2">{completion.checks.map((check) => <li key={check.key} className="flex items-start gap-2 text-sm"><span className={check.complete ? 'text-emerald-600' : 'text-amber-600'}>{check.complete ? '✓' : '○'}</span><span><span className="font-medium text-slate-800">{check.label}</span><span className="ml-2 text-slate-500">{check.detail}</span></span></li>)}</ul>{certificate && <p className="mt-3 text-xs text-slate-500">Certificate ID {certificate.code} · <Link className="text-brand-700 underline" to={certificate.verificationPath}>Verify</Link></p>}</section>}
      </div>
    </section>
  </div>;
}
