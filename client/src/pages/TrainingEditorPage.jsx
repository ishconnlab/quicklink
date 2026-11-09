import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, FileJson, ImagePlus, Save, Upload, Users, Wallet } from 'lucide-react';
import api, { apiError, assetUrl } from '../api/client.js';
import { PageHeader } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import PagedCheckboxList from '../components/PagedCheckboxList.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { parseCourseCurriculum } from '../lib/courseCurriculum.js';

const blankForm = (offeringType = 'training') => ({
  offeringType,
  title: '', subject: '', trade: '', course: '', level: offeringType === 'course' ? 'L3' : 'Training', introduction: '', description: '',
  difficulty: 'Beginner', courseDuration: '', learningObjectives: [], prerequisites: [], language: 'English', slug: '', instructorName: '', instructorBio: '',
  modules: [], lessonAccessMode: offeringType === 'course' ? 'daily' : 'sequential',
  startsAt: '', endsAt: '', enrollmentOpensAt: '', enrollmentClosesAt: '', schedule: '',
  durationMinutes: 60, lateThresholdMinutes: 15, earlyThresholdPercent: 75, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
  maxStudents: 300, enrollmentOpen: true, allowCancellation: true, published: true,
  studentIds: [],
  completionRequirements: { requireReading: false, requireTheory: false, requirePractical: false, requireAttendance: true, minimumScore: 0 },
  payment: { enabled: false, freeDays: 2, amount: 0, currency: 'RWF', paymentCode: '', paymentName: '', instructions: '' },
  projectSubmission: { enabled: false, required: false, title: '', instructions: '', allowGithub: true, allowOtherLinks: true, requireDescription: true },
});

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toIso = (value) => (value ? new Date(value).toISOString() : null);
const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const num = (value, fallback = 0) => (value === '' || value === null || value === undefined ? fallback : Number(value));

function Toggle({ checked, onChange, label, description }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-green-200">
    <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{label}</span>{description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>}</span>
    <span className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}><input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className={`absolute h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} /></span>
  </label>;
}

function Field({ label, hint, className = '', children }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] leading-5 text-slate-400">{hint}</span>}</label>;
}

export default function TrainingEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);
  const initialOfferingType = !editing && searchParams.get('type') === 'course' ? 'course' : 'training';
  const requestId = useRef(newRequestId());
  const [form, setForm] = useState(() => blankForm(initialOfferingType));
  const isCourse = (editing ? form.offeringType : initialOfferingType) === 'course';
  const [people, setPeople] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailLoadError, setThumbnailLoadError] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [curriculumPreview, setCurriculumPreview] = useState(null);
  const [curriculumError, setCurriculumError] = useState('');
  const [curriculumLoading, setCurriculumLoading] = useState(false);

  useEffect(() => {
    if (!thumbnail) { setThumbnailPreview(''); return undefined; }
    const preview = URL.createObjectURL(thumbnail);
    setThumbnailPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [thumbnail]);

  useEffect(() => {
    let active = true;
    const loads = [api.get('/classes/people/students')];
    if (editing) loads.push(api.get(`/courses/${id}`));
    Promise.all(loads).then(([peopleResponse, courseResponse]) => {
      if (!active) return;
      setPeople(peopleResponse.data.data.people);
      if (courseResponse) {
        const course = courseResponse.data.data.course;
        setForm({
          ...blankForm(),
          ...course,
          startsAt: toLocalInput(course.startsAt),
          endsAt: toLocalInput(course.endsAt),
          enrollmentOpensAt: toLocalInput(course.enrollmentOpensAt),
          enrollmentClosesAt: toLocalInput(course.enrollmentClosesAt),
          studentIds: (course.students || []).map((student) => student.id),
          completionRequirements: { ...blankForm().completionRequirements, ...(course.completionRequirements || {}) },
          payment: { ...blankForm().payment, ...(course.payment || {}) },
          projectSubmission: { ...blankForm().projectSubmission, ...(course.projectSubmission || {}) },
        });
      }
    }).catch((error) => toast.error(apiError(error).message)).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id, toast]);

  const totalStudents = useMemo(() => people.length, [people]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const previewCurriculum = (source) => {
    try {
      setCurriculumPreview(parseCourseCurriculum(source));
      setCurriculumError('');
    } catch (error) {
      setCurriculumPreview(null);
      setCurriculumError(error.message || 'The curriculum JSON is invalid.');
    }
  };

  const loadSuppliedCurriculum = async () => {
    setCurriculumLoading(true);
    setCurriculumError('');
    try {
      const response = await fetch('/IshConnect_ML_Curriculum.json');
      if (!response.ok) throw new Error(`Could not load the supplied curriculum (${response.status}).`);
      previewCurriculum(await response.text());
    } catch (error) {
      setCurriculumError(error.message || 'Could not load the supplied curriculum.');
    } finally {
      setCurriculumLoading(false);
    }
  };

  const previewCurriculumFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCurriculumLoading(true);
    try {
      previewCurriculum(await file.text());
    } catch (error) {
      setCurriculumPreview(null);
      setCurriculumError(error.message || 'Could not read the selected JSON file.');
    } finally {
      setCurriculumLoading(false);
    }
  };

  const applyCurriculum = () => {
    if (!curriculumPreview) return;
    const imported = curriculumPreview.course;
    setForm((current) => ({
      ...current,
      title: imported.title,
      subject: imported.subject,
      course: imported.course,
      introduction: imported.introduction,
      description: imported.description,
      difficulty: imported.difficulty,
      courseDuration: imported.courseDuration,
      learningObjectives: imported.learningObjectives,
      prerequisites: imported.prerequisites,
      language: imported.language,
      modules: imported.modules,
      lessonAccessMode: imported.lessonAccessMode,
      completionRequirements: { ...current.completionRequirements, requireAttendance: false },
    }));
    setErrors((current) => ({ ...current, title: '', thumbnail: '' }));
    setCurriculumError('');
  };

  const validate = () => {
    const next = {};
    if (form.title.trim().length < 2) next.title = `Enter a ${isCourse ? 'course' : 'training'} title.`;
    if (form.subject.trim().length < 2) next.subject = 'Enter a subject.';
    if (!isCourse && !thumbnail && !form.thumbnailUrl) next.thumbnail = 'Choose a cover image before saving this training.';
    if (Number(form.maxStudents) < Math.max(1, form.studentIds.length)) next.maxStudents = 'Capacity must cover the selected students.';
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) next.endsAt = 'End must be after the start.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) { toast.error('Review the highlighted fields.'); return; }
    setSaving(true);
    const payload = {
      offeringType: isCourse ? 'course' : 'training',
      title: form.title.trim(), subject: form.subject.trim(), trade: form.trade || '', course: form.course || '',
      level: form.level, introduction: form.introduction || '', description: form.description || '',
      difficulty: form.difficulty || 'Beginner', courseDuration: form.courseDuration || '', learningObjectives: form.learningObjectives || [], prerequisites: form.prerequisites || [], language: form.language || 'English', instructorName: form.instructorName || '', instructorBio: form.instructorBio || '', ...(form.slug ? { slug: form.slug } : {}),
      studentIds: form.studentIds,
      startsAt: isCourse ? null : toIso(form.startsAt), endsAt: isCourse ? null : toIso(form.endsAt),
      enrollmentOpensAt: isCourse ? null : toIso(form.enrollmentOpensAt), enrollmentClosesAt: isCourse ? null : toIso(form.enrollmentClosesAt),
      schedule: isCourse ? '' : form.schedule || '', durationMinutes: num(form.durationMinutes, 60),
      lateThresholdMinutes: num(form.lateThresholdMinutes, 15), earlyThresholdPercent: num(form.earlyThresholdPercent, 75),
      timezone: form.timezone || 'Africa/Johannesburg', maxStudents: num(form.maxStudents, 300),
      enrollmentOpen: Boolean(form.enrollmentOpen), allowCancellation: Boolean(form.allowCancellation), published: Boolean(form.published),
      completionRequirements: { ...form.completionRequirements, requireAttendance: isCourse ? false : form.completionRequirements.requireAttendance, minimumScore: num(form.completionRequirements.minimumScore, 0) },
      payment: { ...form.payment, freeDays: isCourse ? 0 : num(form.payment.freeDays, 0), amount: num(form.payment.amount, 0) },
      projectSubmission: { ...form.projectSubmission },
      ...(isCourse ? {
        lessonAccessMode: form.lessonAccessMode || 'daily',
        ...(form.modules.length ? {
          modules: form.modules.map((module) => ({
            title: module.title,
            lessons: module.lessons.map((lesson) => ({
              title: lesson.title,
              content: lesson.content,
              availableAt: lesson.availableAt || null,
              videoUrl: lesson.videoUrl || '',
              resources: lesson.resources || [],
              code: lesson.code || { language: '', source: '' },
              codeBlocks: lesson.codeBlocks || [],
              knowledgeCheck: lesson.knowledgeCheck || [],
              passMark: lesson.passMark || 70,
              assessmentAttempts: lesson.assessmentAttempts || 3,
            })),
          })),
        } : {}),
      } : {}),
    };
    try {
      let savedId = id;
      if (editing) {
        await api.patch(`/classes/${id}`, payload);
      } else {
        const response = await api.post('/classes', payload, { headers: { 'Idempotency-Key': requestId.current } });
        savedId = response.data.data.class.id;
      }
      if (thumbnail) {
        const body = new FormData();
        body.append('thumbnail', thumbnail);
        await api.post(`/courses/${savedId}/thumbnail`, body);
      }
      toast.success(editing ? `${isCourse ? 'Course' : 'Training'} updated.` : `${isCourse ? 'Course' : 'Training'} created.`);
      navigate(`/courses/${savedId}`);
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading training editor…" />;

  return <div className="pb-4">
    <Link to={editing ? `/courses/${id}` : (isCourse ? '/admin/courses' : '/courses')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} />{editing ? `Back to ${isCourse ? 'course' : 'training'}` : `Back to ${isCourse ? 'courses' : 'trainings'}`}</Link>
    <PageHeader
      eyebrow={`${editing ? 'Edit' : 'New'} ${isCourse ? 'course' : 'training'}`}
      title={editing ? form.title || `Edit ${isCourse ? 'course' : 'training'}` : isCourse ? 'Create a self-paced course' : 'Create a premium training'}
      subtitle={isCourse ? 'Set up an online course with structured lessons, saved progress, enrollment, and certificates. Live-class schedules and attendance do not apply.' : 'Set the learning experience, schedule, roster, payment rules, project requirements, and completion criteria.'}
      actions={<button form="training-form" type="submit" disabled={saving} className="btn-primary">{saving ? <Spinner size={17} /> : <Save size={17} />}{saving ? 'Saving…' : editing ? 'Save changes' : `Create ${isCourse ? 'course' : 'training'}`}</button>}
    />

    <form id="training-form" onSubmit={submit} className="space-y-5">
      {isCourse && <section className="rounded-2xl border border-green-200 bg-green-50/60 p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-green-100"><FileJson size={19} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-base font-bold text-slate-900">{editing ? 'Update course from JSON or edit manually' : 'Start from JSON or fill in the form'}</h2><p className="mt-1 text-sm leading-5 text-slate-600">{editing ? 'Preview a curriculum JSON, then apply it to replace this course’s details and lessons. Save changes below when you are ready.' : 'Import curriculum JSON to fill course details and lessons automatically, or enter the course information manually below.'}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={loadSuppliedCurriculum} disabled={curriculumLoading || saving} className="btn-secondary min-h-10">{curriculumLoading ? <Spinner size={15} /> : <FileJson size={15} />}Use supplied Machine Learning JSON</button>
          <label className="btn-secondary min-h-10 cursor-pointer"><Upload size={15} />Upload course JSON<input type="file" accept=".json,application/json" className="sr-only" disabled={curriculumLoading || saving} onChange={previewCurriculumFile} /></label>
          <a href="/IshConnect_ML_Curriculum.json" target="_blank" rel="noreferrer" className="btn-ghost min-h-10">View supplied JSON</a>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">The importer expects JSON shaped like <code className="rounded bg-white px-1 py-0.5">{"{ course: { title, subtitle, prerequisites, learning_outcomes, days } }"}</code>; each day needs a number and title. Files are previewed and validated before they fill the form.{editing && ' Applying a curriculum replaces the current course modules and lessons in the form; save changes to publish the update.'}</p>
        {curriculumError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{curriculumError}</p>}
        {curriculumPreview && <div className="mt-4 rounded-xl border border-green-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-bold text-slate-900">{curriculumPreview.course.title}</p><p className="mt-1 text-xs text-slate-600">{curriculumPreview.days.length} validated days · {curriculumPreview.days.reduce((total, day) => total + day.codeExamples, 0)} code examples</p></div>
            <button type="button" onClick={applyCurriculum} className="btn-primary min-h-9 px-3 text-xs"><CheckCircle2 size={15} />{editing ? 'Apply update to form' : 'Fill form with this JSON'}</button>
          </div>
          <ol className="mt-3 grid max-h-44 gap-1 overflow-y-auto text-xs text-slate-600 sm:grid-cols-2">{curriculumPreview.days.map((day, index) => <li key={`${day.title}-${index}`} className="flex min-w-0 items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2"><span className="min-w-0 break-words">{day.title}</span><span className="shrink-0">{day.codeExamples} code</span></li>)}</ol>
        </div>}
      </section>}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen size={18} className="text-brand-700" />{isCourse ? 'Course identity' : 'Training identity'}</h2>
        <p className="mt-1 text-sm text-slate-500">This is what students see in the catalog and on their certificate.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={`Full ${isCourse ? 'course' : 'training'} title`} hint={isCourse ? 'Matches course.title in the imported JSON.' : 'Use the official program name.'} className="sm:col-span-2"><input className={`input ${errors.title ? 'ring-2 ring-red-400' : ''}`} required minLength={2} maxLength={160} value={form.title} onChange={(event) => set('title', event.target.value)} placeholder={isCourse ? 'IshConnect Machine Learning Training' : 'e.g. Professional Web Development Bootcamp'} />{errors.title && <span className="mt-1 block text-xs text-red-600">{errors.title}</span>}</Field>
          <Field label="Subject" hint={isCourse ? 'Mapped from the curriculum subject, or use a short topic name.' : undefined}><input className={`input ${errors.subject ? 'ring-2 ring-red-400' : ''}`} required minLength={2} maxLength={120} value={form.subject} onChange={(event) => set('subject', event.target.value)} placeholder={isCourse ? 'Machine Learning' : 'e.g. Software Development'} />{errors.subject && <span className="mt-1 block text-xs text-red-600">{errors.subject}</span>}</Field>
          <Field label="Trade / pathway" hint="Optional grouping for the catalog."><input className="input" maxLength={120} value={form.trade} onChange={(event) => set('trade', event.target.value)} placeholder="e.g. Technology" /></Field>
          <Field label="Level"><select className="input" value={form.level} onChange={(event) => set('level', event.target.value)}>{(isCourse ? ['L3', 'L4', 'L5', 'Bootcamp', 'Training'] : ['Bootcamp', 'Training']).map((level) => <option key={level}>{level}</option>)}</select></Field>
          <Field label="Program / course label" hint="Optional internal program name."><input className="input" maxLength={160} value={form.course} onChange={(event) => set('course', event.target.value)} placeholder={isCourse ? 'Machine Learning' : 'e.g. Web Development'} /></Field>
          <Field label="Difficulty"><select className="input" value={form.difficulty} onChange={(event) => set('difficulty', event.target.value)}>{['Beginner', 'Intermediate', 'Advanced'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Course duration" hint="Learning programme duration, separate from live session length."><input className="input" maxLength={120} value={form.courseDuration} onChange={(event) => set('courseDuration', event.target.value)} placeholder="e.g. 8 weeks" /></Field>
          <Field label="Course language"><input className="input" maxLength={80} value={form.language} onChange={(event) => set('language', event.target.value)} /></Field>
          <Field label="Instructor name"><input className="input" maxLength={160} value={form.instructorName} onChange={(event) => set('instructorName', event.target.value)} placeholder="Course instructor" /></Field>
          <Field label="Instructor information" className="sm:col-span-2"><textarea className="input min-h-20" maxLength={3000} value={form.instructorBio} onChange={(event) => set('instructorBio', event.target.value)} placeholder="Relevant experience and instructor background" /></Field>
          <Field label="Unique course slug" hint="Leave blank to create one automatically."><input className="input" maxLength={180} value={form.slug} onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-'))} placeholder="python-foundations" /></Field>
          <Field label="Short introduction" hint={isCourse ? 'Matches course.subtitle in the imported JSON.' : 'One or two lines shown on cards.'} className="sm:col-span-2"><input className="input" maxLength={500} value={form.introduction} onChange={(event) => set('introduction', event.target.value)} placeholder={isCourse ? 'From Zero to Building Real ML Projects in 10 Days' : 'A concise promise of what students will achieve.'} /></Field>
          <Field label="Detailed description" hint={isCourse ? 'Can describe course.level and course.target_audience.' : undefined} className="sm:col-span-2"><textarea className="input min-h-32" maxLength={12000} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder={isCourse ? 'Beginner · Complete beginners with little or no prior Machine Learning experience…' : 'Outcomes, who it is for, tools covered, and how learning is delivered.'} /></Field>
          <Field label="Learning objectives" hint={isCourse ? 'Imported from course.learning_outcomes; one objective per line.' : 'One objective per line.'} className="sm:col-span-2"><textarea className="input min-h-24" value={(form.learningObjectives || []).join('\n')} onChange={(event) => set('learningObjectives', event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} placeholder={isCourse ? 'Explain what AI and Machine Learning are in simple terms\nLoad, explore, clean and prepare real datasets' : 'Build a responsive website\nUse Git to track changes'} /></Field>
          <Field label="Prerequisites" hint="One requirement per line." className="sm:col-span-2"><textarea className="input min-h-20" value={(form.prerequisites || []).join('\n')} onChange={(event) => set('prerequisites', event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} placeholder="Basic computer literacy" /></Field>
          <Field label="Cover image" hint={isCourse ? 'Optional. PNG, JPEG, or WebP up to 3 MB.' : 'Required. PNG, JPEG, or WebP up to 3 MB.'} className="sm:col-span-2"><div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-start"><div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 bg-green-50 sm:max-w-64">{thumbnailPreview || (form.thumbnailUrl && !thumbnailLoadError) ? <img src={thumbnailPreview || assetUrl(form.thumbnailUrl)} alt={`Cover preview for ${form.title || `this ${isCourse ? 'course' : 'training'}`}`} className="h-full w-full object-cover" onError={() => setThumbnailLoadError(true)} /> : <div className="grid h-full place-items-center px-3 text-center text-sm text-green-800">{thumbnailLoadError ? 'Cover image unavailable. Choose a replacement.' : 'Cover preview'}</div>}</div><div className="min-w-0"><label className="btn-secondary w-fit cursor-pointer"><ImagePlus size={16} />Choose image<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] || null; if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024)) { toast.error('Choose a PNG, JPEG, or WebP image up to 3 MB.'); event.target.value = ''; return; } setThumbnail(file); setThumbnailLoadError(false); setErrors((current) => ({ ...current, thumbnail: '' })); }} /></label>{thumbnail && <p className="mt-2 break-all text-xs text-slate-500">Selected: {thumbnail.name}</p>}{!thumbnail && form.thumbnailUrl && !thumbnailLoadError && <p className="mt-2 text-xs text-green-800">Current cover image</p>}{thumbnailLoadError && <p role="alert" className="mt-2 text-xs text-amber-700">This saved image could not be loaded. Choose and save a replacement.</p>}{errors.thumbnail && <p className="mt-2 text-xs text-red-600">{errors.thumbnail}</p>}<p className="mt-2 text-xs leading-5 text-slate-500">The preview shows exactly what will appear on the {isCourse ? 'course' : 'training'} card.</p></div></div></Field>
        </div>
      </section>

      {isCourse && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Users size={18} className="text-brand-700" />Course enrollment</h2>
        <p className="mt-1 text-sm text-slate-500">Learners find courses alongside trainings in their Trainings area. No live-class schedule or attendance is required.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Maximum students"><input type="number" min="1" max="10000" className={`input ${errors.maxStudents ? 'ring-2 ring-red-400' : ''}`} value={form.maxStudents} onChange={(event) => set('maxStudents', event.target.value)} />{errors.maxStudents && <span className="mt-1 block text-xs text-red-600">{errors.maxStudents}</span>}</Field>
          <Field label="Lesson access" hint="Daily opens Day 1 now; each completed day unlocks the next day at 6:00 AM."><select className="input" value={form.lessonAccessMode || 'daily'} onChange={(event) => set('lessonAccessMode', event.target.value)}><option value="daily">Daily — one lesson per day at 6:00 AM</option><option value="sequential">Sequential — complete each lesson to unlock the next</option><option value="scheduled">Scheduled — each lesson opens on its date</option></select></Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Toggle label="Enrollment open" description="Students can join from the Trainings area." checked={form.enrollmentOpen} onChange={(value) => set('enrollmentOpen', value)} />
          <Toggle label="Allow students to leave" description="Students may cancel their enrollment." checked={form.allowCancellation} onChange={(value) => set('allowCancellation', value)} />
          <Toggle label="Published" description="Visible to students in Trainings." checked={form.published} onChange={(value) => set('published', value)} />
        </div>
      </section>}

      {!isCourse && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarClock size={18} className="text-brand-700" />Schedule and enrollment</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Training starts"><input type="datetime-local" className="input" value={form.startsAt} onChange={(event) => set('startsAt', event.target.value)} /></Field>
          <Field label="Training ends"><input type="datetime-local" className={`input ${errors.endsAt ? 'ring-2 ring-red-400' : ''}`} value={form.endsAt} onChange={(event) => set('endsAt', event.target.value)} /></Field>
          <Field label="Enrollment opens"><input type="datetime-local" className="input" value={form.enrollmentOpensAt} onChange={(event) => set('enrollmentOpensAt', event.target.value)} /></Field>
          <Field label="Enrollment closes"><input type="datetime-local" className="input" value={form.enrollmentClosesAt} onChange={(event) => set('enrollmentClosesAt', event.target.value)} /></Field>
          <Field label="Schedule summary"><input className="input" maxLength={500} value={form.schedule} onChange={(event) => set('schedule', event.target.value)} placeholder="e.g. Mon & Wed · 18:00–20:00" /></Field>
          <Field label="Session duration (minutes)"><input type="number" min="5" max="1440" className="input" value={form.durationMinutes} onChange={(event) => set('durationMinutes', event.target.value)} /></Field>
          <Field label="Late threshold (minutes)"><input type="number" min="0" max="240" className="input" value={form.lateThresholdMinutes} onChange={(event) => set('lateThresholdMinutes', event.target.value)} /></Field>
          <Field label="Early-leave threshold (%)"><input type="number" min="1" max="100" className="input" value={form.earlyThresholdPercent} onChange={(event) => set('earlyThresholdPercent', event.target.value)} /></Field>
          <Field label="Timezone"><input className="input" maxLength={80} value={form.timezone} onChange={(event) => set('timezone', event.target.value)} /></Field>
          <Field label="Maximum students"><input type="number" min="1" max="10000" className={`input ${errors.maxStudents ? 'ring-2 ring-red-400' : ''}`} value={form.maxStudents} onChange={(event) => set('maxStudents', event.target.value)} />{errors.maxStudents && <span className="mt-1 block text-xs text-red-600">{errors.maxStudents}</span>}</Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Toggle label="Enrollment open" description="Students can join from the catalog." checked={form.enrollmentOpen} onChange={(value) => set('enrollmentOpen', value)} />
          <Toggle label="Allow students to leave" description="Students may cancel their enrollment." checked={form.allowCancellation} onChange={(value) => set('allowCancellation', value)} />
          <Toggle label="Published" description="Visible in the student catalog." checked={form.published} onChange={(value) => set('published', value)} />
        </div>
      </section>}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Users size={18} className="text-brand-700" />Enrolled students</h2>
        <p className="mt-1 text-sm text-slate-500">{totalStudents} active student accounts available. Selected students are enrolled immediately and receive an enrollment record.</p>
        <div className="mt-4"><PagedCheckboxList title="Student roster" items={people} selectedIds={form.studentIds} onChange={(studentIds) => set('studentIds', studentIds)} emptyLabel="No active students match this search." pageSize={8} /></div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Wallet size={18} className="text-brand-700" />Payment rules</h2>
        <p className="mt-1 text-sm text-slate-500">{isCourse ? 'Optionally require verified payment before students can access this self-paced course.' : 'Students attend free for the configured number of days, then live access and project submission require verified payment.'}</p>
        <div className="mt-4"><Toggle label={`Require payment for this ${isCourse ? 'course' : 'training'}`} description="Enable mobile money payment with admin verification." checked={form.payment.enabled} onChange={(value) => set('payment', { ...form.payment, enabled: value })} /></div>
        {form.payment.enabled && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!isCourse && <Field label="Free access days"><input type="number" min="0" max="60" className="input" value={form.payment.freeDays} onChange={(event) => set('payment', { ...form.payment, freeDays: event.target.value })} /></Field>}
          <Field label="Amount"><input type="number" min="0" className="input" value={form.payment.amount} onChange={(event) => set('payment', { ...form.payment, amount: event.target.value })} /></Field>
          <Field label="Currency"><input className="input" maxLength={12} value={form.payment.currency} onChange={(event) => set('payment', { ...form.payment, currency: event.target.value })} /></Field>
          <Field label="Payment code"><input className="input" required={form.payment.enabled} maxLength={40} value={form.payment.paymentCode} onChange={(event) => set('payment', { ...form.payment, paymentCode: event.target.value })} placeholder="e.g. 699655" /></Field>
          <Field label="Account name"><input className="input" required={form.payment.enabled} maxLength={120} value={form.payment.paymentName} onChange={(event) => set('payment', { ...form.payment, paymentName: event.target.value })} placeholder="e.g. Jean Claude" /></Field>
          <Field label="Payment instructions" className="sm:col-span-2 lg:col-span-3"><textarea className="input min-h-20" maxLength={2000} value={form.payment.instructions} onChange={(event) => set('payment', { ...form.payment, instructions: event.target.value })} /></Field>
        </div>}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CheckCircle2 size={18} className="text-brand-700" />Project and completion requirements</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle label="Project submission enabled" description="Students can submit a project link and description." checked={form.projectSubmission.enabled} onChange={(value) => set('projectSubmission', { ...form.projectSubmission, enabled: value })} />
          <Toggle label="Project required for certificate" description="Students must submit before the assessment unlock." checked={form.projectSubmission.required} onChange={(value) => set('projectSubmission', { ...form.projectSubmission, required: value })} />
        </div>
        {form.projectSubmission.enabled && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Project title" className="sm:col-span-2"><input className="input" maxLength={180} value={form.projectSubmission.title} onChange={(event) => set('projectSubmission', { ...form.projectSubmission, title: event.target.value })} placeholder="e.g. Final capstone project" /></Field>
          <Field label="Project instructions" className="sm:col-span-2"><textarea className="input min-h-24" maxLength={4000} value={form.projectSubmission.instructions} onChange={(event) => set('projectSubmission', { ...form.projectSubmission, instructions: event.target.value })} placeholder="Explain what to build, submit, and how it will be reviewed." /></Field>
          <Toggle label="Allow GitHub links" checked={form.projectSubmission.allowGithub} onChange={(value) => set('projectSubmission', { ...form.projectSubmission, allowGithub: value })} />
          <Toggle label="Allow other links" description="Portfolio, Drive, Figma, and similar URLs." checked={form.projectSubmission.allowOtherLinks} onChange={(value) => set('projectSubmission', { ...form.projectSubmission, allowOtherLinks: value })} />
          <Toggle label="Require a description" description="At least 10 characters explaining the work." checked={form.projectSubmission.requireDescription} onChange={(value) => set('projectSubmission', { ...form.projectSubmission, requireDescription: value })} />
        </div>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {!isCourse && <Toggle label="Require attendance" description="Students must attend the configured minimum sessions." checked={form.completionRequirements.requireAttendance} onChange={(value) => set('completionRequirements', { ...form.completionRequirements, requireAttendance: value })} />}
          <Toggle label="Require practical assignments" description="All published practical work must pass." checked={form.completionRequirements.requirePractical} onChange={(value) => set('completionRequirements', { ...form.completionRequirements, requirePractical: value })} />
          <Toggle label="Require theory assessments" description="All published quizzes must pass." checked={form.completionRequirements.requireTheory} onChange={(value) => set('completionRequirements', { ...form.completionRequirements, requireTheory: value })} />
          <Field label="Minimum overall assignment score (%)"><input type="number" min="0" max="100" className="input" value={form.completionRequirements.minimumScore} onChange={(event) => set('completionRequirements', { ...form.completionRequirements, minimumScore: event.target.value })} /></Field>
        </div>
        <p className="mt-3 rounded-xl bg-green-50 px-3 py-2.5 text-xs leading-5 text-brand-900">The certification assessment and its 10 questions are configured from the {isCourse ? 'course' : 'training'} detail page after saving. Defaults come from platform settings.</p>
      </section>

      <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-100 bg-white/95 p-3 shadow-lg shadow-green-950/5 backdrop-blur lg:bottom-4">
        <p className="text-xs text-slate-500">Changes apply to enrolled students immediately.{!isCourse && ' A live session blocks roster changes.'}</p>
        <div className="flex gap-2"><Link to={editing ? `/courses/${id}` : (isCourse ? '/admin/courses' : '/courses')} className="btn-secondary">Cancel</Link><button type="submit" disabled={saving} className="btn-primary">{saving ? <Spinner size={17} /> : <Save size={17} />}{saving ? 'Saving…' : editing ? 'Save changes' : `Create ${isCourse ? 'course' : 'training'}`}</button></div>
      </div>
    </form>
  </div>;
}
