import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, Clock3, Copy, FileText, GraduationCap, Link2, Mail,
  MessageCircle, Pencil, Play, Radio, RotateCw, Send, ShieldCheck, Users, Video, Wallet, XCircle,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import CourseThumbnail from '../components/CourseThumbnail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { formatDateTime, formatDuration, formatMoney } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

const inviteTone = { sent: 'green', pending: 'brand', accepted: 'green', failed: 'red', expired: 'amber', revoked: 'slate' };

export default function ClassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const admin = isAdmin(user);
  const [item, setItem] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waitingError, setWaitingError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [busyInvite, setBusyInvite] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [classResponse, sessionResponse] = await Promise.all([api.get(`/classes/${id}`), api.get(`/classes/${id}/sessions`)]);
      setItem(classResponse.data.data.class);
      setSessions(sessionResponse.data.data.sessions);
      setWaitingError('');
    } catch (error) {
      if (!quiet) toast.error(apiError(error).message);
      else setWaitingError(apiError(error).message);
    } finally { if (!quiet) setLoading(false); }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!item || item.liveSession || !item.active) return undefined;
    const timer = window.setInterval(() => load(true), 12000);
    return () => window.clearInterval(timer);
  }, [item, load]);

  const sessionLink = item?.liveSession ? `${window.location.origin}/classes/join/${item.liveSession.sessionCode}` : '';
  const payment = item?.paymentState || item?.enrollment?.payment || null;
  const paymentBlocked = !admin && payment && !payment.allowed;
  const paymentPending = !admin && item?.enrollment?.payment?.status === 'pending';

  const startClass = async () => {
    setStarting(true);
    try {
      const response = await api.post(`/classes/${id}/sessions`, { title: item.title });
      toast.success('Live class started.');
      navigate(`/classes/sessions/${response.data.data.session.id}/live`);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setStarting(false); }
  };

  const endLiveSession = async () => {
    const approved = await dialog.confirm({ title: 'End this live class?', message: 'The session will end for everyone. Attendance and the class report are saved automatically.', confirmLabel: 'End live class', tone: 'danger' });
    if (!approved) return;
    setEnding(true);
    try {
      await api.post(`/classes/sessions/${item.liveSession.id}/end`, { teacherNotes: '' });
      toast.success('Live class ended and attendance saved.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEnding(false); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(sessionLink);
      setCopied(true);
      toast.success('Live class link copied. Only enrolled students can use it.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy the link. Select and copy it manually.'); }
  };

  const openInvitations = async () => {
    setInviteOpen(true);
    setSelectedInviteIds([]);
    setInviteLoading(true);
    try {
      const response = await api.get(`/classes/${id}/invitations`);
      setInvitations(response.data.data.invitations);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setInviteLoading(false); }
  };

  const sendInvitations = async () => {
    if (!selectedInviteIds.length) return;
    setInviteSaving(true);
    try {
      const response = await api.post(`/classes/${id}/invitations`, { studentIds: selectedInviteIds });
      setInvitations(response.data.data.invitations);
      const failed = response.data.data.invitations.filter((invite) => invite.status === 'failed').length;
      if (failed) toast.error(`${failed} invitation${failed === 1 ? '' : 's'} could not be emailed. Use the WhatsApp link shown below.`);
      else toast.success('Invitations processed. Email and WhatsApp details are listed below.');
      setSelectedInviteIds([]);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setInviteSaving(false); }
  };

  const invitationAction = async (invite, action) => {
    setBusyInvite(invite.id);
    try {
      if (action === 'resend') await api.post(`/classes/${id}/invitations/${invite.id}/resend`);
      else await api.delete(`/classes/${id}/invitations/${invite.id}`);
      const response = await api.get(`/classes/${id}/invitations`);
      setInvitations(response.data.data.invitations);
      toast.success(action === 'resend' ? 'Invitation resent.' : 'Invitation revoked.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyInvite(''); }
  };

  const shareWhatsApp = (invite) => {
    if (!invite.whatsappUrl) { toast.info('No usable WhatsApp number is available for this student.'); return; }
    window.open(invite.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const joinableSessions = useMemo(() => sessions.filter((session) => session.status === 'live'), [sessions]);

  if (loading) return <PageLoader label="Opening live classroom…" />;
  if (!item) return <EmptyState icon={Video} title="Class unavailable" description="This training may be archived, removed, or not part of your enrollment." action={<Link to="/classes" className="btn-primary">Back to live classes</Link>} />;

  return <div className="min-w-0">
    <Link to="/classes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />Back to live classes</Link>

    <section className="relative mb-5 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm shadow-orange-950/[0.04]">
      <CourseThumbnail imageUrl={item.thumbnailUrl} title={item.title} loading="eager" className="absolute inset-0 opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/70" />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-wrap gap-1.5"><Badge color="brand">{item.level}</Badge><Badge>{item.subject}</Badge>{item.course && <Badge color="slate">{item.course}</Badge>}{item.liveSession && <Badge color="red"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live now</Badge>}{!item.active && <Badge color="slate">Archived</Badge>}</div>
        <h1 className="mt-3 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{item.title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{item.introduction || item.description || 'Your live classroom, attendance history, and session reports appear here.'}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><Users size={14} />{item.enrolledCount} enrolled</span>
          {item.startsAt && <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />Starts {formatDateTime(item.startsAt)}</span>}
          {item.schedule && <span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{item.schedule}</span>}
          <span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{item.durationMinutes} minute sessions</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {item.liveSession && <Link to={`/classes/sessions/${item.liveSession.id}/live`} className="btn-primary"><Radio size={16} />Join live class</Link>}
          {admin && <>
            <Link to={`/courses/${id}/edit`} className="btn-secondary"><Pencil size={16} />Edit training</Link>
            <Link to={`/courses/${id}`} className="btn-secondary"><GraduationCap size={16} />Training page</Link>
            <Link to={`/enrollments?search=${encodeURIComponent(item.title)}`} className="btn-secondary"><Users size={16} />Enrollments</Link>
            <button className="btn-secondary" onClick={openInvitations}><Mail size={16} />Invitations</button>
            {item.active && !item.liveSession && <button className="btn-primary" onClick={startClass} disabled={starting}>{starting ? <Spinner size={16} /> : <Play size={16} />}{starting ? 'Starting…' : 'Start live class'}</button>}
            {item.liveSession && <button className="btn-danger" onClick={endLiveSession} disabled={ending}>{ending ? <Spinner size={16} /> : <XCircle size={16} />}End live class</button>}
          </>}
          {!admin && <Link to={`/courses/${id}`} className="btn-secondary"><GraduationCap size={16} />Training requirements</Link>}
        </div>
      </div>
    </section>

    {!admin && payment && item.payment?.enabled && <section className={`mb-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${paymentBlocked ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${paymentBlocked ? 'bg-amber-100 text-amber-700' : 'bg-orange-50 text-brand-700'}`}>{paymentBlocked ? <AlertCircle size={18} /> : <Wallet size={18} />}</span><div><p className="text-sm font-bold text-slate-900">{paymentBlocked ? 'Payment required for live media' : paymentPending ? 'Payment reference under review' : ['paid', 'waived'].includes(item.enrollment?.payment?.status) ? 'Payment confirmed' : 'Free access active'}</p><p className="mt-0.5 text-xs leading-5 text-slate-600">{paymentBlocked ? `Free access ended ${formatDateTime(payment.freeUntil)}. Submit a payment reference of ${formatMoney(payment.amount, payment.currency)} to restore live access.` : paymentPending ? 'You can attend while the administrator reviews your reference.' : payment.allowed && !['paid', 'waived'].includes(item.enrollment?.payment?.status) ? `Live access is included until ${formatDateTime(payment.freeUntil)}. Payment is ${formatMoney(payment.amount, payment.currency)}.` : 'Your enrollment has full live access.'}</p></div></div>
      {paymentBlocked && <Link to={`/courses/${id}`} className="btn-primary shrink-0"><Wallet size={16} />Submit payment reference</Link>}
    </section>}

    {item.liveSession ? <section className="mb-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge color="red"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live now</Badge><span className="text-xs text-slate-500">Started {formatDateTime(item.liveSession.startedAt)}</span></div><h2 className="mt-2 break-words text-lg font-bold text-slate-950">{item.liveSession.title || item.title}</h2><p className="mt-1 break-all text-xs text-slate-500">{sessionLink || 'Share this class from the live room.'}</p></div>
        <div className="flex shrink-0 flex-wrap gap-2">{admin && sessionLink && <button className="btn-secondary" onClick={copyLink}>{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy join link'}</button>}<Link to={`/classes/sessions/${item.liveSession.id}/live`} className="btn-primary"><Video size={17} />Enter classroom</Link>{admin && <Link to={`/classes/sessions/${item.liveSession.id}/report`} className="btn-secondary"><FileText size={16} />Report</Link>}</div>
      </div>
    </section> : <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge color="slate">Not live</Badge>{item.startsAt && <span className="text-xs text-slate-500">Scheduled {formatDateTime(item.startsAt)}</span>}</div><p className="mt-2 text-sm leading-6 text-slate-700">{admin ? 'Start a live class when you are ready. Students waiting on this page will see the join button automatically within about 12 seconds.' : paymentBlocked ? 'Live media is locked until payment is verified. You can still open class history below.' : 'This page checks automatically for the live session. Keep it open and join as soon as the trainer starts.'}</p>{waitingError && <p role="status" className="mt-2 text-xs text-amber-700">Live status could not refresh: {waitingError}</p>}</div>{admin && item.active && <button className="btn-primary shrink-0" onClick={startClass} disabled={starting}>{starting ? <Spinner size={16} /> : <Play size={16} />}Start live class</button>}</div>
    </section>}

    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Attendance history</p><h2 className="mt-1 text-base font-bold text-slate-950">Previous sessions</h2></div>{admin && <Link to={`/courses/${id}`} className="btn-secondary">Certificate candidates</Link>}</div>
        {sessions.length ? <div className="mt-4 divide-y divide-slate-100">{sessions.map((session) => <div key={session.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{session.title || item.title}</p><Badge color={session.status === 'live' ? 'red' : 'slate'}>{session.status}</Badge>{!admin && session.myAttendance && <Badge color={session.myAttendance.attended ? 'green' : 'amber'}>{session.myAttendance.attended ? session.myAttendance.status || 'Present' : 'Absent'}</Badge>}</div><p className="mt-1 text-xs text-slate-400">{formatDateTime(session.startedAt)}{session.endedAt ? ` · ${formatDuration((new Date(session.endedAt) - new Date(session.startedAt)) / 1000)}` : ''}{!admin && session.myAttendance?.totalSeconds ? ` · You attended ${formatDuration(session.myAttendance.totalSeconds)}` : ''}</p></div><div className="flex shrink-0 gap-2">{session.status === 'live' && <Link to={`/classes/sessions/${session.id}/live`} className="btn-secondary">Join</Link>}{admin && <Link to={`/classes/sessions/${session.id}/report`} className="btn-secondary"><FileText size={15} />Report</Link>}</div></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No sessions have been run yet.</p>}
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock size={16} className="text-brand-700" />Class details</h2><div className="mt-3 space-y-2 text-sm"><p className="flex justify-between gap-3"><span className="text-slate-400">Schedule</span><span className="text-right font-medium text-slate-700">{item.schedule || 'Set by admin'}</span></p><p className="flex justify-between gap-3"><span className="text-slate-400">Duration</span><span className="font-medium text-slate-700">{item.durationMinutes} minutes</span></p><p className="flex justify-between gap-3"><span className="text-slate-400">Timezone</span><span className="text-right font-medium text-slate-700">{item.timezone}</span></p><p className="flex justify-between gap-3"><span className="text-slate-400">Enrollment</span><span className="font-medium text-slate-700">{item.enrolledCount} students</span></p></div></section>
        {item.description && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5"><h2 className="text-sm font-bold text-slate-900">About the training</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.description}</p></section>}
        {admin && <section className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4 text-sm shadow-sm shadow-orange-950/[0.03] sm:p-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck size={16} className="text-brand-700" />Trainer controls</h2><p className="mt-2 text-xs leading-5 text-slate-600">Live media uses the existing LiveKit room. Only administrators can start or end sessions. Attendance records are generated when a session ends.</p><div className="mt-3 flex flex-wrap gap-2"><Link to={`/courses/${id}`} className="btn-secondary">Assessment setup</Link><Link to={`/classes/sessions/${sessions[0]?.id || ''}/report`} className={`btn-secondary ${sessions[0] ? '' : 'pointer-events-none opacity-50'}`}>Latest report</Link></div></section>}
      </aside>
    </div>

    {admin && <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Roster</p><h2 className="mt-1 text-base font-bold text-slate-950">Enrolled students</h2></div><button className="btn-secondary" onClick={openInvitations}><Send size={15} />Send invitations</button></div>{item.students?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{item.students.map((student) => <div key={student.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-brand-800">{student.name?.slice(0, 1)?.toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{student.name}</span><span className="block truncate text-xs text-slate-400">{student.email}</span></span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No students enrolled.</p>}</section>}

    <Modal open={inviteOpen} onClose={() => !inviteSaving && setInviteOpen(false)} title="Class invitations" size="lg" footer={<><button className="btn-secondary" onClick={() => setInviteOpen(false)} disabled={inviteSaving}>Close</button><button className="btn-primary" onClick={sendInvitations} disabled={!selectedInviteIds.length || inviteSaving}>{inviteSaving ? <Spinner size={16} /> : <Mail size={16} />}Send to selected ({selectedInviteIds.length})</button></>}>
      <div className="space-y-4">
        <p className="rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-5 text-brand-900">Invitations are emailed to enrolled students and include a personal WhatsApp link you can send manually. Invitation links expire after 7 days.</p>
        <div><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Select students</p><button type="button" className="text-xs font-semibold text-brand-700" onClick={() => setSelectedInviteIds(selectedInviteIds.length === (item.students || []).length ? [] : (item.students || []).map((student) => student.id))}>{selectedInviteIds.length === (item.students || []).length ? 'Clear all' : 'Select all'}</button></div>{item.students?.length ? <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{item.students.map((student) => <label key={student.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedInviteIds.includes(student.id)} onChange={(event) => setSelectedInviteIds(event.target.checked ? [...selectedInviteIds, student.id] : selectedInviteIds.filter((value) => value !== student.id))} /><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{student.name}</span><span className="block truncate text-xs text-slate-400">{student.email}{student.whatsapp ? ` · ${student.whatsapp}` : ''}</span></span></label>)}</div> : <p className="text-sm text-slate-500">No students enrolled.</p>}</div>
        <div><p className="mb-2 text-sm font-semibold text-slate-800">Invitation history</p>{inviteLoading ? <div className="py-5 text-center"><Spinner size={20} /></div> : invitations.length ? <div className="max-h-64 space-y-2 overflow-y-auto">{invitations.map((invite) => <div key={invite.id} className="rounded-xl border border-slate-100 p-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{invite.studentName || invite.email}</p><p className="truncate text-xs text-slate-400">{invite.email}{invite.sentAt ? ` · Sent ${formatDateTime(invite.sentAt)}` : ''}</p>{invite.lastError && <p className="mt-1 text-xs text-red-600">{invite.lastError}</p>}</div><Badge color={inviteTone[invite.status] || 'slate'}>{invite.status}</Badge></div><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" onClick={() => shareWhatsApp(invite)} disabled={!invite.whatsappUrl}><MessageCircle size={13} />WhatsApp</button>{['pending', 'failed', 'sent', 'expired'].includes(invite.status) && <button type="button" className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" onClick={() => invitationAction(invite, 'resend')} disabled={busyInvite === invite.id}>{busyInvite === invite.id ? <Spinner size={12} /> : <RotateCw size={13} />}Resend</button>}{invite.status !== 'accepted' && invite.status !== 'revoked' && <button type="button" className="btn-ghost min-h-0 px-2.5 py-1.5 text-xs text-red-600" onClick={() => invitationAction(invite, 'revoke')} disabled={busyInvite === invite.id}>Revoke</button>}</div></div>)}</div> : <p className="text-sm text-slate-500">No invitations sent yet.</p>}</div>
      </div>
    </Modal>
  </div>;
}
