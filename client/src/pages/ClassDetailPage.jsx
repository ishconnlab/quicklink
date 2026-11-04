import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Copy, FileText, Mail, Pencil, Play, Radio, Users, ChevronLeft, ChevronRight, PhoneOff } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal } from '../components/layout.jsx';
import PagedCheckboxList from '../components/PagedCheckboxList.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../lib/format.js';

export default function ClassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [waitingError, setWaitingError] = useState('');
  const [starting, setStarting] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [people, setPeople] = useState({ teachers: [], students: [] });
  const [books, setBooks] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);
  const [certificationAssessmentLocked, setCertificationAssessmentLocked] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classResponse, sessionResponse] = await Promise.all([api.get(`/classes/${id}`), api.get(`/classes/${id}/sessions`)]);
      setItem(classResponse.data.data.class);
      setSessions(sessionResponse.data.data.sessions);
    }
    catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!item || item.liveSession) return undefined;
    let active = true;
    const refreshLiveStatus = async () => {
      try {
        const response = await api.get(`/classes/${id}`);
        if (active) {
          setItem(response.data.data.class);
          setWaitingError('');
        }
      } catch (error) {
        if (active) setWaitingError(apiError(error).message);
      }
    };
    const timer = window.setInterval(refreshLiveStatus, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id, item?.id, item?.liveSession?.id]);

  const canTeach = user?.role === 'owner' || (user?.role === 'teacher' && (item?.teacher.id === user.id || item?.teachers?.some((teacher) => teacher.id === user.id)));
  const sessionLink = item?.liveSession ? `${window.location.origin}/classes/join/${item.liveSession.sessionCode}` : '';

  const startClass = async () => {
    setStarting(true);
    try {
      const response = await api.post(`/classes/${id}/sessions`, { title: item.title });
      navigate(`/classes/sessions/${response.data.data.session.id}/live`);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setStarting(false); }
  };

  const endLiveSession = async () => {
    if (!item.liveSession || !window.confirm('End this live session for all participants? Attendance and the session report will be saved.')) return;
    setEndingSession(true);
    try {
      await api.post(`/classes/sessions/${item.liveSession.id}/end`, { teacherNotes: '' });
      toast.success('Live session ended. Attendance report saved.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEndingSession(false); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(sessionLink);
      setCopied(true);
      toast.success('Class link copied. Share it with enrolled students.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch { toast.error('Could not copy the link. You can select and copy it manually.'); }
  };

  const openInvitations = async () => {
    try {
      const response = await api.get(`/classes/${id}/invitations`);
      setInvitations(response.data.data.invitations);
      setSelectedInviteIds(item.students.map((student) => student.id));
      setInviteOpen(true);
    } catch (error) { toast.error(apiError(error).message); }
  };

  const sendInvitations = async () => {
    setInviteSaving(true);
    try {
      const response = await api.post(`/classes/${id}/invitations`, { studentIds: selectedInviteIds });
      setInvitations(response.data.data.invitations);
      const failed = response.data.data.invitations.filter((invite) => invite.status === 'failed').length;
      if (failed) toast.error(`${failed} invitation(s) failed. Check the email service configuration.`);
      else toast.success('Invitations sent.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setInviteSaving(false); }
  };

  const openEdit = async () => {
    try {
      const [teacherResponse, studentResponse, bookResponse, assessmentResponse] = await Promise.all([api.get('/classes/people/teachers'), api.get('/classes/people/students'), api.get('/learning/books', { params: { manage: true, limit: 500 } }), api.get(`/courses/${id}/certification-assessment/settings`)]);
      setPeople({ teachers: teacherResponse.data.data.people, students: studentResponse.data.data.people });
      const activeBooks = bookResponse.data.data.books.filter((book) => book.active && book.processingStatus === 'ready');
      setBooks(activeBooks);
      const levelBookIds = new Set(activeBooks.filter((book) => book.level === item.level).map((book) => book.id));
      const assessmentSettings = assessmentResponse.data.data;
      setCertificationAssessmentLocked(Boolean(assessmentSettings.attemptsStarted));
      setEditForm({ title: item.title, subject: item.subject, trade: item.trade || '', introduction: item.introduction || '', course: item.course || '', level: item.level, description: item.description || '', learningMaterials: (item.learningMaterials || []).filter((bookId) => levelBookIds.has(bookId)), completionRequirements: item.completionRequirements || { requireReading: false, requireTheory: false, requirePractical: false, requireAttendance: false, minimumScore: 0 }, certificationAssessmentEnabled: assessmentSettings.enabled, certificationQuestions: assessmentSettings.questions, published: item.published !== false, startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 16) : '', schedule: item.schedule || '', durationMinutes: item.durationMinutes || 60, timezone: item.timezone || 'Africa/Johannesburg', maxStudents: item.maxStudents || 300, enrollmentOpen: item.enrollmentOpen !== false, teacherIds: (item.teachers?.length ? item.teachers : [item.teacher]).map((teacher) => teacher.id), studentIds: item.students.map((student) => student.id) });
      setEditStep(0);
      setEditOpen(true);
    } catch (error) { toast.error(apiError(error).message); }
  };

  const saveClass = async (event) => {
    event.preventDefault();
    setEditSaving(true);
    try {
      await api.patch(`/classes/${id}`, { ...editForm, startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null, durationMinutes: Number(editForm.durationMinutes), maxStudents: Number(editForm.maxStudents) });
      await api.put(`/courses/${id}/certification-assessment/settings`, { enabled: editForm.certificationAssessmentEnabled, questions: editForm.certificationQuestions });
      if (thumbnail) { const body = new FormData(); body.append('thumbnail', thumbnail); await api.post(`/courses/${id}/thumbnail`, body); }
      toast.success('Course and class details saved.');
      setEditOpen(false);
      setThumbnail(null);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEditSaving(false); }
  };

  const nextEditStep = () => {
    if ((editStep === 0 || editStep === 1) && !document.getElementById('class-edit-form')?.reportValidity()) return;
    if (editStep === 1 && !editForm.teacherIds.length) { toast.error('Choose at least one teacher for this class.'); return; }
    setEditStep((step) => Math.min(4, step + 1));
  };
  const submitEdit = (event) => {
    if (editStep < 4) { event.preventDefault(); nextEditStep(); return; }
    saveClass(event);
  };

  const archiveClass = async () => {
    if (item.active && !window.confirm('Archive this class? Class history and reports will be kept.')) return;
    try {
      if (item.active) { await api.delete(`/classes/${id}`); navigate('/classes', { replace: true }); toast.success('Class archived.'); }
      else { await api.patch(`/classes/${id}`, { active: true }); toast.success('Class restored.'); await load(); }
    }
    catch (error) { toast.error(apiError(error).message); }
  };

  const invitationAction = async (invite, action) => {
    try {
      if (action === 'resend') await api.post(`/classes/${id}/invitations/${invite.id}/resend`);
      else await api.delete(`/classes/${id}/invitations/${invite.id}`);
      const response = await api.get(`/classes/${id}/invitations`);
      setInvitations(response.data.data.invitations);
      toast.success(action === 'resend' ? 'Invitation resent.' : 'Invitation revoked.');
    } catch (error) { toast.error(apiError(error).message); }
  };

  if (loading) return <PageLoader label="Loading class…" />;
  if (!item) return <EmptyState title="Class unavailable" description="This class may have been removed or you may not be enrolled." />;

  return <div className="min-w-0">
    <Link to="/classes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />All classes</Link>
    <PageHeader title={item.title} subtitle={`${item.course ? `${item.course} · ` : ''}${item.subject} · ${item.level}`} actions={<div className="flex flex-wrap gap-2">{canTeach && item.active && <button onClick={openInvitations} className="btn-secondary"><Mail size={16} />Invite students</button>}{user?.role === 'owner' && <><button onClick={openEdit} className="btn-secondary"><Pencil size={16} />Edit class</button><button onClick={archiveClass} className={item.active ? 'btn-ghost text-red-600' : 'btn-secondary'}><Archive size={16} />{item.active ? 'Archive' : 'Restore class'}</button></>}{canTeach && item.active && !item.liveSession && <button onClick={startClass} disabled={starting} className="btn-primary">{starting ? <Spinner size={16} /> : <Play size={16} />}Start live class</button>}</div>} />
    {item.description && <p className="mb-4 text-sm text-slate-600">{item.description}</p>}

    {item.liveSession ? <section className="card mb-4 border-red-200 bg-red-50/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Badge color="red"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live</Badge><span className="text-xs text-slate-500">Started {formatDateTime(item.liveSession.startedAt)}</span></div><h2 className="mt-2 break-words font-semibold text-slate-900">{item.liveSession.title}</h2><p className="mt-1 break-all text-xs text-slate-500">{sessionLink}</p></div><div className="flex flex-wrap gap-2 sm:shrink-0"><button className="btn-secondary" onClick={copyLink}><Copy size={16} />{copied ? 'Copied' : 'Copy link'}</button><Link to={`/classes/sessions/${item.liveSession.id}/live`} className="btn-primary"><Radio size={17} />Join class</Link>{canTeach && <button className="btn-danger" onClick={endLiveSession} disabled={endingSession}>{endingSession ? <Spinner size={16} /> : <PhoneOff size={16} />}End live session</button>}</div></div>
    </section> : item.recentSession?.status === 'ended' ? <section className="card mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge color="slate">Not live</Badge><span className="text-xs text-slate-500">Previous session ended {formatDateTime(item.recentSession.endedAt)}</span></div><p className="mt-2 text-sm text-slate-600">Wait here. The join button will appear automatically when your teacher or an admin starts the next live session.</p>{item.startsAt && <p className="mt-1 text-xs text-slate-500">Scheduled start: {formatDateTime(item.startsAt)}</p>}{waitingError && <p role="status" className="mt-2 text-xs text-amber-700">Live status could not refresh: {waitingError}</p>}</div>{canTeach && <Link to={`/classes/sessions/${item.recentSession.id}/report`} className="btn-secondary"><FileText size={16} />View report</Link>}</section> : <section className="card mb-4 border-slate-200 bg-slate-50"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Badge color="slate">Not live</Badge>{item.startsAt && <span className="text-xs text-slate-500">Scheduled start: {formatDateTime(item.startsAt)}</span>}</div><p className="mt-2 text-sm text-slate-700">Wait here until your teacher or an admin starts the live session. This page checks for the session automatically.</p>{waitingError && <p role="status" className="mt-2 text-xs text-amber-700">Live status could not refresh: {waitingError}</p>}</div></div></section>}

    <div className="grid gap-4 lg:grid-cols-3">
      <section className="card min-w-0 lg:col-span-1"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Users size={17} />Class people</h2><p className="mb-3 break-words text-sm text-slate-600">Teacher: <span className="font-medium text-slate-800">{item.teacher.name}</span></p><div className="space-y-2">{item.students.map((student) => <div key={student.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{student.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700">{student.name}</span><span className="block break-all text-xs text-slate-400">{student.email}</span></span></div>)}{item.students.length === 0 && <p className="text-sm text-slate-400">No students have been enrolled yet.</p>}</div></section>
      <section className="card min-w-0 lg:col-span-2"><h2 className="mb-2 text-sm font-semibold text-slate-800">About this class</h2><p className="break-words text-sm leading-6 text-slate-600">Your teacher can start a live session with audio, video, screen sharing, and class chat. Share the live join link with enrolled students so attendance is recorded as they connect.</p>{!item.liveSession && canTeach && <p className="mt-3 text-xs text-slate-400">Students must have accounts and be enrolled in this class before joining.</p>}</section>
    </div>
    {sessions.length > 0 && <section className="card mt-4"><h2 className="mb-3 font-semibold text-slate-800">Class history</h2><div className="divide-y divide-slate-100">{sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-800">{session.title}</p><p className="mt-1 text-xs text-slate-500">Started {formatDateTime(session.startedAt)}{session.endedAt ? ` · Ended ${formatDateTime(session.endedAt)}` : ''}</p></div><div className="flex items-center gap-2"><Badge color={session.status === 'live' ? 'red' : 'slate'}>{session.status}</Badge>{session.status === 'live' ? <Link to={`/classes/sessions/${session.id}/live`} className="btn-secondary">Join</Link> : canTeach && <Link to={`/classes/sessions/${session.id}/report`} className="btn-secondary"><FileText size={15} />Report</Link>}</div></div>)}</div></section>}
    <Modal open={editOpen} onClose={() => !editSaving && setEditOpen(false)} title="Edit class" size="lg" footer={editForm && <><button type="button" className="btn-secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</button>{editStep > 0 && <button type="button" className="btn-secondary" onClick={() => setEditStep((step) => step - 1)} disabled={editSaving}><ChevronLeft size={16} />Back</button>}{editStep < 4 ? <button type="button" className="btn-primary" onClick={nextEditStep}>Next<ChevronRight size={16} /></button> : <button form="class-edit-form" type="submit" className="btn-primary" disabled={editSaving || !editForm.teacherIds.length}>{editSaving ? <Spinner size={16} /> : <Pencil size={16} />}Save changes</button>}</>}>
      {editForm && <div className="space-y-4">
        <nav className="grid grid-cols-5 gap-1" aria-label="Edit class steps">{['Course details', 'Teacher & time', 'Materials & students', 'Completion', 'Certificate quiz'].map((label, index) => <div key={label} aria-current={editStep === index ? 'step' : undefined} className={`rounded-lg border px-1 py-2 text-center text-[10px] font-semibold leading-tight sm:px-2 sm:text-xs ${editStep === index ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500'}`}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">{index + 1}</span><span className="mt-1 block">{label}</span></div>)}</nav>
        <form id="class-edit-form" onSubmit={submitEdit} className="min-h-[19rem]">
          {editStep === 0 && <div className="grid gap-3 sm:grid-cols-2">{[['Full course title','title'],['Subject','subject'],['Trade','trade'],['Short introduction','introduction'],['Course or training program','course']].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" required={key === 'title' || key === 'subject'} maxLength={key === 'title' ? 160 : key === 'subject' ? 120 : undefined} value={editForm[key]} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} /></label>)}<label><span className="label">Level</span><select className="input" value={editForm.level} onChange={(event) => { const level = event.target.value; const validIds = new Set(books.filter((book) => book.level === level).map((book) => book.id)); setEditForm((current) => ({ ...current, level, learningMaterials: current.learningMaterials.filter((bookId) => validIds.has(bookId)) })); }}><option>L3</option><option>L4</option><option>L5</option></select></label><label className="sm:col-span-2"><span className="label">Detailed course description</span><textarea className="input min-h-20" maxLength={12000} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label><label className="sm:col-span-2"><span className="label">Replace thumbnail image (PNG, JPEG, WebP, max 3 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={(event) => setThumbnail(event.target.files?.[0] || null)} />{thumbnail && <span className="mt-1 block truncate text-xs text-slate-500">Selected: {thumbnail.name}</span>}</label></div>}
          {editStep === 1 && <div className="grid gap-4 sm:grid-cols-2"><PagedCheckboxList title="Assigned teachers" items={people.teachers} selectedIds={editForm.teacherIds} onChange={(teacherIds) => setEditForm({ ...editForm, teacherIds })} emptyLabel="No active teachers match this search." pageSize={6} /><div className="space-y-3"><label className="block"><span className="label">Start date and time</span><input type="datetime-local" className="input" value={editForm.startsAt} onChange={(event) => setEditForm({ ...editForm, startsAt: event.target.value })} /></label><label className="block"><span className="label">Timezone</span><input required className="input" value={editForm.timezone} onChange={(event) => setEditForm({ ...editForm, timezone: event.target.value })} /></label><label className="block"><span className="label">Schedule</span><input maxLength={500} className="input" value={editForm.schedule} onChange={(event) => setEditForm({ ...editForm, schedule: event.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label><span className="label">Duration (minutes)</span><input type="number" min="5" max="1440" className="input" value={editForm.durationMinutes} onChange={(event) => setEditForm({ ...editForm, durationMinutes: event.target.value })} /></label><label><span className="label">Maximum students</span><input type="number" min={item.students.length || 1} max="10000" className="input" value={editForm.maxStudents} onChange={(event) => setEditForm({ ...editForm, maxStudents: event.target.value })} /></label></div></div></div>}
          {editStep === 2 && <div className="grid gap-4 lg:grid-cols-2"><div><PagedCheckboxList title={`Learning materials · ${editForm.level}`} items={books.filter((book) => book.level === editForm.level)} selectedIds={editForm.learningMaterials} onChange={(learningMaterials) => setEditForm({ ...editForm, learningMaterials })} emptyLabel={`No active ${editForm.level} documents match this search.`} pageSize={6} /><p className="mt-1 text-xs text-slate-500">Only active documents at the selected class level are shown.</p></div><div><PagedCheckboxList title="Enrolled students" items={people.students} selectedIds={editForm.studentIds} onChange={(studentIds) => setEditForm({ ...editForm, studentIds })} emptyLabel="No active students match this search." pageSize={6} /><p className="mt-1 text-xs text-slate-500">The class limit is {editForm.maxStudents} students.</p></div></div>}
          {editStep === 3 && <div className="space-y-4"><fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">Completion requirements</legend><div className="grid gap-2 sm:grid-cols-2">{[['requireReading','Require reading'],['requireTheory','Require theory assessment'],['requirePractical','Require practical work'],['requireAttendance','Require class attendance']].map(([key,label]) => <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={editForm.completionRequirements[key]} onChange={(event) => setEditForm({ ...editForm, completionRequirements: { ...editForm.completionRequirements, [key]: event.target.checked } })} />{label}</label>)}</div></fieldset><label className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm"><input type="checkbox" checked={editForm.published} onChange={(event) => setEditForm({ ...editForm, published: event.target.checked })} />Published in course catalog</label><label className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm"><input type="checkbox" checked={editForm.enrollmentOpen} onChange={(event) => setEditForm({ ...editForm, enrollmentOpen: event.target.checked })} />Enrollment open</label></div>}
          {editStep === 4 && <div className="space-y-4">
            <section className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                <input type="checkbox" className="mt-1" checked={editForm.certificationAssessmentEnabled} disabled={certificationAssessmentLocked} onChange={(event) => setEditForm((current) => {
                  const enabled = event.target.checked;
                  const completeQuestions = current.certificationQuestions.length === 10 && current.certificationQuestions.every((question) => question.prompt.trim() && question.options.every((option) => option.trim()));
                  return {
                    ...current,
                    certificationAssessmentEnabled: enabled,
                    certificationQuestions: enabled
                      ? current.certificationQuestions.length === 10 ? current.certificationQuestions : Array.from({ length: 10 }, () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0 }))
                      : completeQuestions ? current.certificationQuestions : [],
                  };
                })} />
                Require a 10-question certification quiz before issuing a certificate
              </label>
              <p className="mt-2 text-xs leading-5 text-slate-600">Participants need at least 80% to pass and have up to three attempts. The quiz becomes part of the certificate requirements when enabled.</p>
              {certificationAssessmentLocked && <p className="mt-2 text-xs font-medium text-amber-800">Quiz settings are locked because a participant has already attempted this assessment.</p>}
            </section>
            {editForm.certificationAssessmentEnabled && <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
              {editForm.certificationQuestions.map((question, questionIndex) => <fieldset key={questionIndex} className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
                <legend className="px-1 text-sm font-semibold text-slate-800">Question {questionIndex + 1}</legend>
                <label className="block"><span className="label">Question</span><textarea className="input min-h-20" maxLength={1200} required disabled={certificationAssessmentLocked} value={question.prompt} onChange={(event) => setEditForm((current) => ({ ...current, certificationQuestions: current.certificationQuestions.map((entry, index) => index === questionIndex ? { ...entry, prompt: event.target.value } : entry) }))} /></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-w-0 items-center gap-2">
                    <input type="radio" name={`certification-answer-${questionIndex}`} aria-label={`Correct answer for question ${questionIndex + 1}: option ${optionIndex + 1}`} checked={question.correctOption === optionIndex} disabled={certificationAssessmentLocked} onChange={() => setEditForm((current) => ({ ...current, certificationQuestions: current.certificationQuestions.map((entry, index) => index === questionIndex ? { ...entry, correctOption: optionIndex } : entry) }))} />
                    <input className="input min-w-0" aria-label={`Option ${optionIndex + 1} for question ${questionIndex + 1}`} maxLength={500} required disabled={certificationAssessmentLocked} value={option} onChange={(event) => setEditForm((current) => ({ ...current, certificationQuestions: current.certificationQuestions.map((entry, index) => index === questionIndex ? { ...entry, options: entry.options.map((text, option) => option === optionIndex ? event.target.value : text) } : entry) }))} />
                  </label>)}
                </div>
                <p className="text-xs text-slate-500">Select the radio button beside the correct option.</p>
              </fieldset>)}
            </div>}
            {!editForm.certificationAssessmentEnabled && <p className="text-sm text-slate-600">The certification quiz is optional for this training. Enable it to add ten multiple-choice questions.</p>}
          </div>}
        </form>
      </div>}
    </Modal>
    <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite enrolled students" size="lg" footer={<><button className="btn-secondary" onClick={() => setInviteOpen(false)}>Close</button><button className="btn-primary" onClick={sendInvitations} disabled={inviteSaving || !selectedInviteIds.length}>{inviteSaving ? <Spinner size={16} /> : <Mail size={16} />}Send invitations</button></>}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto"><p className="text-sm text-slate-500">Invitations go only to registered students enrolled in this class. Each email is sent separately with a private link that expires after seven days.</p>
        <div className="space-y-2">{item.students.map((student) => <label key={student.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"><input type="checkbox" checked={selectedInviteIds.includes(student.id)} onChange={(event) => setSelectedInviteIds((ids) => event.target.checked ? [...ids, student.id] : ids.filter((value) => value !== student.id))} /><span className="min-w-0"><span className="block text-sm font-medium">{student.name}</span><span className="block text-xs text-slate-500">{student.email}</span></span></label>)}</div>
        {invitations.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Recent invitation status</h3>{invitations.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm"><span>{invite.email}</span><Badge color={invite.status === 'sent' || invite.status === 'accepted' ? 'green' : invite.status === 'failed' ? 'red' : 'amber'}>{invite.status}</Badge><span className="flex gap-2">{['sent','failed','expired'].includes(invite.status) && <button onClick={() => invitationAction(invite,'resend')} className="text-xs text-brand-700">Resend</button>}{['sent','failed','expired','pending'].includes(invite.status) && <button onClick={() => invitationAction(invite,'revoke')} className="text-xs text-red-600">Revoke</button>}</span>{invite.lastError && <p className="w-full text-xs text-red-600">{invite.lastError}</p>}</div>)}</div>}
      </div>
    </Modal>
  </div>;
}
