import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Download, Plus, Send, Save, Users, Trash2 } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge } from './layout.jsx';
import { EmptyState, Spinner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { isAdmin } from '../lib/roles.js';

const blankAssignment = () => ({ title: '', instructions: '', objectives: '', toolsAndMaterials: '', tasks: '', dueAt: '', maxPoints: 100, passMark: 50, published: false });
const submissionErrorMessage = (error) => {
  const parsed = apiError(error);
  const issues = Array.isArray(parsed.details)
    ? parsed.details.map(({ path, message }) => [path, message].filter(Boolean).join(': ')).filter(Boolean)
    : [];
  return issues.length ? `${parsed.message} ${issues.join(' ')}` : parsed.message;
};

export default function CourseAssignments({ course, user, onCompletionChange }) {
  const toast = useToast();
  const { confirm } = useDialog();
  const teacher = isAdmin(user) || (user?.role === 'teacher' && (course.teacher?.id === user.id || course.teachers?.some((item) => item.id === user.id)));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankAssignment());
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [submissionForms, setSubmissionForms] = useState({});
  const [review, setReview] = useState({});
  const [gradeForms, setGradeForms] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get(`/classes/${course.id}/assignments`)).data.data.assignments); }
    catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [course.id]);
  useEffect(() => { load(); }, [load]);

  const createAssignment = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try {
      const body = { ...form, tasks: form.tasks.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, type: 'practical', submissionTypes: ['text', 'link', 'file'], maxPoints: Number(form.maxPoints), passMark: Number(form.passMark) };
      await api.post(`/classes/${course.id}/assignments`, body);
      setForm(blankAssignment()); setCreateOpen(false); toast.success('Practical assignment created.'); await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSubmitting(false); }
  };

  const sendSubmission = async (assignment, draft) => {
    const formData = new FormData();
    const value = submissionForms[assignment.id] || { response: '', links: '', files: [] };
    formData.append('response', value.response || '');
    formData.append('links', JSON.stringify(value.links.split(/\r?\n/).map((link) => link.trim()).filter(Boolean)));
    value.files.forEach((file) => formData.append('files', file));
    formData.append('draft', String(draft));
    setSubmitting(true);
    try {
      await api.post(`/assignments/${assignment.id}/${draft ? 'draft' : 'submit'}`, formData);
      toast.success(draft ? 'Draft saved.' : 'Work submitted to your teacher.'); await load();
      if (!draft) await onCompletionChange?.();
    } catch (error) { toast.error(submissionErrorMessage(error)); }
    finally { setSubmitting(false); }
  };

  const loadSubmissions = async (assignment) => {
    try { setReview({ ...review, [assignment.id]: (await api.get(`/assignments/${assignment.id}/submissions`)).data.data.submissions }); }
    catch (error) { toast.error(apiError(error).message); }
  };
  const deleteAssignment = async (assignment) => {
    if (!await confirm({ title: 'Delete practical assignment?', message: `Permanently delete "${assignment.title}" and all student submissions? This cannot be undone.`, confirmLabel: 'Delete assignment', tone: 'danger' })) return;
    setDeletingId(assignment.id);
    try {
      await api.delete(`/assignments/${assignment.id}`);
      toast.success('Practical assignment and its submissions deleted.');
      await load();
      await onCompletionChange?.();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setDeletingId(''); }
  };
  const grade = async (assignment, submission) => {
    const value = gradeForms[submission.id] || {};
    try {
      await api.post(`/assignments/submissions/${submission.id}/grade`, { score: Number(value.score ?? submission.score ?? 0), feedback: value.feedback ?? submission.feedback ?? '', decision: value.decision || 'graded' });
      toast.success('Evaluation saved.'); await loadSubmissions(assignment); await load();
    } catch (error) { toast.error(apiError(error).message); }
  };
  const downloadFile = async (submissionId, file) => {
    try {
      const response = await api.get(`/assignments/submissions/${submissionId}/files/${file.index}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.originalName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(apiError(error).message); }
  };

  return <section className="mt-8 border-t border-slate-200 pt-6"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><ClipboardCheck size={18} />Practical Work</h2><p className="mt-1 text-sm text-slate-500">Assignments, submissions, and instructor feedback.</p></div>{teacher && <button className="btn-primary" onClick={() => setCreateOpen((open) => !open)}><Plus size={16} />New practical assignment</button>}</div>
    {createOpen && <form onSubmit={createAssignment} className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><label><span className="label">Assignment title</span><input className="input" required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span className="label">Due date</span><input className="input" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label><label className="sm:col-span-2"><span className="label">Instructions and step-by-step tasks</span><textarea className="input min-h-28" required value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label><label><span className="label">Learning objectives</span><textarea className="input min-h-20" value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} /></label><label><span className="label">Required tools or materials</span><textarea className="input min-h-20" value={form.toolsAndMaterials} onChange={(event) => setForm({ ...form, toolsAndMaterials: event.target.value })} /></label><label><span className="label">Tasks (one per line)</span><textarea className="input min-h-20" value={form.tasks} onChange={(event) => setForm({ ...form, tasks: event.target.value })} /></label><label><span className="label">Submission requirements</span><textarea className="input min-h-20" value={form.submissionRequirements} onChange={(event) => setForm({ ...form, submissionRequirements: event.target.value })} /></label><label><span className="label">Maximum score</span><input className="input" type="number" min="1" max="10000" value={form.maxPoints} onChange={(event) => setForm({ ...form, maxPoints: event.target.value })} /></label><label><span className="label">Pass mark</span><input className="input" type="number" min="0" max={form.maxPoints} value={form.passMark} onChange={(event) => setForm({ ...form, passMark: event.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />Publish to enrolled students</label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn-primary" disabled={submitting}>{submitting ? <Spinner size={16} /> : <Plus size={16} />}Create assignment</button></div></form>}
    {loading ? <div className="py-6 text-center text-sm text-slate-500">Loading practical assignments…</div> : !items.length ? <EmptyState title="No practical assignments yet" description="Published practical work from your instructor will appear here." /> : <div className="space-y-3">{items.map((assignment) => {
      const mine = assignment.submission;
      const value = submissionForms[assignment.id] || { response: mine?.response || '', links: (mine?.links || []).join('\n'), files: [] };
      return <article key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Badge color="brand">Practical</Badge>{mine && <Badge color={mine.status === 'passed' ? 'green' : mine.status === 'revision-requested' ? 'amber' : 'slate'}>{mine.status}</Badge>}</div><h3 className="mt-2 font-semibold text-slate-900">{assignment.title}</h3><p className="mt-1 text-xs text-slate-500">{assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleString()}` : 'No deadline'} · Pass mark {assignment.passMark}/{assignment.maxPoints}</p></div>{teacher && <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => loadSubmissions(assignment)}><Users size={15} />Review submissions</button>{['practical', 'assignment'].includes(assignment.type) && (isAdmin(user) || assignment.createdBy === user?.id) && <button className="btn-ghost text-red-700" disabled={deletingId === assignment.id} onClick={() => deleteAssignment(assignment)}>{deletingId === assignment.id ? <Spinner size={15} /> : <Trash2 size={15} />}Delete</button>}</div>}</div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{assignment.instructions}</p>{assignment.objectives && <p className="mt-2 text-sm"><strong>Objectives:</strong> {assignment.objectives}</p>}{assignment.toolsAndMaterials && <p className="mt-2 text-sm"><strong>Tools and materials:</strong> {assignment.toolsAndMaterials}</p>}{assignment.tasks?.length > 0 && <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{assignment.tasks.map((task, index) => <li key={index}>{task}</li>)}</ol>}{assignment.submissionRequirements && <p className="mt-2 text-sm"><strong>Submit:</strong> {assignment.submissionRequirements}</p>}
        {mine && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p>Attempt {mine.attempt}{mine.score !== null ? ` · Score ${mine.score}/${assignment.maxPoints}` : ''}{mine.feedback ? ` · Feedback: ${mine.feedback}` : ''}</p>{mine.files?.map((file) => <button key={file.index} className="mt-1 flex items-center gap-1 text-brand-700" onClick={() => downloadFile(mine.id, file)}><Download size={14} />{file.originalName}</button>)}</div>}
        {!teacher && (!mine || assignment.allowResubmission && !['submitted', 'passed'].includes(mine.status)) && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">Your written response</span><textarea maxLength={20000} className="input min-h-24" value={value.response} onChange={(event) => setSubmissionForms({ ...submissionForms, [assignment.id]: { ...value, response: event.target.value } })} /></label><label className="sm:col-span-2"><span className="label">Project links (one URL per line; up to 20, each starting with http:// or https://)</span><textarea maxLength={20000} className="input min-h-16" value={value.links} onChange={(event) => setSubmissionForms({ ...submissionForms, [assignment.id]: { ...value, links: event.target.value } })} placeholder="https://github.com/…" /></label><label className="sm:col-span-2"><span className="label">Files (PDF, images, ZIP, text/source; up to 5 files, 10 MB each)</span><input className="input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.zip,.txt,.md,.js,.ts,.py,.json,.css,.html" onChange={(event) => setSubmissionForms({ ...submissionForms, [assignment.id]: { ...value, files: Array.from(event.target.files || []) } })} /></label><div className="flex gap-2 sm:col-span-2"><button className="btn-secondary" type="button" disabled={submitting} onClick={() => sendSubmission(assignment, true)}><Save size={15} />Save draft</button><button className="btn-primary" type="button" disabled={submitting} onClick={() => sendSubmission(assignment, false)}><Send size={15} />Submit work</button></div></div>}
        {teacher && review[assignment.id] && <div className="mt-4 space-y-3 border-t border-slate-200 pt-3"><h4 className="font-semibold text-slate-800">Student submissions</h4>{review[assignment.id].length ? review[assignment.id].map((submission) => <div key={submission.id} className="rounded-lg bg-slate-50 p-3"><p className="font-medium">{submission.student.name} · Attempt {submission.attempt} · {submission.status}</p><p className="mt-2 whitespace-pre-wrap text-sm">{submission.response || '(No written response)'}</p><div className="mt-2 flex flex-wrap gap-2">{submission.links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">Open project link</a>)}{submission.files.map((file) => <button key={file.index} className="flex items-center gap-1 text-sm text-brand-700" onClick={() => downloadFile(submission.id, file)}><Download size={14} />{file.originalName}</button>)}</div>{submission.status !== 'draft' && <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_180px_auto]"><input className="input" type="number" min="0" max={assignment.maxPoints} aria-label="Score" placeholder="Score" value={gradeForms[submission.id]?.score ?? submission.score ?? ''} onChange={(event) => setGradeForms({ ...gradeForms, [submission.id]: { ...gradeForms[submission.id], score: event.target.value } })} /><input className="input" aria-label="Feedback" placeholder="Feedback" value={gradeForms[submission.id]?.feedback ?? submission.feedback ?? ''} onChange={(event) => setGradeForms({ ...gradeForms, [submission.id]: { ...gradeForms[submission.id], feedback: event.target.value } })} /><select className="input" aria-label="Evaluation outcome" value={gradeForms[submission.id]?.decision || 'graded'} onChange={(event) => setGradeForms({ ...gradeForms, [submission.id]: { ...gradeForms[submission.id], decision: event.target.value } })}><option value="graded">Grade</option><option value="passed">Pass</option><option value="failed">Needs work</option><option value="revision-requested">Request revision</option></select><button className="btn-primary" onClick={() => grade(assignment, submission)}>Save</button></div>}</div>) : <p className="text-sm text-slate-500">No submissions yet.</p>}</div>}
      </article>;
    })}</div>}
  </section>;
}
