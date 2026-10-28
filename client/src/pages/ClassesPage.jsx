import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Clock3, Plus, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Modal, Badge } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import PagedCheckboxList from '../components/PagedCheckboxList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const blankClass = () => ({ title: '', subject: '', trade: '', introduction: '', course: '', level: 'L3', description: '', learningMaterials: [], completionRequirements: { requireReading: false, requireTheory: false, requirePractical: false, requireAttendance: false, minimumScore: 0 }, published: true, startsAt: '', schedule: '', durationMinutes: 60, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg', maxStudents: 300, enrollmentOpen: true, teacherIds: [], studentIds: [] });

export default function ClassesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [books, setBooks] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);
  const [form, setForm] = useState(blankClass);
  const [modal, setModal] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [classPage, setClassPage] = useState(1);
  const [classPages, setClassPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [api.get('/classes', { params: { ...(includeArchived ? { includeArchived: true } : {}), page: classPage, limit: 12 } })];
      if (user?.role === 'owner') requests.push(api.get('/classes/people/teachers'), api.get('/classes/people/students'), api.get('/learning/books', { params: { manage: true, limit: 500 } }));
      const [classRes, teacherRes, studentRes] = await Promise.all(requests);
      setClasses(classRes.data.data.classes);
      setClassPages(classRes.data.data.pages || 1);
      if (teacherRes) setTeachers(teacherRes.data.data.people);
      if (studentRes) setStudents(studentRes.data.data.people);
      if (requests.length > 3) setBooks((await requests[3]).data.data.books.filter((book) => book.active && book.processingStatus === 'ready'));
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [user?.role, includeArchived, classPage]);

  useEffect(() => { load(); }, [load]);

  const createClass = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.post('/classes', { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, durationMinutes: Number(form.durationMinutes), maxStudents: Number(form.maxStudents) });
      const created = response.data.data.class;
      if (thumbnail) await api.post(`/courses/${created.id}/thumbnail`, (() => { const data = new FormData(); data.append('thumbnail', thumbnail); return data; })());
      toast.success('Course created and assigned.');
      setModal(false);
      setForm(blankClass());
      setThumbnail(null);
      load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => { setCreateStep(0); setForm(blankClass()); setThumbnail(null); setModal(true); };
  const nextCreateStep = () => {
    if ((createStep === 0 || createStep === 1) && !document.getElementById('create-class-form')?.reportValidity()) return;
    if (createStep === 1 && form.teacherIds.length === 0) { toast.error('Choose at least one teacher for this class.'); return; }
    setCreateStep((step) => Math.min(3, step + 1));
  };
  const submitCreate = (event) => {
    if (createStep < 3) { event.preventDefault(); nextCreateStep(); return; }
    createClass(event);
  };
  const booksForLevel = books.filter((book) => book.level === form.level);

  return <div>
    <PageHeader title={user?.role === 'owner' ? 'Courses and classes' : 'Classes'} subtitle={user?.role === 'owner' ? 'Publish courses, assign teachers, manage enrollment, and schedule classes.' : 'Your assigned teaching and learning groups.'} actions={user?.role === 'owner' && <div className="flex gap-2"><button className="btn-secondary" onClick={() => setIncludeArchived((value) => !value)}>{includeArchived ? 'Hide archived' : 'Show archived'}</button><button className="btn-primary" onClick={openCreate}><Plus size={18} />New course</button></div>} />
    {loading ? <PageLoader label="Loading classes…" /> : classes.length === 0 ? (
      <EmptyState icon={BookOpen} title="No classes yet" description={user?.role === 'owner' ? 'Create a class, choose a teacher, and enroll students to begin.' : 'Your admin will add you to a class.'} action={user?.role === 'owner' && <button onClick={openCreate} className="btn-primary"><Plus size={17} />Create class</button>} />
    ) : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {classes.map((item) => <Link key={item.id} to={`/classes/${item.id}`} className={`card block transition-shadow hover:shadow-md ${item.active ? '' : 'opacity-70'}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.subject}</p></div><span className="flex gap-1"><Badge color="brand">{item.level}</Badge>{!item.active && <Badge color="slate">Archived</Badge>}</span></div>
        <p className="mt-4 text-sm text-slate-600">Teacher: {item.teacher.name}</p>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Users size={14} />{item.students.length} students</span>{item.liveSession && <Badge color="red"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live now</Badge>}</div>
        {item.recentSession && !item.liveSession && <p className="mt-3 flex items-center gap-1 text-xs text-slate-400"><Clock3 size={13} />Last class {item.recentSession.status === 'ended' ? 'ended' : 'started'}</p>}
      </Link>)}
    </div>{classPages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={classPage <= 1} onClick={() => setClassPage((page) => page - 1)}>Previous</button><span className="text-sm text-slate-500">Page {classPage} of {classPages}</span><button className="btn-secondary" disabled={classPage >= classPages} onClick={() => setClassPage((page) => page + 1)}>Next</button></div>}</>}

    <Modal open={modal} onClose={() => !saving && setModal(false)} title="Create a class" size="lg" footer={teachers.length > 0 && <><button type="button" className="btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancel</button>{createStep > 0 && <button type="button" className="btn-secondary" onClick={() => setCreateStep((step) => step - 1)} disabled={saving}><ChevronLeft size={16} />Back</button>}{createStep < 3 ? <button type="button" className="btn-primary" onClick={nextCreateStep}>Next<ChevronRight size={16} /></button> : <button form="create-class-form" type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner size={16} /> : <Plus size={16} />}Create class</button>}</>}>
      {!teachers.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Add a teacher before creating this class.</p><p className="mt-1">Classes need at least one assigned teacher. Create the teacher account, then return here to set up the class.</p><Link to="/users" className="btn-primary mt-3 inline-flex">Go to People and accounts</Link></div> : <div className="space-y-4">
        <nav className="grid grid-cols-4 gap-1.5" aria-label="Create class steps">{['Course details', 'Teacher & time', 'Materials & students', 'Completion'].map((label, index) => <div key={label} aria-current={createStep === index ? 'step' : undefined} className={`rounded-lg border px-2 py-2 text-center text-[11px] font-semibold leading-tight sm:text-xs ${createStep === index ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500'}`}><span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">{index + 1}</span><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{['Details', 'Teacher', 'Materials', 'Finish'][index]}</span></div>)}</nav>
        <form id="create-class-form" onSubmit={submitCreate} className="min-h-[19rem]">
          {createStep === 0 && <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="course-title">Full course title</label><input id="course-title" required maxLength={160} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Level 3 Software Development" /></div>
            <div><label className="label" htmlFor="course-subject">Subject</label><input id="course-subject" required maxLength={120} className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Web development" /></div>
            <div><label className="label" htmlFor="course-trade">Trade</label><input id="course-trade" maxLength={120} className="input" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} placeholder="Software development" /></div>
            <div><label className="label" htmlFor="course-introduction">Short introduction</label><input id="course-introduction" maxLength={500} className="input" value={form.introduction} onChange={(e) => setForm({ ...form, introduction: e.target.value })} placeholder="What students will learn" /></div>
            <div><label className="label" htmlFor="course-name">Course or training program</label><input id="course-name" maxLength={160} className="input" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="Optional program name" /></div>
            <div><label className="label" htmlFor="course-level">Level</label><select id="course-level" className="input" value={form.level} onChange={(e) => { const level = e.target.value; const validBookIds = new Set(books.filter((book) => book.level === level).map((book) => book.id)); setForm((current) => ({ ...current, level, learningMaterials: current.learningMaterials.filter((bookId) => validBookIds.has(bookId)) })); }}><option>L3</option><option>L4</option><option>L5</option></select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="course-description">Detailed course description</label><textarea id="course-description" className="input min-h-20" maxLength={12000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="course-thumbnail">Course thumbnail (PNG, JPEG, WebP; max 3 MB)</label><input id="course-thumbnail" className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumbnail(e.target.files?.[0] || null)} />{thumbnail && <p className="mt-1 truncate text-xs text-slate-500">Selected: {thumbnail.name}</p>}</div>
          </div>}
          {createStep === 1 && <div className="grid gap-4 sm:grid-cols-2">
            <PagedCheckboxList title="Assigned teachers" items={teachers} selectedIds={form.teacherIds} onChange={(teacherIds) => setForm({ ...form, teacherIds })} emptyLabel="No teachers match this search." pageSize={6} />
            <div className="space-y-3"><div><label className="label" htmlFor="class-start">Scheduled start</label><input id="class-start" type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div><div><label className="label" htmlFor="class-timezone">Timezone</label><input id="class-timezone" required className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div><div><label className="label" htmlFor="class-schedule">Schedule</label><input id="class-schedule" maxLength={500} className="input" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Mondays, 10:00–11:00" /></div><div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="class-duration">Duration (minutes)</label><input id="class-duration" type="number" min="5" max="1440" className="input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div><div><label className="label" htmlFor="class-capacity">Maximum students</label><input id="class-capacity" type="number" min="1" max="10000" className="input" value={form.maxStudents} onChange={(e) => setForm({ ...form, maxStudents: e.target.value })} /></div></div></div>
          </div>}
          {createStep === 2 && <div className="grid gap-4 lg:grid-cols-2">
            <div><PagedCheckboxList title={`Learning materials · ${form.level}`} items={booksForLevel} selectedIds={form.learningMaterials} onChange={(learningMaterials) => setForm({ ...form, learningMaterials })} emptyLabel={`No active ${form.level} documents match this search.`} pageSize={6} /><p className="mt-1 text-xs text-slate-500">Showing active, validated documents for the selected {form.level} class level.</p></div>
            <div><PagedCheckboxList title="Enroll students" items={students} selectedIds={form.studentIds} onChange={(studentIds) => setForm({ ...form, studentIds })} emptyLabel="No students match this search." pageSize={6} /><p className="mt-1 text-xs text-slate-500">Enrollment is limited by the class capacity ({form.maxStudents}).</p></div>
          </div>}
          {createStep === 3 && <div className="space-y-4">
            <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">Completion requirements</legend><div className="grid gap-2 sm:grid-cols-2">{[['requireReading','Require linked reading to be completed'],['requireTheory','Require theory assessments to pass'],['requirePractical','Require practical work to pass'],['requireAttendance','Require class attendance']].map(([key,label]) => <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={form.completionRequirements[key]} onChange={(e) => setForm({ ...form, completionRequirements: { ...form.completionRequirements, [key]: e.target.checked } })} />{label}</label>)}</div></fieldset>
            <label className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm text-slate-700"><input type="checkbox" checked={form.enrollmentOpen} onChange={(e) => setForm({ ...form, enrollmentOpen: e.target.checked })} />Enrollment open to eligible students</label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm text-slate-700"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Publish in the course catalog</label>
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900"><p className="font-semibold">Review</p><p className="mt-1">{form.title || 'Untitled course'} · {form.level} · {form.teacherIds.length} teacher(s) · {form.studentIds.length} student(s) · {form.learningMaterials.length} resource(s)</p></div>
          </div>}
        </form>
      </div>}
    </Modal>
  </div>;
}
