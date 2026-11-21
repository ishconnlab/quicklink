import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, ExternalLink, Github, Plus, Send, Trash2 } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge } from './layout.jsx';
import { Spinner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../lib/format.js';

const blankTask = {
  title: '',
  instructions: '',
  objectives: '',
  toolsAndMaterials: '',
  tasks: '',
  submissionRequirements: '',
  dueAt: '',
  maxPoints: 100,
  passMark: 50,
};

const statusColor = {
  draft: 'slate',
  submitted: 'brand',
  graded: 'green',
  passed: 'green',
  failed: 'red',
  'revision-requested': 'amber',
};

const statusLabel = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  graded: 'Reviewed',
  passed: 'Passed',
  failed: 'Not passed',
  'revision-requested': 'Changes requested',
};

function TaskTextField({ label, value, onChange, multiline = false, ...props }) {
  return <label className="block">
    <span className="label">{label}</span>
    {multiline
      ? <textarea className="input min-h-24" value={value} onChange={onChange} {...props} />
      : <input className="input" value={value} onChange={onChange} {...props} />}
  </label>;
}

export default function ProjectTasksSection({ classId, admin }) {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState('');
  const [form, setForm] = useState(blankTask);
  const [submissionForms, setSubmissionForms] = useState({});
  const [expandedSubmissions, setExpandedSubmissions] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [gradeForms, setGradeForms] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/classes/${classId}/assignments`);
      setTasks(response.data.data.assignments.filter((task) => task.type === 'project'));
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [classId, toast]);

  useEffect(() => { load(); }, [load]);

  const createTask = async (event) => {
    event.preventDefault();
    setSaving('create');
    try {
      await api.post(`/classes/${classId}/assignments`, {
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        objectives: form.objectives.trim(),
        toolsAndMaterials: form.toolsAndMaterials.trim(),
        tasks: form.tasks.split('\n').map((line) => line.trim()).filter(Boolean),
        submissionRequirements: form.submissionRequirements.trim(),
        submissionTypes: ['link'],
        type: 'project',
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        maxPoints: Number(form.maxPoints),
        passMark: Number(form.passMark),
        allowLate: false,
        allowResubmission: true,
        published: true,
      });
      toast.success('Project task published.');
      setForm(blankTask);
      setCreating(false);
      await load();
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setSaving('');
    }
  };

  const submitProject = async (event, task) => {
    event.preventDefault();
    const submission = submissionForms[task.id] || { link: '', response: '' };
    setSaving(`submit:${task.id}`);
    try {
      await api.post(`/assignments/${task.id}/submit`, { links: [submission.link], response: submission.response });
      toast.success('Project link submitted for review.');
      await load();
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setSaving('');
    }
  };

  const toggleSubmissions = async (task) => {
    const open = !expandedSubmissions[task.id];
    setExpandedSubmissions((current) => ({ ...current, [task.id]: open }));
    if (!open || submissions[task.id]) return;
    setSaving(`load:${task.id}`);
    try {
      const response = await api.get(`/assignments/${task.id}/submissions`);
      setSubmissions((current) => ({ ...current, [task.id]: response.data.data.submissions }));
    } catch (error) {
      setExpandedSubmissions((current) => ({ ...current, [task.id]: false }));
      toast.error(apiError(error).message);
    } finally {
      setSaving('');
    }
  };

  const gradeProject = async (event, task, submission) => {
    event.preventDefault();
    const grade = gradeForms[submission.id] || { score: 0, feedback: '', decision: 'passed' };
    setSaving(`grade:${submission.id}`);
    try {
      await api.post(`/assignments/submissions/${submission.id}/grade`, {
        score: Number(grade.score),
        feedback: grade.feedback,
        decision: grade.decision,
      });
      toast.success('Project review saved.');
      setSubmissions((current) => ({
        ...current,
        [task.id]: (current[task.id] || []).map((item) => item.id === submission.id
          ? { ...item, ...grade, status: grade.decision, score: Number(grade.score) }
          : item),
      }));
      await load();
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setSaving('');
    }
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}" and its submissions? This cannot be undone.`)) return;
    setSaving(`delete:${task.id}`);
    try {
      await api.delete(`/assignments/${task.id}`);
      toast.success('Project task deleted.');
      await load();
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setSaving('');
    }
  };

  return <section id="project-tasks" className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow">Hands-on practice</p>
        <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Github size={18} className="text-brand-700" />Project tasks</h2>
        <p className="mt-1 text-sm text-slate-500">{admin ? 'Create practical briefs for learners and review their project links.' : 'Build each project and submit a GitHub repository or Google Drive link for review.'}</p>
      </div>
      {admin && <button type="button" className="btn-primary" onClick={() => setCreating((value) => !value)}><Plus size={16} />{creating ? 'Close form' : 'Add project task'}</button>}
    </div>

    {admin && creating && <form onSubmit={createTask} className="mt-4 space-y-3 rounded-xl border border-green-100 bg-green-50/40 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TaskTextField label="Project title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={2} maxLength={180} placeholder="e.g. Build a responsive portfolio website" />
        <TaskTextField label="Due date (optional)" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
        <TaskTextField label="Project brief" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} multiline maxLength={12000} placeholder="Describe the scenario and what the learner should build." />
        <TaskTextField label="Learning objectives" value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} multiline maxLength={4000} placeholder="Skills this project should practise." />
        <TaskTextField label="Tools and materials" value={form.toolsAndMaterials} onChange={(event) => setForm({ ...form, toolsAndMaterials: event.target.value })} multiline maxLength={4000} placeholder="Recommended tools, datasets, or starter resources." />
        <TaskTextField label="Steps / deliverables (one per line)" value={form.tasks} onChange={(event) => setForm({ ...form, tasks: event.target.value })} multiline maxLength={10000} placeholder={'Create the project repository\nImplement the required features\nAdd a README with setup steps'} />
        <TaskTextField label="Submission requirements" value={form.submissionRequirements} onChange={(event) => setForm({ ...form, submissionRequirements: event.target.value })} multiline maxLength={4000} placeholder="What should the reviewer look for?" />
        <div className="grid grid-cols-2 gap-3">
          <TaskTextField label="Points" type="number" value={form.maxPoints} onChange={(event) => setForm({ ...form, maxPoints: event.target.value })} min={1} max={10000} required />
          <TaskTextField label="Pass mark" type="number" value={form.passMark} onChange={(event) => setForm({ ...form, passMark: event.target.value })} min={0} max={Number(form.maxPoints)} required />
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">The task is published immediately. Students submit a GitHub or Google Drive link; you can request changes and review a new submission.</p>
      <button className="btn-primary" disabled={saving === 'create'}>{saving === 'create' ? <Spinner size={15} /> : <Plus size={15} />}Publish project task</button>
    </form>}

    {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Spinner size={16} />Loading project tasks…</div>
      : !tasks.length ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">{admin ? 'No project tasks yet. Add a task brief to give students a practical challenge.' : 'No practical project tasks have been published yet.'}</p>
        : <div className="mt-4 space-y-3">{tasks.map((task) => {
          const submission = task.submission;
          const formValue = submissionForms[task.id] || { link: '', response: '' };
          const canSubmit = !submission || (task.allowResubmission && !['submitted', 'passed'].includes(submission.status));
          return <article key={task.id} className="rounded-xl border border-slate-200 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{task.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{task.maxPoints} points</span>
                  {task.dueAt && <span className="inline-flex items-center gap-1"><CalendarClock size={12} />Due {formatDateTime(task.dueAt)}</span>}
                  {admin && <span>{task.pendingCount || 0} awaiting review</span>}
                </div>
              </div>
              {submission && <Badge color={statusColor[submission.status]}>{statusLabel[submission.status] || submission.status}</Badge>}
            </div>
            {task.instructions && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.instructions}</p>}
            {task.objectives && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold">Objectives: </span>{task.objectives}</p>}
            {task.toolsAndMaterials && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold">Tools: </span>{task.toolsAndMaterials}</p>}
            {!!task.tasks?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{task.tasks.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}
            {task.submissionRequirements && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold">Submit: </span>{task.submissionRequirements}</p>}

            {!admin && submission && <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Attempt {submission.attempt}{submission.submittedAt ? ` · Submitted ${formatDateTime(submission.submittedAt)}` : ''}{submission.score !== null && submission.score !== undefined ? ` · ${submission.score}/${task.maxPoints}` : ''}</p>
              {submission.links?.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-sm font-semibold text-brand-700 underline">Open submitted project <ExternalLink size={12} /></a>)}
              {submission.feedback && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{submission.feedback}</p>}
            </div>}

            {admin ? <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary min-h-0 px-3 py-2 text-xs" onClick={() => toggleSubmissions(task)}><ClipboardList size={14} />{expandedSubmissions[task.id] ? 'Hide submissions' : 'Review submissions'}</button>
              <button type="button" className="btn-ghost min-h-0 px-3 py-2 text-xs text-red-700" disabled={saving === `delete:${task.id}`} onClick={() => deleteTask(task)}>{saving === `delete:${task.id}` ? <Spinner size={14} /> : <Trash2 size={14} />}Delete task</button>
            </div> : canSubmit && <form onSubmit={(event) => submitProject(event, task)} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {submission?.status === 'revision-requested' && <p className="text-sm font-semibold text-amber-800">Update your work and submit a new version.</p>}
              <TaskTextField label="GitHub or Google Drive link" type="url" required maxLength={2048} value={formValue.link} onChange={(event) => setSubmissionForms({ ...submissionForms, [task.id]: { ...formValue, link: event.target.value } })} placeholder="https://github.com/you/project or https://drive.google.com/…" />
              <TaskTextField label="Notes for the reviewer" value={formValue.response} onChange={(event) => setSubmissionForms({ ...submissionForms, [task.id]: { ...formValue, response: event.target.value } })} multiline maxLength={20000} placeholder="Summarize what you built and how to run or review it." />
              <button className="btn-primary" disabled={saving === `submit:${task.id}`}>{saving === `submit:${task.id}` ? <Spinner size={15} /> : <Send size={14} />}{submission ? 'Resubmit project' : 'Submit project'}</button>
            </form>}

            {admin && expandedSubmissions[task.id] && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {saving === `load:${task.id}` && <p className="text-sm text-slate-500"><Spinner size={14} /> Loading submissions…</p>}
              {saving !== `load:${task.id}` && (submissions[task.id] || []).length === 0 && <p className="text-sm text-slate-500">No submissions yet.</p>}
              {(submissions[task.id] || []).map((entry) => {
                const grade = gradeForms[entry.id] || { score: entry.score ?? task.maxPoints, feedback: entry.feedback || '', decision: entry.status === 'revision-requested' ? 'revision-requested' : 'passed' };
                return <div key={entry.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-sm font-semibold text-slate-800">{entry.student?.name || 'Student'} <span className="font-normal text-slate-500">· {entry.student?.email}</span></p><p className="mt-0.5 text-xs text-slate-500">Attempt {entry.attempt} · {formatDateTime(entry.submittedAt)}</p></div>
                    <Badge color={statusColor[entry.status]}>{statusLabel[entry.status] || entry.status}</Badge>
                  </div>
                  {entry.links?.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-sm font-semibold text-brand-700 underline">Open project <ExternalLink size={12} /></a>)}
                  {entry.response && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{entry.response}</p>}
                  <form onSubmit={(event) => gradeProject(event, task, entry)} className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_180px_auto] sm:items-end">
                    <TaskTextField label="Score" type="number" min={0} max={task.maxPoints} required value={grade.score} onChange={(event) => setGradeForms({ ...gradeForms, [entry.id]: { ...grade, score: event.target.value } })} />
                    <TaskTextField label="Feedback" value={grade.feedback} onChange={(event) => setGradeForms({ ...gradeForms, [entry.id]: { ...grade, feedback: event.target.value } })} maxLength={8000} placeholder="Feedback for the learner" />
                    <label className="block"><span className="label">Decision</span><select className="input" value={grade.decision} onChange={(event) => setGradeForms({ ...gradeForms, [entry.id]: { ...grade, decision: event.target.value } })}><option value="passed">Pass project</option><option value="revision-requested">Request changes</option></select></label>
                    <button className="btn-primary" disabled={saving === `grade:${entry.id}`}>{saving === `grade:${entry.id}` ? <Spinner size={14} /> : <CheckCircle2 size={14} />}Save review</button>
                  </form>
                </div>;
              })}
            </div>}
          </article>;
        })}</div>}
  </section>;
}
