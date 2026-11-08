import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Award, BadgeCheck, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, Clock3, Download,
  ExternalLink, FileCheck2, GraduationCap, Link2, Loader2, LockKeyhole, Pencil, PlayCircle, Send, Share2,
  ShieldCheck, Target, Trash2, Users, Video, Wallet,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader, ProgressBar } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import CourseThumbnail from '../components/CourseThumbnail.jsx';
import CertificationAssessment from '../components/CertificationAssessment.jsx';
import AssessmentSettingsEditor from '../components/AssessmentSettingsEditor.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

const paymentTone = { not_required: 'slate', unpaid: 'amber', pending: 'brand', paid: 'green', rejected: 'red', waived: 'green' };
const paymentLabel = { not_required: 'No payment required', unpaid: 'Payment due', pending: 'Payment under review', paid: 'Payment confirmed', rejected: 'Payment needs attention', waived: 'Payment waived' };
const projectTone = { submitted: 'brand', approved: 'green', changes_requested: 'amber' };
const projectLabel = { submitted: 'Submitted — awaiting review', approved: 'Approved', changes_requested: 'Changes requested' };

function CheckRow({ check }) {
  return <li className="flex items-start gap-3 rounded-xl border border-slate-100 p-3.5">
    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${check.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{check.complete ? <CheckCircle2 size={15} /> : <Clock3 size={14} />}</span>
    <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{check.label}</p>{check.detail && <p className="mt-0.5 text-xs text-slate-500">{check.detail}</p>}</div>
  </li>;
}

function Fact({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200"><Icon size={15} /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-semibold text-slate-800">{value || '—'}</p></div></div>;
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const admin = isAdmin(user);
  const [course, setCourse] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [project, setProject] = useState(null);
  const [adminData, setAdminData] = useState({ candidates: [], submissions: [], courseCertificates: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [paymentForm, setPaymentForm] = useState({ reference: '', note: '' });
  const [certificatePaymentForm, setCertificatePaymentForm] = useState({ reference: '', note: '' });
  const [projectForm, setProjectForm] = useState({ linkUrl: '', description: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: 'approved', feedback: '' });
  const [selectedCandidates, setSelectedCandidates] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const courseResponse = await api.get(`/courses/${id}`);
      const nextCourse = courseResponse.data.data.course;
      setCourse(nextCourse);
      if (admin) {
        const [candidatesResponse, submissionsResponse] = await Promise.all([
          api.get(`/courses/${id}/certificate-candidates`, { params: { limit: 100 } }),
          api.get(`/courses/${id}/project-submissions`, { params: { limit: 50 } }),
        ]);
        setAdminData({ candidates: candidatesResponse.data.data.candidates, submissions: submissionsResponse.data.data.submissions, total: candidatesResponse.data.data.total });
      } else if (nextCourse.enrolled) {
        const requests = [
          api.get(`/courses/${id}/completion`),
          api.get('/certificates/mine'),
          api.get(`/courses/${id}/certification-assessment`),
          api.get(`/courses/${id}/project-submission`),
        ];
        const settled = await Promise.allSettled(requests);
        if (settled[0].status === 'fulfilled') setCompletion(settled[0].value.data.data);
        if (settled[1].status === 'fulfilled') setCertificates(settled[1].value.data.data.certificates);
        if (settled[2].status === 'fulfilled') setAssessment(settled[2].value.data.data);
        if (settled[3].status === 'fulfilled') {
          setProject(settled[3].value.data.data);
          const submission = settled[3].value.data.data.submission;
          if (submission) setProjectForm({ linkUrl: submission.linkUrl || '', description: submission.description || '' });
        }
      }
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [admin, id, toast]);

  useEffect(() => { load(); }, [load]);

  const certificate = useMemo(() => certificates.find((item) => item.courseId === id), [certificates, id]);

  const enroll = async () => {
    setBusy('enroll');
    try {
      await api.post(`/courses/${id}/enroll`);
      toast.success('You are enrolled. Complete the first requirements to unlock your certificate.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const leaveTraining = async () => {
    const confirmed = await dialog.confirm({ title: 'Leave this training?', message: 'Your enrollment will be cancelled. Your attendance and submission history are kept for administration.', confirmLabel: 'Leave training', tone: 'danger' });
    if (!confirmed) return;
    setBusy('leave');
    try { await api.delete(`/courses/${id}/enroll`); toast.success('You left the training.'); await load(); }
    catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    setBusy('payment');
    try {
      await api.post(`/courses/${id}/payment-reference`, paymentForm);
      toast.success('Payment reference submitted. The administrator will review it.');
      setPaymentForm({ reference: '', note: '' });
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const submitProject = async (event) => {
    event.preventDefault();
    setBusy('project');
    try {
      await api.post(`/courses/${id}/project-submission`, projectForm);
      toast.success('Project submitted for review.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const issueCertificate = async () => {
    setBusy('certificate');
    try {
      const response = await api.post(`/courses/${id}/certificate`);
      setCertificates((current) => [response.data.data.certificate, ...current.filter((item) => item.id !== response.data.data.certificate.id)]);
      toast.success(response.data.data.certificate.paymentStatus === 'unpaid' ? 'Certificate earned. Submit its payment reference to unlock the PDF.' : 'Certificate issued.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const submitCertificatePayment = async (event) => {
    event.preventDefault();
    setBusy('certificate-payment');
    try {
      const response = await api.post(`/courses/${id}/certificate/payment-reference`, certificatePaymentForm);
      setCertificates((current) => [response.data.data.certificate, ...current.filter((item) => item.id !== response.data.data.certificate.id)]);
      setCertificatePaymentForm({ reference: '', note: '' });
      toast.success('Certificate payment submitted for review.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const download = async (target = certificate) => {
    if (!target) return;
    try {
      const response = await api.get(`/certificates/${target.code}.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ishconnect-certificate-${target.code}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(apiError(error).message); }
  };

  const share = async (target = certificate) => {
    if (!target) return;
    const url = `${window.location.origin}/verify/${target.code}`;
    try {
      if (navigator.share) await navigator.share({ title: `${target.courseTitle} certificate`, text: `Verified QuickLink certificate for ${target.studentName}`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Verification link copied.'); }
    } catch (error) { if (error.name !== 'AbortError') toast.error('Could not share the certificate link.'); }
  };

  const issueSelected = async () => {
    if (!selectedCandidates.length) return;
    if (selectedCandidates.length > 20) { toast.error('Select at most 20 students per batch.'); return; }
    setBusy('batch');
    try {
      const response = await api.post(`/courses/${id}/certificates/issue`, { studentIds: selectedCandidates });
      const { issuedCount, results } = response.data.data;
      const failures = results.filter((result) => !result.issued);
      toast.success(`${issuedCount} certificate${issuedCount === 1 ? '' : 's'} issued.`);
      if (failures.length) toast.error(`${failures.length} could not be issued. Check the outstanding requirements.`);
      setSelectedCandidates([]);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const openReview = (submission) => {
    setReviewing(submission);
    setReviewForm({ status: submission.status === 'approved' ? 'approved' : 'changes_requested', feedback: submission.feedback || '' });
  };

  const saveReview = async () => {
    if (!reviewing) return;
    setBusy('review');
    try {
      await api.patch(`/courses/${id}/project-submissions/${reviewing.id}`, reviewForm);
      toast.success('Project review saved.');
      setReviewing(null);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  const toggleArchive = async () => {
    if (!course) return;
    if (course.active) {
      const approved = await dialog.confirm({ title: 'Archive this training?', message: 'Students keep their records, but the training is hidden from the catalog and new live sessions cannot start.', confirmLabel: 'Archive', tone: 'danger' });
      if (!approved) return;
      setBusy('archive');
      try { await api.delete(`/classes/${id}`); toast.success('Training archived.'); await load(); }
      catch (error) { toast.error(apiError(error).message); }
      finally { setBusy(''); }
    } else {
      setBusy('archive');
      try { await api.patch(`/classes/${id}`, { active: true }); toast.success('Training restored.'); await load(); }
      catch (error) { toast.error(apiError(error).message); }
      finally { setBusy(''); }
    }
  };

  const deleteTraining = async () => {
    if (!course) return;
    const approved = await dialog.confirm({
      title: 'Delete this training permanently?',
      message: 'This removes the training and its enrollments, submissions, certificates, registration records, attendance, and learning materials. This cannot be undone. End any live class first.',
      confirmLabel: 'Delete training',
      tone: 'danger',
    });
    if (!approved) return;
    setBusy('delete');
    try {
      await api.delete(`/classes/${id}/permanent`);
      toast.success('Training deleted.');
      navigate('/courses', { replace: true });
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(''); }
  };

  if (loading && !course) return <PageLoader label="Opening training…" />;
  if (!course) return <EmptyState title="Training not found" description="It may have been removed or is unavailable." action={<Link to="/courses" className="btn-primary">Back to trainings</Link>} />;

  const payment = course.enrollment?.payment || null;
  const assessmentConfigured = course.assessment?.enabled;
  const eligibleCandidates = adminData.candidates.filter((candidate) => candidate.eligible && !candidate.certificate);

  return <div className="pb-4">
    <button onClick={() => navigate(admin ? '/courses' : '/courses')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />Back to trainings</button>

    <section className="mb-5 overflow-hidden rounded-3xl border border-green-100 bg-white shadow-sm shadow-green-950/[0.04]">
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-72 lg:w-80"><CourseThumbnail imageUrl={course.thumbnailUrl} title={course.title} className="absolute inset-0" /><div className="absolute inset-0 bg-green-50 sm:bg-green-50" /></div>
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap gap-1.5"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge>{course.trade && <Badge color="slate">{course.trade}</Badge>}{course.enrolled && <Badge color="green">Enrolled</Badge>}{!course.active && <Badge color="red">Archived</Badge>}{!course.published && <Badge color="amber">Draft</Badge>}</div>
          <h1 className="mt-3 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{course.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{course.introduction || course.description || 'Open this training to review its schedule, payment rules, projects, and certification requirements.'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Users size={14} />{course.enrolledCount}{course.maxStudents ? `/${course.maxStudents}` : ''} enrolled</span>
            {course.startsAt && <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />Starts {formatDateTime(course.startsAt)}</span>}
            {course.payment?.enabled && <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700"><Wallet size={14} />{formatMoney(course.payment.amount, course.payment.currency)} · {course.payment.freeDays} free days</span>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {admin ? <>
              <Link to={`/courses/${id}/learn`} className="btn-secondary"><ClipboardCheck size={16} />Manage lessons</Link>
              <Link to={`/courses/${id}/edit`} className="btn-primary"><Pencil size={16} />Edit training</Link>
              <Link to={`/classes/${id}`} className="btn-secondary"><Video size={16} />Live classroom</Link>
              <button className="btn-secondary" onClick={() => setSettingsOpen(true)}><Target size={16} />Assessment setup</button>
              <button className="btn-secondary" onClick={toggleArchive} disabled={busy === 'archive'}>{busy === 'archive' ? <Spinner size={15} /> : course.active ? <LockKeyhole size={15} /> : <PlayCircle size={15} />}{course.active ? 'Archive' : 'Restore'}</button>
              <button className="btn-ghost text-red-700" onClick={deleteTraining} disabled={busy === 'delete'}>{busy === 'delete' ? <Spinner size={15} /> : <Trash2 size={15} />}Delete permanently</button>
            </> : course.enrolled ? <>
              <Link to={`/courses/${id}/learn`} className="btn-primary"><BookOpen size={16} />Continue learning</Link>
              <Link to={`/classes/${id}`} className="btn-primary"><Video size={16} />Open classroom</Link>
              {course.allowCancellation && <button className="btn-secondary" onClick={leaveTraining} disabled={busy === 'leave'}>{busy === 'leave' ? <Spinner size={15} /> : null}Leave training</button>}
            </> : <button className="btn-primary" onClick={enroll} disabled={busy === 'enroll' || course.enrollmentStatus !== 'open'}>{busy === 'enroll' ? <Spinner size={16} /> : <Users size={16} />}{course.enrollmentStatus === 'open' ? 'Enroll in this training' : course.enrollmentStatus === 'closed' ? 'Enrollment closed' : course.enrollmentStatus === 'full' ? 'Training full' : course.enrollmentStatus}</button>}
          </div>
        </div>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        {admin ? <>
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Training overview</p><h2 className="mt-1 text-base font-bold text-slate-950">Operations snapshot</h2></div><Link to={`/enrollments?search=${encodeURIComponent(course.title)}`} className="btn-secondary">Enrollment ledger</Link></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fact icon={Users} label="Enrolled" value={`${course.enrolledCount} / ${course.maxStudents}`} />
              <Fact icon={Target} label="Assessment" value={assessmentConfigured ? `${course.assessment.questionCount} questions` : 'Not enabled'} />
              <Fact icon={ClipboardCheck} label="Project" value={course.projectSubmission?.enabled ? (course.projectSubmission.required ? 'Required' : 'Optional') : 'Disabled'} />
              <Fact icon={Wallet} label="Payment" value={course.payment?.enabled ? `${formatMoney(course.payment.amount, course.payment.currency)} · ${course.payment.freeDays} days free` : 'Not required'} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Certification</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Award size={18} className="text-brand-700" />Certificate candidates</h2><p className="mt-1 text-sm text-slate-500">Bulk issue up to 20 eligible students at a time. Requirements are checked on the server.</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => setSelectedCandidates(eligibleCandidates.slice(0, 20).map((candidate) => candidate.studentId))} disabled={!eligibleCandidates.length}>Select eligible</button><button className="btn-primary" onClick={issueSelected} disabled={!selectedCandidates.length || busy === 'batch'}>{busy === 'batch' ? <Spinner size={16} /> : <Award size={16} />}Issue ({selectedCandidates.length})</button></div></div>
            {adminData.candidates.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><tr><th className="w-8 py-2 pr-2"><input type="checkbox" checked={eligibleCandidates.length > 0 && eligibleCandidates.slice(0, 20).every((candidate) => selectedCandidates.includes(candidate.studentId))} onChange={(event) => setSelectedCandidates(event.target.checked ? eligibleCandidates.slice(0, 20).map((candidate) => candidate.studentId) : [])} aria-label="Select eligible candidates" /></th><th className="px-2 py-2">Student</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Certificate</th></tr></thead><tbody className="divide-y divide-slate-100">{adminData.candidates.map((candidate) => { const selectable = candidate.eligible && !candidate.certificate; return <tr key={candidate.studentId}><td className="py-2.5 pr-2"><input type="checkbox" disabled={!selectable} checked={selectedCandidates.includes(candidate.studentId)} onChange={(event) => setSelectedCandidates(event.target.checked ? [...selectedCandidates, candidate.studentId].slice(0, 20) : selectedCandidates.filter((value) => value !== candidate.studentId))} aria-label={`Select ${candidate.name}`} /></td><td className="px-2 py-2.5"><p className="font-semibold text-slate-800">{candidate.name}</p><p className="text-xs text-slate-400">{candidate.email}</p></td><td className="px-2 py-2.5">{candidate.eligible ? <Badge color="green">Eligible</Badge> : <><Badge color="amber">Not ready</Badge><p className="mt-1 max-w-56 text-[11px] leading-4 text-slate-400">{candidate.outstanding.slice(0, 2).join(' · ')}</p></>}</td><td className="px-2 py-2.5">{candidate.certificate ? <div className="flex flex-wrap items-center gap-1.5"><Badge color={candidate.certificate.revoked ? 'red' : 'green'}>{candidate.certificate.revoked ? 'Revoked' : 'Issued'}</Badge><Link to="/certificates" className="text-xs font-semibold text-brand-700">Manage</Link></div> : <span className="text-xs text-slate-400">Not issued</span>}</td></tr>; })}</tbody></table></div> : <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No students are enrolled yet.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div><p className="eyebrow">Review queue</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><ClipboardCheck size={18} className="text-brand-700" />Project submissions</h2><p className="mt-1 text-sm text-slate-500">Review student work and request changes before certification.</p></div>
            {adminData.submissions.length ? <div className="mt-4 space-y-2">{adminData.submissions.map((submission) => <div key={submission.id} className="rounded-xl border border-slate-100 p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-slate-800">{submission.student?.name || 'Student'} <span className="font-normal text-slate-400">· {submission.student?.email}</span></p><p className="mt-0.5 text-xs text-slate-400">Submitted {formatDateTime(submission.submittedAt)}</p></div><Badge color={projectTone[submission.status] || 'slate'}>{projectLabel[submission.status] || submission.status}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{submission.description || 'No description submitted.'}</p><div className="mt-2 flex flex-wrap gap-2"><a href={submission.linkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Link2 size={13} />Open project <ExternalLink size={11} /></a><button className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" onClick={() => openReview(submission)}>Review</button></div></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No project submissions yet.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div><p className="eyebrow">Roster</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Users size={18} className="text-brand-700" />Enrolled students</h2></div>
            {course.students?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{course.students.map((student) => <div key={student.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-brand-800">{student.name?.slice(0, 1)?.toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{student.name}</span><span className="block truncate text-xs text-slate-400">{student.email}</span></span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No students enrolled.</p>}
          </section>
        </> : <>
          {course.enrolled && payment && course.payment?.enabled && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Payment</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Wallet size={18} className="text-brand-700" />Training payment</h2></div><Badge color={paymentTone[payment.status] || 'slate'}>{paymentLabel[payment.status] || payment.status}</Badge></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><Fact icon={Wallet} label="Amount" value={formatMoney(payment.amount, payment.currency)} /><Fact icon={Clock3} label="Free access" value={payment.allowed ? `Until ${formatDateTime(payment.freeUntil)}` : `Ended ${formatDateTime(payment.freeUntil)}`} /><Fact icon={ShieldCheck} label="Status" value={payment.allowed ? 'Access active' : 'Payment required'} /></div>
            {!['paid', 'waived'].includes(payment.status) && <>
              <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm"><p className="font-semibold text-brand-950">Pay using code {payment.paymentCode || course.payment.paymentCode}</p><p className="text-xs text-brand-900">Account name: {payment.paymentName || course.payment.paymentName || '—'}</p><p className="mt-1 text-xs leading-5 text-brand-800">{payment.instructions || course.payment.instructions || 'Submit your transaction reference after payment.'}</p></div>
              {payment.status === 'pending' ? <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-800">Your reference {payment.paymentReference ? `(${payment.paymentReference}) ` : ''}is under review. You will be notified when it is verified.</p> : <form onSubmit={submitPayment} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><input required minLength={3} maxLength={200} className="input" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="Transaction reference" aria-label="Transaction reference" /><input maxLength={1000} className="input" value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} placeholder="Optional note" aria-label="Payment note" /><button className="btn-primary" disabled={busy === 'payment'}>{busy === 'payment' ? <Spinner size={16} /> : <Send size={15} />}Submit</button></form>}
              {payment.status === 'rejected' && <p className="mt-2 text-xs font-semibold text-red-700">Your previous reference was rejected. Review any note and submit again.</p>}
            </>}
            {['paid', 'waived'].includes(payment.status) && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">Payment verified. You have full access to live classes and submissions.</p>}
          </section>}

          {course.enrolled && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Completion</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><BadgeCheck size={18} className="text-brand-700" />Your certificate requirements</h2></div>{completion ? <Badge color={completion.eligible ? 'green' : 'amber'}>{completion.eligible ? 'Eligible' : 'In progress'}</Badge> : null}</div>
            {completion?.checks?.length ? <><div className="mt-3"><ProgressBar value={Math.round(completion.checks.filter((check) => check.complete).length / completion.checks.length * 100)} tone={completion.eligible ? 'green' : 'brand'} /></div><ul className="mt-3 space-y-2">{completion.checks.map((check) => <CheckRow key={check.key} check={check} />)}</ul></> : <p className="mt-3 text-sm text-slate-500">No certificate requirements are configured yet.</p>}
            {completion?.outstanding?.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-semibold">Still outstanding</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{completion.outstanding.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          </section>}

          {course.enrolled && course.projectSubmission?.enabled && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Practical project</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><ClipboardCheck size={18} className="text-brand-700" />{course.projectSubmission.title || 'Project submission'}</h2>{course.projectSubmission.required && <p className="mt-1 text-xs font-semibold text-amber-700">Required before the assessment and certificate.</p>}</div>{project?.submission && <Badge color={projectTone[project.submission.status] || 'slate'}>{projectLabel[project.submission.status] || project.submission.status}</Badge>}</div>
            {course.projectSubmission.instructions && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{course.projectSubmission.instructions}</p>}
            {project?.submission?.feedback && <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-brand-900"><p className="font-semibold">Trainer feedback</p><p className="mt-1 whitespace-pre-wrap">{project.submission.feedback}</p></div>}
            {project?.submission?.status === 'approved' ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} />Your project is approved.<a href={project.submission.linkUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Open submission</a></div> : <form onSubmit={submitProject} className="mt-3 space-y-2"><label className="block"><span className="label">Project link</span><input type="url" required minLength={5} maxLength={2000} className="input" value={projectForm.linkUrl} onChange={(event) => setProjectForm({ ...projectForm, linkUrl: event.target.value })} placeholder="https://github.com/your-project or another project URL" /></label><label className="block"><span className="label">Description</span><textarea className="input min-h-24" maxLength={4000} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="Explain what you built, the tools you used, and how to review it." /></label><div className="flex flex-wrap items-center gap-2"><button className="btn-primary" disabled={busy === 'project'}>{busy === 'project' ? <Spinner size={16} /> : <Send size={15} />}{project?.submission ? 'Resubmit project' : 'Submit project'}</button>{project?.submission && <span className="text-xs text-slate-400">Resubmitting replaces your previous project and resets review.</span>}</div></form>}
          </section>}

          {course.enrolled && <CertificationAssessment courseId={id} initial={assessment} onRefresh={load} />}

          {course.enrolled && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Certification</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Award size={18} className="text-brand-700" />Your certificate</h2></div>{certificate && <Badge color={certificate.revoked ? 'red' : 'green'}>{certificate.revoked ? 'Revoked' : 'Valid'}</Badge>}</div>
            {certificate ? <div className="mt-3"><p className="text-sm text-slate-600">{certificate.studentName} · {certificate.courseTitle}</p><p className="mt-1 text-xs text-slate-400">Issued {formatDateTime(certificate.issuedAt)} · {certificate.code}</p>{certificate.revoked ? <p className="mt-2 text-xs text-red-700">This certificate was revoked{certificate.revocationReason ? `: ${certificate.revocationReason}` : '.'}</p> : ['unpaid', 'pending', 'rejected'].includes(certificate.paymentStatus) ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-semibold text-amber-950">Certificate payment · {certificate.paymentStatus === 'pending' ? 'Under review' : formatMoney(certificate.paymentAmount, certificate.paymentCurrency)}</p>{certificate.paymentStatus === 'pending' ? <p className="mt-1 text-sm text-amber-900">Reference {certificate.paymentReference} was submitted and is awaiting administrator confirmation.</p> : <><p className="mt-1 text-sm text-amber-900">Pay using code {course.certificatePayment?.paymentCode} · account {course.certificatePayment?.paymentName}.</p>{course.certificatePayment?.instructions && <p className="mt-1 text-xs leading-5 text-amber-900">{course.certificatePayment.instructions}</p>}{certificate.paymentStatus === 'rejected' && certificate.paymentNote && <p className="mt-2 text-xs text-red-800">Review note: {certificate.paymentNote}</p>}<form onSubmit={submitCertificatePayment} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required minLength={3} maxLength={200} className="input bg-white" value={certificatePaymentForm.reference} onChange={(event) => setCertificatePaymentForm({ ...certificatePaymentForm, reference: event.target.value })} placeholder="Payment reference" aria-label="Certificate payment reference"/><input maxLength={1000} className="input bg-white" value={certificatePaymentForm.note} onChange={(event) => setCertificatePaymentForm({ ...certificatePaymentForm, note: event.target.value })} placeholder="Optional note" aria-label="Certificate payment note"/><button className="btn-primary" disabled={busy === 'certificate-payment'}>{busy === 'certificate-payment' ? <Spinner size={15}/> : <Send size={15}/>}Submit</button></form></>}</div> : <><div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={() => download(certificate)}><Download size={15} />Download PDF</button><button className="btn-secondary" onClick={() => share(certificate)}><Share2 size={15} />Share</button><Link to={`/verify/${certificate.code}`} className="btn-secondary"><ShieldCheck size={15} />Verify</Link></div></>}</div> : completion?.eligible ? <div className="mt-3"><p className="text-sm text-slate-600">All requirements are complete. {course.certificatePayment?.enabled ? 'Earn your certificate, then submit its payment reference to unlock the verified PDF.' : 'Your certificate will be free.'}</p><button className="btn-primary mt-3" onClick={issueCertificate} disabled={busy === 'certificate'}>{busy === 'certificate' ? <Spinner size={16} /> : <Award size={16} />}Generate certificate</button></div> : <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Complete all requirements above to unlock your certificate.</div>}
          </section>}
        </>}
      </div>

      <aside className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
          <h2 className="text-sm font-bold text-slate-900">Training details</h2>
          <div className="mt-3 space-y-2">
            <Fact icon={GraduationCap} label="Level" value={course.level} />
            <Fact icon={GraduationCap} label="Difficulty" value={course.difficulty} />
            {course.courseDuration && <Fact icon={Clock3} label="Course duration" value={course.courseDuration} />}
            {course.language && <Fact icon={BookOpen} label="Language" value={course.language} />}
            {course.instructorName && <Fact icon={Users} label="Instructor" value={course.instructorName} />}
            <Fact icon={CalendarClock} label="Starts" value={course.startsAt ? formatDateTime(course.startsAt) : 'Self-paced / not scheduled'} />
            <Fact icon={Clock3} label="Session length" value={`${course.durationMinutes} minutes`} />
            <Fact icon={Users} label="Capacity" value={`${course.enrolledCount} of ${course.maxStudents} seats filled`} />
            <Fact icon={Video} label="Schedule" value={course.schedule || 'Announced by the trainer'} />
            <Fact icon={ShieldCheck} label="Time zone" value={course.timezone} />
          </div>
        </section>
        {(course.learningObjectives?.length > 0 || course.prerequisites?.length > 0 || course.instructorBio) && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">{course.learningObjectives?.length > 0 && <div><h2 className="font-bold text-slate-900">What you will learn</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{course.learningObjectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul></div>}{course.prerequisites?.length > 0 && <div className="mt-4"><h2 className="font-bold text-slate-900">Before you begin</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{course.prerequisites.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></div>}{course.instructorBio && <div className="mt-4"><h2 className="font-bold text-slate-900">About the instructor</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{course.instructorBio}</p></div>}</section>}
        {course.description && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5"><h2 className="text-sm font-bold text-slate-900">About this training</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{course.description}</p></section>}
        <section className="rounded-2xl border border-green-100 bg-green-50 p-4 shadow-sm shadow-green-950/[0.03] sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileCheck2 size={16} className="text-brand-700" />What you earn</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600"><li className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />Live trainer-led classes and attendance tracking</li><li className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />Project review and structured feedback</li><li className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />Certification assessment with up to {course.assessment?.attempts || 3} attempts</li><li className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />A verifiable QuickLink certificate you can share</li></ul>
        </section>
        {!admin && !course.enrolled && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm shadow-sm shadow-slate-900/[0.03] sm:p-5"><p className="font-semibold text-slate-900">Enrollment status</p><p className="mt-1 text-slate-500">{course.enrollmentStatus === 'open' ? `${course.seatsAvailable} seat${course.seatsAvailable === 1 ? '' : 's'} available.` : course.enrollmentStatus === 'full' ? 'This training is currently full.' : course.enrollmentStatus === 'closed' ? 'Enrollment is closed.' : 'This training is not open for enrollment.'}</p></section>}
      </aside>
    </div>

    {admin && <AssessmentSettingsEditor courseId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} />}

    <Modal open={Boolean(reviewing)} onClose={() => !busy && setReviewing(null)} title="Review project submission" footer={<><button className="btn-secondary" onClick={() => setReviewing(null)} disabled={busy === 'review'}>Cancel</button><button className="btn-primary" onClick={saveReview} disabled={busy === 'review'}>{busy === 'review' ? <Spinner size={16} /> : <CheckCircle2 size={16} />}Save review</button></>}>
      {reviewing && <div className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-900">{reviewing.student?.name}</p><a href={reviewing.linkUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs font-semibold text-brand-700 hover:underline">{reviewing.linkUrl} <ExternalLink size={11} /></a><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{reviewing.description || 'No description.'}</p></div><label className="block"><span className="label">Decision</span><select className="input" value={reviewForm.status} onChange={(event) => setReviewForm({ ...reviewForm, status: event.target.value })}><option value="approved">Approve project</option><option value="changes_requested">Request changes</option></select></label><label className="block"><span className="label">Feedback to student</span><textarea className="input min-h-28" maxLength={2000} value={reviewForm.feedback} onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })} placeholder="Explain what works and what should be improved." /></label></div>}
    </Modal>
  </div>;
}
