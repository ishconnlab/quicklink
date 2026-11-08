import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardCheck, Code2, Copy, Plus, Save, Trash2 } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, ProgressBar } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const newLesson = (title = 'New lesson') => ({ title, content: '', videoUrl: '', resources: [], code: { language: '', source: '' }, knowledgeCheck: [], passMark: 70 });
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
  return <div className="mt-5 max-w-none space-y-4 text-sm text-slate-700">{blocks}</div>;
}

export default function CourseLearningPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [api.get(`/courses/${id}/learning`), api.get(`/courses/${id}`)];
      if (admin) requests.push(api.get(`/courses/${id}/learning/analytics`));
      const [learningResponse, courseResponse, analyticsResponse] = await Promise.all(requests);
      const next = learningResponse.data.data;
      setData(next);
      setCourse(courseResponse.data.data.course);
      if (analyticsResponse) setAnalytics(analyticsResponse.data.data);
      const lessons = next.modules.flatMap((module) => module.lessons);
      setSelectedId((current) => lessons.some((lesson) => lesson.id === current) ? current : next.progress.currentLesson || lessons.find((lesson) => lesson.unlocked)?.id || lessons[0]?.id || '');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [admin, id, toast]);
  useEffect(() => { load(); }, [load]);

  const lessons = useMemo(() => data?.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))) || [], [data]);
  const current = lessons.find((lesson) => lesson.id === selectedId) || null;
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === selectedId);
  const selectLesson = (lessonId) => { setSelectedId(lessonId); setResult(null); setAnswers({}); setAssessmentStarted(false); setAssessmentWarning(''); };

  const recordEvent = useCallback(async (type) => {
    if (!current?.id || admin) return;
    try { await api.post(`/courses/${id}/learning/lessons/${current.id}/events`, { type }); } catch { /* retain the assessment flow if event logging is temporarily unavailable */ }
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
      const modules = data.modules.map((module) => ({ ...( /^[0-9a-f]{24}$/i.test(module.id || '') ? { _id: module.id } : {}), title: module.title, lessons: module.lessons.map((lesson) => ({ ...( /^[0-9a-f]{24}$/i.test(lesson.id || '') ? { _id: lesson.id } : {}), title: lesson.title, content: lesson.content, videoUrl: lesson.videoUrl, imageUrl: lesson.imageUrl || '', imagePublicId: lesson.imagePublicId || '', resources: lesson.resources || [], code: lesson.code || {}, knowledgeCheck: lesson.questions || [], passMark: Number(lesson.passMark || 70), assessmentAttempts: Number(lesson.assessmentAttempts || 3) })) }));
      await api.patch(`/classes/${id}`, { modules });
      toast.success('Course lessons saved.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const markComplete = async () => {
    setBusy(true);
    try { await api.put(`/courses/${id}/learning/lessons/${current.id}/complete`); toast.success('Lesson marked complete.'); await load(); }
    catch (error) { toast.error(apiError(error).message); }
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
      const response = await api.post(`/courses/${id}/learning/lessons/${current.id}/assessment`, { answers: current.questions.map((_, index) => ({ optionIndex: Number(answers[index]) })) });
      setResult(response.data.data.result);
      toast.success(response.data.data.result.passed ? 'Assessment passed.' : 'Assessment submitted. Review the answers and try again.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusy(false); }
  };
  const copyCode = async () => { try { await navigator.clipboard.writeText(current?.code?.source || ''); toast.success('Code copied.'); } catch { toast.error('Could not copy code.'); } };
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
    <PageHeader eyebrow={admin ? 'Course builder' : 'Learning'} title={course.title} description={admin ? 'Organize course modules and lesson content.' : 'Continue where you left off and work through each lesson in order.'} />
    {admin ? <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="h-fit space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Modules</h2><button onClick={() => setData({ ...data, modules: [...data.modules, { ...newModule(), id: `new-module-${Date.now()}` }] })} className="btn-secondary min-h-8 px-2.5 py-1 text-xs"><Plus size={14} />Module</button></div>
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
              <label className="block"><span className="label">YouTube or Instagram URL (optional)</span><input type="url" className="input" value={lesson.videoUrl || ''} onChange={(event) => update({ videoUrl: event.target.value })} placeholder="Video or reel URL" /></label>
              <label className="block"><span className="label">Lesson image</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !/^[0-9a-f]{24}$/i.test(module.id || '') || !/^[0-9a-f]{24}$/i.test(lesson.id || '')} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadLessonImage(file, update); }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold" />{lesson.imageUrl && <span className="mt-1 block text-xs text-green-800">Lesson image uploaded</span>}</label>
              <section className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">Learning resources</h3><p className="text-xs text-slate-500">Links to references or downloadable materials.</p></div><button type="button" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" onClick={() => update({ resources: [...(lesson.resources || []), { title: '', url: '' }] })}><Plus size={14}/>Add link</button></div>{(lesson.resources || []).map((resource, resourceIndex) => <div key={resourceIndex} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"><input className="input min-h-9" maxLength={180} value={resource.title} onChange={(event) => { const resources = [...lesson.resources]; resources[resourceIndex] = { ...resource, title: event.target.value }; update({ resources }); }} placeholder="Resource title"/><input className="input min-h-9" type="url" maxLength={2000} value={resource.url} onChange={(event) => { const resources = [...lesson.resources]; resources[resourceIndex] = { ...resource, url: event.target.value }; update({ resources }); }} placeholder="https://…"/><button type="button" className="btn-secondary min-h-9 px-2 text-red-700" aria-label="Remove resource" onClick={() => update({ resources: lesson.resources.filter((_, index) => index !== resourceIndex) })}><Trash2 size={14}/></button></div>)}</section>
              <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2 font-semibold text-slate-800"><Code2 size={16} />Code example</div><div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]"><input className="input" value={lesson.code?.language || ''} onChange={(event) => update({ code: { ...lesson.code, language: event.target.value } })} placeholder="Language" /><textarea className="input min-h-36 font-mono text-xs" value={lesson.code?.source || ''} onChange={(event) => update({ code: { ...lesson.code, source: event.target.value } })} placeholder="Paste code example" /></div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-800">Intermediate assessment</p><p className="text-xs text-slate-500">Optional; exactly 10 questions with four choices each.</p></div>{!lesson.questions?.length && <button className="btn-secondary min-h-8 px-2.5 py-1 text-xs" onClick={() => update({ questions: Array.from({ length: 10 }, () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0, explanation: '' })) })}>Add 10 questions</button>}</div>
                {lesson.questions?.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="label">Passing percentage</span><input type="number" min="1" max="100" className="input" value={lesson.passMark || 70} onChange={(event) => update({ passMark: Number(event.target.value) })}/></label><label><span className="label">Attempt limit</span><input type="number" min="1" max="10" className="input" value={lesson.assessmentAttempts || 3} onChange={(event) => update({ assessmentAttempts: Number(event.target.value) })}/></label></div>}
                {(lesson.questions || []).map((question, questionIndex) => <div key={questionIndex} className="mt-3 rounded-lg bg-slate-50 p-3"><label className="block text-xs font-semibold text-slate-700">Question {questionIndex + 1}<input className="input mt-1 bg-white" value={question.prompt} onChange={(event) => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, prompt: event.target.value }; update({ questions }); }} /></label><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-w-0 items-center gap-2 text-xs"><input type="radio" checked={question.correctOption === optionIndex} onChange={() => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, correctOption: optionIndex }; update({ questions }); }} aria-label={`Correct answer option ${optionIndex + 1}`} /><input className="input min-h-9 bg-white" value={option} onChange={(event) => { const questions = [...lesson.questions]; const options = [...question.options]; options[optionIndex] = event.target.value; questions[questionIndex] = { ...question, options }; update({ questions }); }} placeholder={`Option ${optionIndex + 1}`} /></label>)}</div><input className="input mt-2 bg-white" value={question.explanation || ''} onChange={(event) => { const questions = [...lesson.questions]; questions[questionIndex] = { ...question, explanation: event.target.value }; update({ questions }); }} placeholder="Explanation after assessment" /></div>)}
              </div>
              <div className="flex justify-end"><button onClick={() => { updateAdminModule(moduleIndex, (item) => ({ ...item, lessons: item.lessons.filter((entry) => entry.id !== current.id) })); setSelectedId(''); }} className="btn-secondary text-red-700"><Trash2 size={15} />Delete lesson</button></div>
            </>; })()}
          </div>)}</div> : <div className="grid min-h-64 place-items-center text-center"><div><BookOpen className="mx-auto text-green-700" /><p className="mt-2 font-semibold text-slate-800">Choose a lesson to edit</p><p className="mt-1 text-sm text-slate-500">Add a module, then create lessons and their learning content.</p></div></div>}
      </main>
    </div> : <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-900">Course outline</h2><span className="text-xs text-slate-500">{data.progress.completedLessons}/{data.progress.totalLessons}</span></div><div className="mt-3"><ProgressBar value={data.progress.percent} /></div><div className="mt-4 space-y-4">{data.modules.map((module) => <section key={module.id}><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{module.title}</h3><div className="mt-1 space-y-1">{module.lessons.map((lesson) => <button key={lesson.id} onClick={() => { if (lesson.unlocked) selectLesson(lesson.id); }} disabled={!lesson.unlocked} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${selectedId === lesson.id ? 'bg-green-50 font-semibold text-green-900' : lesson.unlocked ? 'text-slate-700 hover:bg-slate-50' : 'cursor-not-allowed text-slate-400'}`}><span className="min-w-0 flex-1 truncate">{lesson.title}</span>{lesson.completed && <Check size={14} className="shrink-0 text-green-700" />}</button>)}</div></section>)}</div></aside>
      <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-7">
        {current ? <article className="mx-auto max-w-4xl"><p className="eyebrow">{current.moduleTitle}</p><h2 className="mt-1 break-words text-2xl font-bold text-slate-950">{current.title}</h2><LessonContent content={current.content || 'This lesson does not have written content yet.'}/>
          {current.imageUrl && <img src={current.imageUrl} alt={`${current.title} lesson illustration`} loading="lazy" className="mt-5 max-h-[560px] w-full rounded-xl border border-slate-200 object-contain" />}
          {current.videoUrl && <div className="mt-5 aspect-video overflow-hidden rounded-xl bg-slate-950">{(() => { let embed = ''; try { const url = new URL(current.videoUrl); if (['youtube.com', 'www.youtube.com'].includes(url.hostname)) { const videoId = url.searchParams.get('v'); if (videoId) embed = `https://www.youtube-nocookie.com/embed/${videoId}`; } else if (url.hostname === 'youtu.be') embed = `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`; else if (['instagram.com', 'www.instagram.com'].includes(url.hostname)) { const match = url.pathname.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/); if (match) embed = `https://www.instagram.com/p/${match[1]}/embed`; } } catch {} return embed ? <iframe title={`${current.title} video`} src={embed} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <a className="grid h-full place-items-center text-sm text-white underline" href={current.videoUrl} target="_blank" rel="noreferrer">Open lesson video</a>; })()}</div>}
          {current.code?.source && <section className="mt-6 overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="flex items-center gap-2"><span className="flex gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-400"/><i className="h-2.5 w-2.5 rounded-full bg-yellow-400"/><i className="h-2.5 w-2.5 rounded-full bg-green-500"/></span><span className="text-xs font-medium text-slate-600">{current.code.language || 'Code'}</span></div><button onClick={copyCode} className="btn-secondary min-h-7 px-2 py-1 text-xs"><Copy size={13} />Copy</button></div><pre className="max-h-[480px] overflow-auto p-4 text-xs leading-6 text-slate-800"><code>{current.code.source}</code></pre></section>}
          {current.resources?.length > 0 && <section className="mt-5"><h3 className="font-semibold text-slate-900">Lesson resources</h3><ul className="mt-2 space-y-1">{current.resources.map((resource, index) => <li key={index}><a href={resource.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-green-800 underline">{resource.title || resource.url}</a></li>)}</ul></section>}
          {current.hasAssessment && <section className="relative mt-6 overflow-hidden rounded-xl border border-slate-200 p-4 select-none"><span className="pointer-events-none absolute right-3 top-3 z-10 rotate-[-12deg] text-[10px] font-semibold text-slate-500/20">{user?.name} · {user?.id}</span><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-green-800"/><h3 className="font-bold text-slate-900">Knowledge check</h3></div><p className="mt-1 text-xs text-slate-500">10 questions · pass score {current.passMark}% · {current.attemptsUsed}/{current.assessmentAttempts} attempts used</p>{assessmentWarning && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">{assessmentWarning}</p>}{!assessmentStarted && !current.completed && current.attemptsUsed < current.assessmentAttempts && <div className="mt-4 rounded-lg bg-green-50 p-3"><p className="text-sm text-green-950">This assessment records tab changes, focus loss, and fullscreen exits. These browser checks are deterrents and cannot block screenshots taken outside the browser.</p><button onClick={beginAssessment} className="btn-primary mt-3">Start assessment</button></div>}{!current.completed && current.attemptsUsed >= current.assessmentAttempts && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No attempts remain. Contact your administrator.</p>}{(assessmentStarted || result || current.completed) && current.questions.map((question, questionIndex) => <fieldset key={questionIndex} className="mt-4"><legend className="text-sm font-semibold text-slate-800">{questionIndex + 1}. {question.prompt}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${answers[questionIndex] === optionIndex ? 'border-green-700 bg-green-50' : 'border-slate-200'}`}><input type="radio" name={`q-${questionIndex}`} checked={answers[questionIndex] === optionIndex} onChange={() => setAnswers({ ...answers, [questionIndex]: optionIndex })}/><span>{option}</span></label>)}</div>{result && <p className={`mt-2 text-xs ${result.explanations[questionIndex].correct ? 'text-green-800' : 'text-amber-800'}`}>{result.explanations[questionIndex].correct ? 'Correct.' : `Correct answer: ${question.options[result.explanations[questionIndex].correctOption]}.`} {result.explanations[questionIndex].explanation}</p>}</fieldset>)}{result && <p className={`mt-4 rounded-lg p-3 text-sm font-semibold ${result.passed ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>{result.score}% — {result.passed ? 'Passed' : 'Not passed yet'}. {result.attempt}/{result.attemptLimit} attempts used.</p>}{assessmentStarted && <button onClick={submitAssessment} disabled={busy || (current.completed && result?.passed)} className="btn-primary mt-4">{busy ? <Spinner size={16} /> : <ClipboardCheck size={16} />}{current.completed ? 'Assessment passed' : 'Submit assessment'}</button>}</section>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">{lessonIndex > 0 ? <button onClick={() => selectLesson(lessons[lessonIndex - 1].id)} className="btn-secondary"><ChevronLeft size={16}/>Previous</button> : <span/>}{!current.completed && !current.hasAssessment && <button onClick={markComplete} disabled={busy} className="btn-primary">{busy ? <Spinner size={16} /> : <Check size={16} />}Mark complete</button>}{lessonIndex + 1 < lessons.length && current.completed && <button onClick={() => selectLesson(lessons[lessonIndex + 1].id)} className="btn-secondary">Next lesson<ChevronRight size={16}/></button>}</div>
        </article> : <div className="grid min-h-72 place-items-center text-center"><div><BookOpen className="mx-auto text-green-700"/><p className="mt-2 font-semibold text-slate-800">No lessons available yet</p><p className="mt-1 text-sm text-slate-500">Your instructor will add the course content here.</p></div></div>}
      </main>
    </div>}
  </div>;
}
