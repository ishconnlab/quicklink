import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Maximize2, Play, RefreshCw, ShieldCheck, Target, X } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, ProgressBar } from './layout.jsx';
import { Spinner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';

const answerMap = (answers = []) => Object.fromEntries(answers.map((item) => [item.questionIndex, item.optionIndex]));

export default function CertificationAssessment({ courseId, initial, onRefresh }) {
  const toast = useToast();
  const dialog = useDialog();
  const [payload, setPayload] = useState(initial);
  const [taking, setTaking] = useState(false);
  const [questions, setQuestions] = useState(initial?.questions || []);
  const [answers, setAnswers] = useState(() => answerMap(initial?.draft?.answers));
  const [current, setCurrent] = useState(initial?.draft?.currentIndex || 0);
  const [exitCount, setExitCount] = useState(initial?.draft?.fullscreenExitCount || 0);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState('');
  const startedRef = useRef(false);
  const answersRef = useRef(answers);
  const currentRef = useRef(current);
  const exitRef = useRef(exitCount);
  const saveTimer = useRef(null);

  useEffect(() => { setPayload(initial); }, [initial]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { exitRef.current = exitCount; }, [exitCount]);

  const answeredCount = Object.keys(answers).length;
  const progress = questions.length ? Math.round(answeredCount / questions.length * 100) : 0;

  const saveDraft = async () => {
    if (!startedRef.current || !taking) return;
    setSaving(true);
    try {
      await api.put(`/courses/${courseId}/certification-assessment/draft`, {
        answers: Object.entries(answersRef.current).map(([questionIndex, optionIndex]) => ({ questionIndex: Number(questionIndex), optionIndex })),
        currentIndex: currentRef.current,
        fullscreenExitCount: exitRef.current,
      });
    } catch {
      // Silent autosave failure should not interrupt an active assessment.
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!taking) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveDraft, 700);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, current, exitCount, taking]);

  useEffect(() => {
    if (!taking || !payload?.lockdown) return undefined;
    const onChange = () => {
      if (!document.fullscreenElement) {
        setExitCount((value) => value + 1);
        setWarning('You left fullscreen. This was recorded with your assessment attempt. Return to fullscreen to continue.');
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [taking, payload?.lockdown]);

  useEffect(() => () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  const enterFullscreen = async () => {
    if (!payload?.lockdown) return;
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); }
    catch { setWarning('Fullscreen could not be enabled. The browser may require a direct tap.'); }
  };

  const begin = async () => {
    setStarting(true);
    try {
      const response = await api.post(`/courses/${courseId}/certification-assessment/start`);
      const next = response.data.data;
      setPayload(next);
      setQuestions(next.questions || []);
      setAnswers(answerMap(next.draft?.answers));
      setCurrent(next.draft?.currentIndex || 0);
      setExitCount(next.draft?.fullscreenExitCount || 0);
      setResult(null);
      setWarning('');
      startedRef.current = true;
      setTaking(true);
      setTimeout(enterFullscreen, 80);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setStarting(false); }
  };

  const closeAssessment = async () => {
    const leave = await dialog.confirm({ title: 'Leave the assessment?', message: 'Your answers are saved as a draft. You can resume later if attempts remain.', confirmLabel: 'Save and leave', cancelLabel: 'Keep working' });
    if (!leave) return;
    await saveDraft();
    startedRef.current = false;
    setTaking(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onRefresh?.();
  };

  const submit = async () => {
    if (answeredCount < 10) { toast.error(`Answer all 10 questions first. ${10 - answeredCount} remaining.`); return; }
    const approved = await dialog.confirm({ title: 'Submit your assessment?', message: 'Your answers will be graded immediately and this attempt cannot be changed.', confirmLabel: 'Submit now', tone: 'danger' });
    if (!approved) return;
    setSubmitting(true);
    try {
      const response = await api.post(`/courses/${courseId}/certification-assessment`, {
        answers: Object.entries(answers).map(([questionIndex, optionIndex]) => ({ questionIndex: Number(questionIndex), optionIndex })),
      });
      setResult(response.data.data);
      startedRef.current = false;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      onRefresh?.();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSubmitting(false); }
  };

  const finish = () => {
    setTaking(false);
    setResult(null);
    setQuestions([]);
    onRefresh?.();
  };

  const status = useMemo(() => {
    if (payload?.passed) return { tone: 'green', label: 'Passed', text: 'You have passed the certification assessment.' };
    if (!payload?.enabled) return { tone: 'slate', label: 'Not configured', text: 'The administrator has not enabled this assessment.' };
    if (!payload?.configured) return { tone: 'amber', label: 'Setup needed', text: 'The administrator must add all 10 questions.' };
    if (payload?.projectSubmissionRequired && !payload?.projectSubmitted) return { tone: 'amber', label: 'Project first', text: 'Submit your project to unlock the assessment.' };
    if (payload?.attemptsRemaining <= 0) return { tone: 'red', label: 'No attempts left', text: 'Contact the administrator to discuss another attempt.' };
    if (payload?.draft) return { tone: 'brand', label: 'In progress', text: `Draft saved${payload.draft.lastSavedAt ? ` · ${new Date(payload.draft.lastSavedAt).toLocaleString()}` : ''}` };
    return { tone: 'brand', label: 'Ready', text: `${payload?.attemptsRemaining} of ${payload?.maxAttempts} attempts available.` };
  }, [payload]);

  return <>
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Certification assessment</p><h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950"><Target size={18} className="text-brand-700" />10-question final assessment</h2><p className="mt-1 text-sm text-slate-500">Pass mark {payload?.passMark ?? 80}% · {payload?.attemptsUsed ?? 0} of {payload?.maxAttempts ?? 3} attempts used</p></div>
        <Badge color={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-3 text-sm text-slate-600">{status.text}</p>
      {payload?.latestAttempt && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">Latest attempt: <span className="font-bold text-slate-900">{payload.latestAttempt.score}%</span> · {payload.latestAttempt.passed ? 'Passed' : 'Not passed'} · {new Date(payload.latestAttempt.submittedAt).toLocaleString()}</div>}
      {payload?.lockdown && <p className="mt-3 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-5 text-brand-900"><LockKeyhole size={14} className="mt-0.5 shrink-0" />Lockdown mode: fullscreen is requested, leaving fullscreen is recorded, and copying question text is disabled.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" onClick={begin} disabled={starting || !payload?.canStart}>{starting ? <Spinner size={16} /> : payload?.draft ? <RefreshCw size={16} /> : <Play size={16} />}{payload?.draft ? 'Resume assessment' : 'Start assessment'}</button>{payload?.passed && <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />Assessment complete</span>}</div>
      {!payload?.canStart && !payload?.passed && <p className="mt-2 text-xs text-slate-400">{!payload?.enabled ? 'Administrator setup required.' : !payload?.configured ? 'All 10 questions must be configured.' : payload?.projectSubmissionRequired && !payload?.projectSubmitted ? 'Submit the project above to unlock this assessment.' : payload?.attemptsRemaining <= 0 ? 'No attempts remain.' : 'You cannot start this assessment right now.'}</p>}
    </section>

    {taking && <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#fffaf5]" onCopy={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-4">
          <div><p className="eyebrow">Certification assessment</p><p className="mt-0.5 text-sm font-bold text-slate-900">{payload?.title}</p></div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-slate-500 sm:inline-flex">{payload?.lockdown ? <LockKeyhole size={13} /> : <ShieldCheck size={13} />}{payload?.lockdown ? 'Lockdown active' : 'Standard mode'}</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{saving ? <Spinner size={12} /> : <Clock3 size={12} />}{saving ? 'Saving' : 'Saved'}</span>
            <button className="btn-secondary min-h-0 px-3 py-1.5 text-xs" onClick={closeAssessment}><X size={14} />Save & exit</button>
          </div>
        </header>

        {warning && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{warning}</span><button className="font-semibold underline" onClick={enterFullscreen}>Return to fullscreen</button></div>}

        <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[1fr_220px]">
          <main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-3"><Badge color="brand">Question {current + 1} of {questions.length}</Badge><span className="text-xs font-semibold text-slate-500">{answeredCount}/10 answered</span></div>
            <ProgressBar value={progress} />
            <h1 className="mt-6 select-none text-lg font-bold leading-8 text-slate-950 sm:text-xl">{questions[current]?.prompt}</h1>
            <div className="mt-5 space-y-2.5 select-none">
              {(questions[current]?.options || []).map((option, index) => <button key={index} type="button" onClick={() => setAnswers((value) => ({ ...value, [current]: index }))} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition ${answers[current] === index ? 'border-brand-400 bg-orange-50 text-brand-950 ring-2 ring-brand-200' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/40'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${answers[current] === index ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{String.fromCharCode(65 + index)}</span><span className="pt-0.5 leading-6">{option}</span></button>)}
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button className="btn-secondary" disabled={current === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}><ChevronLeft size={16} />Previous</button>
              {current < questions.length - 1 ? <button className="btn-primary" onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}>Next<ChevronRight size={16} /></button> : <button className="btn-primary" disabled={submitting || answeredCount < 10} onClick={submit}>{submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />}{submitting ? 'Submitting…' : 'Submit assessment'}</button>}
            </div>
          </main>
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Questions</p>
            <div className="mt-3 grid grid-cols-5 gap-1.5 lg:grid-cols-4">{questions.map((_, index) => <button key={index} type="button" onClick={() => setCurrent(index)} className={`flex h-9 items-center justify-center rounded-lg text-xs font-bold transition ${index === current ? 'bg-slate-900 text-white' : answers[index] !== undefined ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500 hover:bg-orange-100'}`}>{index + 1}</button>)}</div>
            <div className="mt-4 space-y-1.5 text-xs text-slate-500"><p className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-300" />Answered</p><p className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-slate-200" />Unanswered</p><p className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-slate-900" />Current</p></div>
            <div className="mt-4 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-brand-900"><p className="font-semibold">Attempts</p><p>{payload?.attemptsRemaining} remaining after this attempt.</p></div>
          </aside>
        </div>
      </div>
    </div>}

    {result && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
        <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{result.passed ? <CheckCircle2 size={28} /> : <Target size={28} />}</span>
        <h2 className="mt-4 text-xl font-black text-slate-950">{result.passed ? 'Assessment passed' : 'Attempt complete'}</h2>
        <p className="mt-1 text-sm text-slate-500">Attempt {result.attemptNumber} · Pass mark {result.passMark}%</p>
        <p className="mt-4 text-4xl font-black tracking-tight text-slate-950">{result.score}%</p>
        <p className="mt-1 text-sm text-slate-500">{result.correctCount} of 10 correct · {result.attemptsRemaining} attempt{result.attemptsRemaining === 1 ? '' : 's'} remaining</p>
        {!result.passed && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Review your notes and try again while attempts remain. Your latest score is shown on the training page.</p>}
        <button className="btn-primary mt-5 w-full" onClick={finish}>{result.passed ? 'Continue to certificate' : 'Return to training'}<ArrowRight size={16} /></button>
      </div>
    </div>}
  </>;
}
