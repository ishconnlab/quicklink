import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardCheck, Code2, Copy, FileJson, LockKeyhole, Maximize2, Minimize2, PanelLeft, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, ProgressBar } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { parseCourseCurriculum } from '../lib/courseCurriculum.js';

const newLesson = (title = 'New lesson') => ({ title, content: '', availableAt: null, videoUrl: '', resources: [], code: { language: '', source: '' }, codeBlocks: [], knowledgeCheck: [], passMark: 70 });
const newModule = () => ({ title: 'New module', lessons: [] });

function inlineText(value) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}

function LessonContent({ content }) {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4';
      blocks.push(<Tag key={index} className="font-bold text-slate-900">{inlineText(heading[2])}</Tag>); index += 1; continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) { items.push(<li key={index}>{inlineText(lines[index].trim().slice(2))}</li>); index += 1; }
      blocks.push(<ul key={`ul-${index}`} className="list-disc space-y-1 pl-6">{items}</ul>); continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) { const cells = lines[index].trim().split('|').slice(1, -1).map((cell) => cell.trim()); if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells); index += 1; }
      blocks.push(<div key={`table-${index}`} className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-200">{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} className="bg-slate-50 px-3 py-2 font-semibold">{inlineText(cell)}</th> : <td key={cellIndex} className="px-3 py-2">{inlineText(cell)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const paragraph = [line]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s/.test(lines[index].trim()) && !lines[index].trim().startsWith('- ') && !lines[index].trim().startsWith('|')) { paragraph.push(lines[index].trim()); index += 1; }
    blocks.push(<p key={index} className="leading-7">{inlineText(paragraph.join(' '))}</p>);
  }
  return <div className="mt-5 max-w-3xl space-y-4 break-words text-sm text-slate-700">{blocks}</div>;
}

const codeKeywords = new Set('const let var function return if else for while class import from export default def print public private static void new async await try catch finally throw SELECT FROM WHERE INSERT UPDATE DELETE CREATE TABLE'.split(' '));
function highlightLine(line) {
  const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b)/g;
  const parts = [];
  let previous = 0;
  for (const match of line.matchAll(tokens)) {
    if (match.index > previous) parts.push(line.slice(previous, match.index));
    const token = match[0];
    const kind = /^(\/\/|#)/.test(token) ? 'text-slate-500 italic' : /^['"`]/.test(token) ? 'text-amber-700' : /^\d/.test(token) ? 'text-purple-700' : codeKeywords.has(token) ? 'font-semibold text-green-800' : '';
    parts.push(kind ? <span key={match.index} className={kind}>{token}</span> : token);
    previous = match.index + token.length;
  }
  if (previous < line.length) parts.push(line.slice(previous));
  return parts;
}

function MacCodeBlock({ block, copy }) {
  return <section className="mt-5 min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="flex min-w-0 items-center gap-2"><span className="flex shrink-0 gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-400"/><i className="h-2.5 w-2.5 rounded-full bg-yellow-400"/><i className="h-2.5 w-2.5 rounded-full bg-green-500"/></span><span className="truncate text-xs font-medium text-slate-600">{block.language || 'Code'}</span></div><button type="button" onClick={() => copy(block.source)} className="btn-secondary min-h-8 shrink-0 px-2.5 py-1 text-xs" aria-label="Copy complete code example"><Copy size={13}/>Copy code</button></div>{block.explanation && <p className="break-words border-b border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">{block.explanation}</p>}<pre className="max-h-[480px] max-w-full overflow-auto overscroll-x-contain p-4 font-mono text-[13px] leading-6 text-slate-800"><code className="block w-max min-w-full">{block.source.split('\n').map((line, index) => <span key={index} className="grid min-w-max grid-cols-[2.5rem_max-content] gap-3"><span className="select-none text-right text-slate-400">{index + 1}</span><span>{highlightLine(line) || ' '}</span></span>)}</code></pre></section>;
}

const localDateTimeValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toIsoDateTime = (value) => (value ? new Date(value).toISOString() : null);
const validObjectId = (value) => /^[0-9a-f]{24}$/i.test(value || '');
const formatUnlockTime = (value, timeZone) => new Date(value).toLocaleString(undefined, { timeZone: timeZone || undefined, dateStyle: 'medium', timeStyle: 'short' });

export default function CourseLearningPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const admin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [assessmentWarning, setAssessmentWarning] = useState('');
  const [dragged, setDragged] = useState(null);
  const [curriculumPreview, setCurriculumPreview] = useState(null);
  const [curriculumError, setCurriculumError] = useState('');
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [contentFullscreen, setContentFullscreen] = useState(false);
  const contentRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [api.get(`/classes/${id}/learning`), api.get(`/courses/${id}`)];
      if (admin) requests.push(api.get(`/classes/${id}/learning/analytics`));
      const [learningResponse, courseResponse, analyticsResponse] = await Promise.all(requests);
      const next = learningResponse.data.data;
      setData(next);
      setCourse(courseResponse.data.data.course);
      if (analyticsResponse) setAnalytics(analyticsResponse.data.data);
      const lessons = next.modules.flatMap((module) => module.lessons);
      setSelectedId((current) => lessons.some((lesson) => lesson.id === current && lesson.unlocked) ? current : lessons.find((lesson) => lesson.id === next.progress.currentLesson)?.id || lessons.find((lesson) => lesson.unlocked)?.id || lessons[0]?.id || '');
      return next;
    } catch (error) { toast.error(apiError(error).message); return null; }
    finally { setLoading(false); }
  }, [admin, id, toast]);
  useEffect(() => { load(); }, [load]);

  const lessons = useMemo(() => data?.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))) || [], [data]);
  const current = lessons.find((lesson) => lesson.id === selectedId) || null;
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === selectedId);
  const selectLesson = (lessonId) => {
    setSelectedId(lessonId);
    setResult(null);
    setAnswers({});
    setAssessmentStarted(false);
    setAssessmentWarning('');
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.matchMedia('(max-width: 1023px)').matches) setOutlineOpen(false);
  };
  const toggleContentFullscreen = async () => {
    if (document.fullscreenElement === contentRef.current) {
      await document.exitFullscreen();
      return;
    }
    if (contentFullscreen) {
      setContentFullscreen(false);
      return;
    }
    if (contentRef.current?.requestFullscreen) {
      try {
        await contentRef.current.requestFullscreen();
        return;
      } catch {
        // Use the in-app full-screen layout when native fullscreen is unavailable.
      }
    }
    setContentFullscreen(true);
  };

  useEffect(() => {
    const updateFullscreen = () => setContentFullscreen(document.fullscreenElement === contentRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const recordEvent = useCallback(async (type) => {
    if (!current?.id || admin) return;
    try { await api.post(`/classes/${id}/learning/lessons/${current.id}/events`, { type }); } catch { /* retain the assessment flow if event logging is temporarily unavailable */ }
  }, [admin, current?.id, id]);

  useEffect(() => {
    if (!assessmentStarted || !current?.hasAssessment || admin) return undefined;
    const onVisibility = () => {
      if (document.hidden) { setPageHidden(true); setAssessmentWarning('This assessment was hidden after a tab switch. The event was recorded.'); recordEvent('tab-hidden'); }
      else setPageHidden(false);
    };
    const onBlur = () => { setAssessmentWarning('Window focus changed during the assessment. The event was recorded.'); recordEvent('window-blur'); };
    const onFullscreen = () => { if (!document.fullscreenElement) { setAssessmentWarning('Fullscreen exited during the assessment. The event was recorded.'); recordEvent('fullscreen-exit'); } };
    const onCopy = (event) => { event.preventDefault(); recordEvent('copy'); };
    const onContextMenu = (event) => { event.preventDefault(); recordEvent('context-menu'); };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [admin, assessmentStarted, current?.hasAssessment, recordEvent]);

  const updateAdminModule = (moduleIndex, updater) => setData((currentData) => ({ ...currentData, modules: currentData.modules.map((module, index) => index === moduleIndex ? updater(module) : module) }));
  const reorderModules = (targetIndex) => {
    if (dragged?.type !== 'module') return;
    setData((currentData) => { const modules = [...currentData.modules]; const [moved] = modules.splice(dragged.moduleIndex, 1); modules.splice(targetIndex, 0, moved); return { ...currentData, modules }; });
    setDragged(null);
  };
  const reorderLessons = (moduleIndex, targetIndex) => {
    if (dragged?.type !== 'lesson') return;
    setData((currentData) => { const modules = currentData.modules.map((module) => ({ ...module, lessons: [...module.lessons] })); const [moved] = modules[dragged.moduleIndex].lessons.splice(dragged.lessonIndex, 1); modules[moduleIndex].lessons.splice(targetIndex, 0, moved); return { ...currentData, modules }; });
    setDragged(null);
  };
  const saveModules = async () => {
    setBusy(true);
    try {
      const modules = data.modules.map((module) => ({ ...(validObjectId(module.id) ? { _id: module.id } : {}), title: module.title, lessons: module.lessons.map((lesson) => ({ ...(validObjectId(lesson.id) ? { _id: lesson.id } : {}), title: lesson.title, content: lesson.content, availableAt: lesson.availableAt || null, videoUrl: lesson.videoUrl, imageUrl: lesson.imageUrl || '', imagePublicId: lesson.imagePublicId || '', resources: lesson.resources || [], code: lesson.code || {}, codeBlocks: lesson.codeBlocks || [], knowledgeCheck: lesson.questions || [], passMark: Number(lesson.passMark || 70), assessmentAttempts: Number(lesson.assessmentAttempts || 3) })) }));
      await api.patch(`/classes/${id}`, { modules, lessonAccessMode: data.lessonAccessMode || 'daily' });
      toast.success('Course lessons saved.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const markComplete = async () => {
    setBusy(true);
    try { await api.put(`/classes/${id}/learning/lessons/${current.id}/complete`); toast.success('Lesson marked complete.'); await load(); }
    catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const goToNextLesson = async () => {
    const nextLesson = lessons[lessonIndex + 1];
    if (!nextLesson) return;
    if (nextLesson.unlocked) {
      selectLesson(nextLesson.id);
      return;
    }
    if (current.hasAssessment || current.completed) return;
    setBusy(true);
    try {
      await api.put(`/classes/${id}/learning/lessons/${current.id}/complete`);
      const updated = await load();
      const next = updated?.modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === nextLesson.id);
      if (next?.unlocked) selectLesson(next.id);
      else toast.success(data.lessonAccessMode === 'daily' ? 'Day completed. The next day unlocks at 6:00 AM.' : 'Lesson completed. The next lesson will open when it becomes available.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const beginAssessment = async () => {
    setAssessmentStarted(true);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* fullscreen is a deterrent, not a requirement */ }
  };
  const submitAssessment = async () => {
    if (!current || current.questions.some((_, index) => answers[index] === undefined)) { toast.error('Answer every question before submitting.'); return; }
    setBusy(true);
    try {
      const response = await api.post(`/classes/${id}/learning/lessons/${current.id}/assessment`, { answers: current.questions.map((_, index) => ({ optionIndex: Number(answers[index]) })) });
      setResult(response.data.data.result);
      toast.success(response.data.data.result.passed ? 'Assessment passed.' : 'Assessment submitted. Review the answers and try again.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const copyCode = async (source) => { try { await navigator.clipboard.writeText(source || ''); toast.success('Code copied.'); } catch { toast.error('Could not copy code.'); } };
  const showCurriculumPreview = (source) => {
    try {
      const parsed = parseCourseCurriculum(source);
      setCurriculumPreview(parsed);
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
      showCurriculumPreview(await response.text());
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
      showCurriculumPreview(await file.text());
    } catch (error) {
      setCurriculumPreview(null);
      setCurriculumError(error.message || 'Could not read the selected JSON file.');
    } finally {
      setCurriculumLoading(false);
    }
  };
  const importCurriculum = async () => {
    if (!curriculumPreview) return;
    if (data.modules.some((module) => module.lessons.length)) {
      const confirmed = await dialog.confirm({
        title: 'Replace the current course content?',
        message: 'Importing replaces this course’s modules and lessons. Matching lesson IDs keep their progress; progress for changed lessons will no longer match.',
        confirmLabel: 'Replace with imported curriculum',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const imported = curriculumPreview.course;
      const oldModule = data.modules[0];
      const oldLessons = data.modules.flatMap((module) => module.lessons);
      const modules = imported.modules.map((module, moduleIndex) => ({
        ...module,
        ...(validObjectId(oldModule?.id) && moduleIndex === 0 ? { id: oldModule.id } : {}),
        lessons: module.lessons.map((lesson) => {
          const matchingLesson = oldLessons.find((item) => item.title === lesson.title);
          return { ...lesson, ...(validObjectId(matchingLesson?.id) ? { id: matchingLesson.id } : {}) };
        }),
      }));
      await api.patch(`/classes/${id}`, {
        title: imported.title,
        subject: imported.subject,
        course: imported.course,
        difficulty: imported.difficulty,
        courseDuration: imported.courseDuration,
        language: imported.language,
        introduction: imported.introduction,
        description: imported.description,
        prerequisites: imported.prerequisites,
        learningObjectives: imported.learningObjectives,
        lessonAccessMode: imported.lessonAccessMode,
        modules: modules.map((module) => ({
          ...(validObjectId(module.id) ? { _id: module.id } : {}),
          title: module.title,
          lessons: module.lessons.map((lesson) => ({
            ...(validObjectId(lesson.id) ? { _id: lesson.id } : {}),
            title: lesson.title,
            content: lesson.content,
            availableAt: lesson.availableAt,
            videoUrl: lesson.videoUrl,
            imageUrl: lesson.imageUrl,
            imagePublicId: lesson.imagePublicId,
            resources: lesson.resources,
            code: lesson.code,
            codeBlocks: lesson.codeBlocks,
            knowledgeCheck: lesson.knowledgeCheck,
            passMark: lesson.passMark,
            assessmentAttempts: lesson.assessmentAttempts,
          })),
        })),
      });
      setCurriculumPreview(null);
      toast.success(`${imported.title} imported as ${curriculumPreview.days.length} editable lessons.`);
      await load();
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setBusy(false);
    }
  };
  const uploadLessonImage = async (file, update) => {
    const body = new FormData(); body.append('image', file);
    setBusy(true);
    try { const response = await api.post(`/courses/${id}/modules/${data.modules.find((item) => item.lessons.some((lesson) => lesson.id === current.id))?.id}/lessons/${current.id}/image`, body); update({ imageUrl: response.data.data.imageUrl, imagePublicId: response.data.data.imagePublicId }); toast.success('Lesson image uploaded.'); }
    catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };

  if (loading) return <PageLoader label="Loading lessons…" />;
  if (!data || !course) return null;

  return <div className="space-y-5 pb-8">
    {pageHidden && <div className="fixed inset-0 z-[100] grid place-items-center bg-white/95 p-6 text-center"><div><ClipboardCheck className="mx-auto text-green-800"/><p className="mt-3 font-semibold text-slate-900">Assessment content is hidden</p><p className="mt-1 text-sm text-slate-600">Return to this tab to continue. The interruption has been recorded.</p></div></div>}
    <Link to={`/courses/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-green-800"><ArrowLeft size={16} />Back to {course.title}</Link>
    <PageHeader eyebrow={admin ? 'Course builder' : 'Learning'} title={course.title} description={admin ? 'Organize course modules and lesson content.' : data.lessonAccessMode === 'daily' ? 'Day 1 is open now. Complete each day and the next day unlocks at 6:00 AM the following day; your progress is saved across devices.' : data.lessonAccessMode === 'scheduled' ? 'Lessons open on their scheduled dates. Your progress is saved across devices.' : 'Start with the first lesson. Complete each lesson to unlock the next; your progress is saved across devices.'} />
    {admin ? <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="h-fit space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Course content</h2><button type="button" onClick={loadSuppliedCurriculum} disabled={curriculumLoading || busy} className="btn-secondary min-h-9 px-3 text-xs">{curriculumLoading ? <Spinner size={14} /> : <FileJson size={14} />}Preview supplied ML JSON</button></div>
        <label className="btn-secondary mt-2 min-h-9 w-full cursor-pointer justify-center px-3 text-xs"><Upload size={14} />Preview another JSON file<input type="file" accept=".json,application/json" className="sr-only" onChange={previewCurriculumFile} /></label>
        <p className="mt-2 text-xs leading-5 text-slate-500">Validate and preview a curriculum before importing its days into this course.</p>
        {curriculumError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs leading-5 text-red-700">{curriculumError}</p>}
        {curriculumPreview && <div className="mt-3 space-y-3 rounded-xl border border-green-200 bg-green-50/60 p-3">
          <div><p className="text-sm font-bold text-slate-900">{curriculumPreview.course.title}</p><p className="mt-1 text-xs text-slate-600">{curriculumPreview.days.length} days · {curriculumPreview.days.reduce((total, day) => total + day.codeExamples, 0)} code examples · validated</p></div>
          <ol className="max-h-48 space-y-1 overflow-y-auto pr-1 text-xs text-slate-700">{curriculumPreview.days.map((day, index) => <li key={`${day.title}-${index}`} className="flex items-start justify-between gap-2"><span className="min-w-0 break-words">{day.title}</span><span className="shrink-0 text-slate-500">{day.codeExamples} code</span></li>)}</ol>
          <details className="rounded-lg bg-white/80 p-2"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Inspect source JSON</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-600">{JSON.stringify(curriculumPreview.raw, null, 2)}</pre></details>
          <button type="button" onClick={importCurriculum} disabled={busy} className="btn-primary min-h-9 w-full px-3 text-xs">{busy ? <Spinner size={14} /> : <Upload size={14} />}Import {curriculumPreview.days.length} days</button>
        </div>}
        <label className="label mt-4" htmlFor="lesson-access-mode">Lesson access</label><select id="lesson-access-mode" className="input min-h-10" value={data.lessonAccessMode || 'daily'} onChange={(event) => setData((currentData) => ({ ...currentData, lessonAccessMode: event.target.value }))}><option value="daily">Daily — one lesson per day, unlocked at 6:00 AM</option><option value="sequential">Sequential — complete each lesson to unlock the next</option><option value="scheduled">Scheduled — each lesson opens on its date</option></select>
        <p className="mt-1 text-xs leading-5 text-slate-500">Daily mode opens Day 1 immediately; completing a day unlocks the next day at 6:00 AM. Optional lesson opening dates are enforced by the server in every mode.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Modules</h2><button onClick={() => setData({ ...data, modules: [...data.modules, { ...newModule(), id: `new-module-${Date.now()}` }] })} className="btn-secondary min-h-8 px-2.5 py-1 text-xs"><Plus size={14} />Module</button></div>
        <div className="mt-3 space-y-3">{data.modules.map((module, moduleIndex) => <section key={module.id || moduleIndex} draggable onDragStart={() => setDragged({ type: 'module', moduleIndex })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderModules(moduleIndex)} className="rounded-xl border border-slate-100 p-3"><input className="input min-h-9 px-2.5 text-sm font-semibold" value={module.title} onChange={(event) => updateAdminModule(moduleIndex, (item) => ({ ...item, title: event.target.value }))} aria-label="Module title" />
          <div className="mt-2 space-y-1">{module.lessons.map((lesson, lessonIndex) => <button key={lesson.id} draggable onDragStart={(event) => { event.stopPropagation(); setDragged({ type: 'lesson', moduleIndex, lessonIndex }); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); reorderLessons(moduleIndex, lessonIndex); }} onClick={() => setSelectedId(lesson.id)} className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs ${selectedId === lesson.id ? 'bg-green-50 font-semibold text-green-900' : 'text-slate-600 hover:bg-slate-50'}`}>{lesson.title}</button>)}</div>
          <div className="mt-2 flex items-center justify-between"><button onClick={() => { const lesson = { ...newLesson(), id: `new-lesson-${Date.now()}`, questions: [] }; updateAdminModule(moduleIndex, (item) => ({ ...item, lessons: [...item.lessons, lesson] })); setSelectedId(lesson.id); }} className="inline-flex items-center gap-1 text-xs font-semibold text-green-800"><Plus size={13} />Lesson</button><button onClick={() => { setData({ ...data, modules: data.modules.filter((_, index) => index !== moduleIndex) }); if (module.lessons.some((lesson) => lesson.id === selectedId)) setSelectedId(''); }} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label="Delete module"><Trash2 size={14} /></button></div>
        </section>)}</div>
      </section>{analytics && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-900">Learning analytics</h2><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Learners</span><b className="mt-1 block text-base text-slate-900">{analytics.learners}/{analytics.enrolled}</b></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Completed</span><b className="mt-1 block text-base text-slate-900">{analytics.completed}</b></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Attempts</span><b className="mt-1 block text-base text-slate-900">{analytics.assessmentAttempts}</b></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Pass rate</span><b className="mt-1 block text-base text-slate-900">{analytics.assessmentPassRate}%</b></div></div><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{analytics.learnerProgress?.map((learner) => <div key={learner.student.id} className="rounded-lg border border-slate-100 p-2 text-xs"><p className="truncate font-semibold text-slate-800">{learner.student.name}</p><p className="truncate text-slate-500">{learner.student.email}</p><div className="mt-1 flex justify-between text-slate-500"><span>{learner.completedLessons}/{learner.totalLessons} lessons</span><span>{learner.percent}%</span></div></div>)}</div></section>}</aside>
      <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {current ? <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Lesson editor</p><h2 className="mt-1 font-bold text-slate-900">Lesson content</h2></div><button onClick={saveModules} disabled={busy} className="btn-primary">{busy ? <Spinner size={16} /> : <Save size={16} />}Save lessons</button></div>
          {data.modules.map((module, moduleIndex) => module.lessons.some((lesson) => lesson.id === current.id) && <div key={module.id} className="space-y-4">
            {(() => { const lessonIndex = module.lessons.findIndex((lesson) => lesson.id === current.id); const lesson = module.lessons[lessonIndex]; const update = (changes) => updateAdminModule(moduleIndex, (item) => ({ ...item, lessons: item.lessons.map((entry, index) => index === lessonIndex ? { ...entry, ...changes } : entry) })); return <>
              <label className="block"><span className="label">Lesson title</span><input className="input" value={lesson.title} onChange={(event) => { update({ title: event.target.value }); setData((value) => value); }} /></label>
              <label className="block"><span className="label">Lesson content</span><textarea className="input min-h-56" maxLength={30000} value={lesson.content} onChange={(event) => update({ content: event.target.value })} placeholder="Use Markdown for headings (#, ##), lists (-), tables, bold, emphasis and inline code." /></label>
              <label className="block"><span className="label inline-flex items-center gap-1"><CalendarClock size={14} />Lesson opens at (optional)</span><span className="mb-1 block text-xs text-slate-500">Leave blank to use the course access rule only.</span><input type="datetime-local" className="input" value={localDateTimeValue(lesson.availableAt)} onChange={(event) => update({ availableAt: toIsoDateTime(event.target.value) })} /></label>
              <label className="block"><span className="label">YouTube or Instagram URL (optional)</span><input type="url" className="input" value={lesson.videoUrl || ''} onChange={(event) => update({ videoUrl: event.target.value })} placeholder="Video or reel URL" /></label>
              <label className="block"><span className="label">Lesson image</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !/^[0-9a-f]{24}$/i.test(module.id || '') || !/^[0-9a-f]{24}$/i.test(lesson.id || '')} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadLessonImage(file, update); }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold" />{lesson.imageUrl && <span className="mt-1 block text-xs text-green-800">Lesson image uploaded</span>}</label>
              <section className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">Learning resources</h3><p className="text-xs text-slate-500">Links to references or downloadable materials.</p></div><button type="button" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" onClick={() => update({ resources: [...(lesson.resources || []), { title: '', url: '' }] })}><Plus size={14}/>Add link</button></div>{(lesson.resources || []).map((resource, resourceIndex) => <div key={resourceIndex} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"><input className="input min-h-9" maxLength={180} value={resource.title} onChange={(event) => { const resources = [...lesson.resources]; resources[resourceIndex] = { ...resource, title: event.target.value }; update({ resources }); }} placeholder="Resource title"/><input className="input min-h-9" type="url" maxLength={2000} value={resource.url} onChange={(event) => { const resources = [...lesson.resources]; resources[resourceIndex] = { ...resource, url: event.target.value }; update({ resources }); }} placeholder="https://…"/><button type="button" className="btn-secondary min-h-9 px-2 text-red-700" aria-label="Remove resource" onClick={() => update({ resources: lesson.resources.filter((_, index) => index !== resourceIndex) })}><Trash2 size={14}/></button></div>)}</section>
              <section className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold text-slate-800"><Code2 size={16}/>Code examples</div><button type="button" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" onClick={() => update({ codeBlocks: [...(lesson.codeBlocks || []), { language: '', source: '', explanation: '' }] })}><Plus size={14}/>Add code</button></div>{(lesson.codeBlocks || []).map((block, blockIndex) => <div key={blockIndex} className="mt-3 rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><input className="input min-h-9 max-w-56 bg-white" value={block.language || ''} onChange={(event) => { const codeBlocks = [...lesson.codeBlocks]; codeBlocks[blockIndex] = { ...block, language: event.target.value }; update({ codeBlocks }); }} placeholder="Language"/><button type="button" className="btn-ghost text-red-700" onClick={() => update({ codeBlocks: lesson.codeBlocks.filter((_, index) => index !== blockIndex) })} aria-label="Remove code example"><Trash2 size={14}/></button></div><textarea className="input mt-2 min-h-36 bg-white font-mono text-xs" value={block.source} onChange={(event) => { const codeBlocks = [...lesson.codeBlocks]; codeBlocks[blockIndex] = { ...block, source: event.target.value }; update({ codeBlocks }); }} placeholder="Paste a code example"/><textarea className="input mt-2 min-h-16 bg-white" value={block.explanation || ''} onChange={(event) => { const codeBlocks = [...lesson.codeBlocks]; codeBlocks[blockIndex] = { ...block, explanation: event.target.value }; update({ codeBlocks }); }} placeholder="Explain this example"/></div>)}</section>
              <div className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-800">Intermediate assessment</p><p className="text-xs text-slate-500">Optional; choose 5 or 10 questions with four choices each.</p></div>{!lesson.questions?.length && <div className="flex gap-2">{[5, 10].map((count) => <button key={count} className="btn-secondary min-h-8 px-2.5 py-1 text-xs" onClick={() => update({ questions: Array.from({ length: count }, () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0, explanation: '' })) })}>Add {count} questions</button>)}</div>}</div>
                {lesson.questions?.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="label">Passing percentage</span><input type="number" min="1" max="100" className="input" value={lesson.passMark || 70} onChange={(event) => update({ passMark: Number(event.target.value) })}/></label><label><span className="label">Attempt limit</span><input type="number" min="1" max="10" className="input" value={lesson.assessmentAttempts || 3} onChange={(event) => update({ assessmentAttempts: Number(event.target.value) })}/></label></div>}
                {(lesson.questions || []).map((question, questionIndex) => <div key={questionIndex} className="mt-3 rounded-lg bg-slate-50 p-3"><label className="block text-xs font-semibold text-slate-700">Question {questionIndex + 1}<input className="input mt-1 bg-white" value={question.prompt} onChange={(event) => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, prompt: event.target.value }; update({ questions }); }} /></label><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-w-0 items-center gap-2 text-xs"><input type="radio" checked={question.correctOption === optionIndex} onChange={() => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, correctOption: optionIndex }; update({ questions }); }} aria-label={`Correct answer option ${optionIndex + 1}`} /><input className="input min-h-9 bg-white" value={option} onChange={(event) => { const questions = [...lesson.questions]; const options = [...question.options]; options[optionIndex] = event.target.value; questions[questionIndex] = { ...question, options }; update({ questions }); }} placeholder={`Option ${optionIndex + 1}`} /></label>)}</div><input className="input mt-2 bg-white" value={question.explanation || ''} onChange={(event) => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, explanation: event.target.value }; update({ questions }); }} placeholder="Explanation after assessment" /></div>)}
              </div>
              <div className="flex justify-end"><button onClick={() => { updateAdminModule(moduleIndex, (item) => ({ ...item, lessons: item.lessons.filter((entry) => entry.id !== current.id) })); setSelectedId(''); }} className="btn-secondary text-red-700"><Trash2 size={15} />Delete lesson</button></div>
            </>; })()}
          </div>)}</div> : <div className="grid min-h-64 place-items-center text-center"><div><BookOpen className="mx-auto text-green-700" /><p className="mt-2 font-semibold text-slate-800">Choose a lesson to edit</p><p className="mt-1 text-sm text-slate-500">Add a module, then create lessons and their learning content.</p></div></div>}
      </main>
    </div> : <div className="space-y-3">
      {outlineOpen && <button type="button" aria-label="Close course outline" onClick={() => setOutlineOpen(false)} className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" />}
      <div className={`grid gap-4 ${outlineOpen ? 'lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
      {outlineOpen && <aside className="fixed inset-y-0 left-0 z-[60] w-[min(20rem,85vw)] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl lg:sticky lg:top-20 lg:z-auto lg:h-fit lg:max-h-[calc(100dvh-6rem)] lg:w-auto lg:self-start lg:rounded-2xl lg:border lg:shadow-none" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Course outline</h2><div className="flex items-center gap-2"><span className="text-xs text-slate-500">{data.progress.completedLessons}/{data.progress.totalLessons}</span><button type="button" onClick={() => setOutlineOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close course outline"><X size={18}/></button></div></div>
        <div className="mt-3"><ProgressBar value={data.progress.percent} /></div>
        <div className="mt-4 space-y-4">{data.modules.map((module) => <section key={module.id}><h3 className="break-words text-xs font-bold uppercase tracking-wide text-slate-500">{module.title}</h3><div className="mt-1 space-y-1">{module.lessons.map((lesson) => <button key={lesson.id} onClick={() => { if (lesson.unlocked) selectLesson(lesson.id); }} disabled={!lesson.unlocked} className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${selectedId === lesson.id ? 'bg-green-50 font-semibold text-green-900' : lesson.unlocked ? 'text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-400'}`}><span className="min-w-0 flex-1 break-words">{lesson.title}</span>{lesson.completed ? <Check size={14} className="shrink-0 text-green-700" /> : !lesson.unlocked ? <LockKeyhole size={13} className="shrink-0" aria-label="Locked" /> : null}</button>)}</div></section>)}</div>
      </aside>}
      <main ref={contentRef} className={`min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-7 ${contentFullscreen ? 'fixed inset-0 z-40 h-[100dvh] max-w-none overflow-y-auto rounded-none border-0 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]' : ''}`}>
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <button type="button" onClick={() => setOutlineOpen((open) => !open)} aria-expanded={outlineOpen} className="btn-ghost min-h-9 px-2.5 text-xs"><PanelLeft size={16}/>{outlineOpen ? 'Hide outline' : 'Show outline'}</button>
          <button type="button" onClick={toggleContentFullscreen} disabled={assessmentStarted && current?.hasAssessment} className="btn-ghost min-h-9 px-2.5 text-xs" aria-label={contentFullscreen ? 'Exit full-screen lesson' : 'View lesson full screen'}>
            {contentFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span className="hidden sm:inline">{contentFullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>
        {current ? current.unlocked ? <article className="mx-auto min-w-0 max-w-5xl"><p className="eyebrow">{current.moduleTitle}</p><h2 className="mt-1 break-words text-2xl font-bold text-slate-950">{current.title}</h2><LessonContent content={current.content || 'This lesson does not have written content yet.'}/>
          {current.imageUrl && <img src={current.imageUrl} alt={`${current.title} lesson illustration`} loading="lazy" className="mt-5 max-h-[560px] w-full rounded-xl border border-slate-200 object-contain" />}
          {current.videoUrl && <div className="mt-5 aspect-video overflow-hidden rounded-xl bg-slate-950">{(() => { let embed = ''; try { const url = new URL(current.videoUrl); if (['youtube.com', 'www.youtube.com'].includes(url.hostname)) { const videoId = url.searchParams.get('v'); if (videoId) embed = `https://www.youtube-nocookie.com/embed/${videoId}`; } else if (url.hostname === 'youtu.be') embed = `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`; else if (['instagram.com', 'www.instagram.com'].includes(url.hostname)) { const match = url.pathname.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/); if (match) embed = `https://www.instagram.com/p/${match[1]}/embed`; } } catch {} return embed ? <iframe title={`${current.title} video`} src={embed} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <a className="grid h-full place-items-center text-sm text-white underline" href={current.videoUrl} target="_blank" rel="noreferrer">Open lesson video</a>; })()}</div>}
          {(current.codeBlocks?.length ? current.codeBlocks : current.code?.source ? [current.code] : []).map((block, index) => <MacCodeBlock key={`${block.language}-${index}`} block={block} copy={copyCode}/>)}
          {current.resources?.length > 0 && <section className="mt-5"><h3 className="font-semibold text-slate-900">Lesson resources</h3><ul className="mt-2 space-y-1">{current.resources.map((resource, index) => <li key={index}><a href={resource.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-green-800 underline">{resource.title || resource.url}</a></li>)}</ul></section>}
          {current.hasAssessment && <section className="relative mt-6 overflow-hidden rounded-xl border border-slate-200 p-4 select-none"><span className="pointer-events-none absolute right-3 top-3 z-10 rotate-[-12deg] text-[10px] font-semibold text-slate-500/20">{user?.name} · {user?.id}</span><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-green-800"/><h3 className="font-bold text-slate-900">Knowledge check</h3></div><p className="mt-1 text-xs text-slate-500">{current.questions.length} questions · pass score {current.passMark}% · {current.attemptsUsed}/{current.assessmentAttempts} attempts used</p>{assessmentWarning && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">{assessmentWarning}</p>}{!assessmentStarted && !current.completed && current.attemptsUsed < current.assessmentAttempts && <div className="mt-4 rounded-lg bg-green-50 p-3"><p className="text-sm text-green-950">This assessment records tab changes, focus loss, and fullscreen exits. These browser checks are deterrents and cannot block screenshots taken outside the browser.</p><button onClick={beginAssessment} className="btn-primary mt-3">Start assessment</button></div>}{!current.completed && current.attemptsUsed >= current.assessmentAttempts && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No attempts remain. Contact your administrator.</p>}{(assessmentStarted || result || current.completed) && current.questions.map((question, questionIndex) => <fieldset key={questionIndex} className="mt-4"><legend className="text-sm font-semibold text-slate-800">{questionIndex + 1}. {question.prompt}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${answers[questionIndex] === optionIndex ? 'border-green-700 bg-green-50' : 'border-slate-200'}`}><input type="radio" name={`q-${questionIndex}`} checked={answers[questionIndex] === optionIndex} onChange={() => setAnswers({ ...answers, [questionIndex]: optionIndex })}/><span>{option}</span></label>)}</div>{result && <p className={`mt-2 text-xs ${result.explanations[questionIndex].correct ? 'text-green-800' : 'text-amber-800'}`}>{result.explanations[questionIndex].correct ? 'Correct.' : `Correct answer: ${question.options[result.explanations[questionIndex].correctOption]}.`} {result.explanations[questionIndex].explanation}</p>}</fieldset>)}{result && <p className={`mt-4 rounded-lg p-3 text-sm font-semibold ${result.passed ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>{result.score}% — {result.passed ? 'Passed' : 'Not passed yet'}. {result.attempt}/{result.attemptLimit} attempts used.</p>}{assessmentStarted && <button onClick={submitAssessment} disabled={busy || (current.completed && result?.passed)} className="btn-primary mt-4">{busy ? <Spinner size={16} /> : <ClipboardCheck size={16} />}{current.completed ? 'Assessment passed' : 'Submit assessment'}</button>}</section>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {lessonIndex > 0 ? <button onClick={() => selectLesson(lessons[lessonIndex - 1].id)} className="btn-secondary"><ChevronLeft size={16}/>Previous</button> : <span/>}
            {lessonIndex + 1 < lessons.length ? <button onClick={goToNextLesson} disabled={busy || (!lessons[lessonIndex + 1].unlocked && (current.hasAssessment || current.completed))} className="btn-primary">
              {busy ? <Spinner size={16}/> : lessons[lessonIndex + 1].unlocked ? <ChevronRight size={16}/> : current.hasAssessment ? <LockKeyhole size={16}/> : <Check size={16}/>}
              {lessons[lessonIndex + 1].unlocked ? 'Next lesson' : current.hasAssessment && !current.completed ? 'Pass assessment to continue' : current.completed ? 'Next lesson unavailable' : 'Complete & next'}
            </button> : !current.completed && !current.hasAssessment ? <button onClick={markComplete} disabled={busy} className="btn-primary">{busy ? <Spinner size={16} /> : <Check size={16} />}Mark complete</button> : null}
          </div>
        </article> : <section role="status" className="mx-auto grid min-h-72 max-w-xl place-items-center rounded-xl bg-slate-50 p-6 text-center"><div><LockKeyhole className="mx-auto text-slate-400"/><h2 className="mt-3 font-semibold text-slate-900">This lesson is locked</h2><p className="mt-1 text-sm leading-6 text-slate-600">{current.unlockAt && new Date(current.unlockAt) > new Date() ? <>Unlocks {formatUnlockTime(current.unlockAt, course.timezone)}.</> : current.availableAt && new Date(current.availableAt) > new Date() ? <>Available {new Date(current.availableAt).toLocaleString()}.</> : data.lessonAccessMode === 'daily' ? 'Complete the previous day to unlock this one.' : 'Complete the previous lesson to unlock this one.'}</p></div></section> : <div className="grid min-h-72 place-items-center text-center"><div><BookOpen className="mx-auto text-green-700"/><p className="mt-2 font-semibold text-slate-800">No lessons available yet</p><p className="mt-1 text-sm text-slate-500">Your instructor will add the course content here.</p></div></div>}
      </main>
      </div>
    </div>}
  </div>;
}
