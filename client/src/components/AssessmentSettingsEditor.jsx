import { useEffect, useState } from 'react';
import { CheckCircle2, ListChecks, LockKeyhole, Save } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Modal } from './layout.jsx';
import { Spinner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const emptyQuestion = () => ({ prompt: '', options: ['', '', '', ''], correctOption: 0 });
const emptyQuestions = (count = 10) => Array.from({ length: count }, emptyQuestion);

export default function AssessmentSettingsEditor({ courseId, open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ enabled: false, questions: emptyQuestions(), attempts: 3, passMark: 80, lockdown: true, timeLimitMinutes: 0, certificatePayment: { enabled: false, amount: 0, currency: 'RWF', paymentCode: '', paymentName: '', instructions: '' } });
  const [attemptsStarted, setAttemptsStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get(`/courses/${courseId}/certification-assessment/settings`).then((response) => {
      const data = response.data.data;
      setForm({
        enabled: Boolean(data.enabled),
        questions: data.questions?.length ? data.questions.map((question) => ({ prompt: question.prompt, options: [...question.options], correctOption: question.correctOption })) : emptyQuestions(),
        attempts: data.attempts ?? 3,
        passMark: data.passMark ?? 80,
        lockdown: data.lockdown !== false,
        timeLimitMinutes: data.timeLimitMinutes ?? 0,
        certificatePayment: { enabled: false, amount: 0, currency: 'RWF', paymentCode: '', paymentName: '', instructions: '', ...(data.certificatePayment || {}) },
      });
      setAttemptsStarted(Boolean(data.attemptsStarted));
    }).catch((error) => toast.error(apiError(error).message)).finally(() => setLoading(false));
  }, [courseId, open, toast]);

  const updateQuestion = (index, patch) => setForm((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) }));
  const updateOption = (index, optionIndex, value) => setForm((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, options: question.options.map((option, currentOption) => currentOption === optionIndex ? value : option) } : question) }));
  const setQuestionCount = (count) => setForm((current) => ({ ...current, questions: Array.from({ length: count }, (_, index) => current.questions[index] || emptyQuestion()) }));

  const save = async () => {
    if (form.enabled) {
      const complete = form.questions.every((question) => question.prompt.trim() && question.options.every((option) => option.trim()));
      if (!complete) { toast.error('Complete every question and all four options before enabling the assessment.'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        enabled: form.enabled,
        questions: form.enabled || attemptsStarted ? form.questions : [],
        attempts: Number(form.attempts),
        passMark: Number(form.passMark),
        lockdown: Boolean(form.lockdown),
        timeLimitMinutes: Number(form.timeLimitMinutes || 0),
        certificatePayment: { ...form.certificatePayment, amount: Number(form.certificatePayment.amount || 0) },
      };
      const response = await api.put(`/courses/${courseId}/certification-assessment/settings`, payload);
      toast.success('Assessment settings saved.');
      onSaved?.(response.data.data);
      onClose();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  return <Modal open={open} onClose={() => !saving && onClose()} title="Certification assessment setup" size="reader" footer={<><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving || loading}>{saving ? <Spinner size={16} /> : <Save size={16} />}{saving ? 'Saving…' : 'Save assessment'}</button></>}>
    {loading ? <div className="flex items-center justify-center py-16 text-slate-500"><Spinner size={24} /></div> : <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-green-100 bg-green-50/60 p-4 sm:grid-cols-3">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-green-100 sm:col-span-3"><span><span className="block text-sm font-semibold text-slate-800">Enable certification assessment</span><span className="mt-0.5 block text-xs text-slate-500">Choose 1–100 questions with four options each. Questions are locked after the first student attempt.</span></span><input type="checkbox" disabled={attemptsStarted} checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-5 w-5 accent-green-600" /></label>
        <label><span className="label">Number of questions</span><input disabled={attemptsStarted} type="number" min="1" max="100" className="input" value={form.questions.length} onChange={(event) => setQuestionCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />{attemptsStarted && <span className="mt-1 block text-[11px] text-slate-400">Locked after the first attempt.</span>}</label>
        <label><span className="label">Pass mark (%)</span><input type="number" min="1" max="100" className="input" value={form.passMark} onChange={(event) => setForm({ ...form, passMark: event.target.value })} /></label>
        <label><span className="label">Attempts (initial + retakes)</span><input type="number" min="1" max="10" className="input" value={form.attempts} onChange={(event) => setForm({ ...form, attempts: event.target.value })} /></label>
        <label><span className="label">Time limit in minutes (0 = no timer)</span><input disabled={attemptsStarted} type="number" min="0" max="240" className="input" value={form.timeLimitMinutes} onChange={(event) => setForm({ ...form, timeLimitMinutes: event.target.value })} />{attemptsStarted && <span className="mt-1 block text-[11px] text-slate-400">Locked after the first attempt.</span>}</label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-green-100"><span className="text-sm font-semibold text-slate-700">Lockdown mode</span><input type="checkbox" checked={form.lockdown} onChange={(event) => setForm({ ...form, lockdown: event.target.checked })} className="h-5 w-5 accent-green-600" /></label>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-start justify-between gap-4"><span><span className="block text-sm font-semibold text-slate-900">Certificate payment</span><span className="mt-1 block text-xs leading-5 text-slate-500">Choose free certificates or require payment before PDF download and public verification.</span></span><input type="checkbox" checked={form.certificatePayment.enabled} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, enabled: event.target.checked } })} className="mt-1 h-5 w-5 shrink-0 accent-green-700" /></label>
        {form.certificatePayment.enabled && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="label">Certificate fee</span><input required type="number" min="1" step="1" className="input" value={form.certificatePayment.amount} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, amount: event.target.value } })} /></label><label><span className="label">Currency</span><input required maxLength={12} className="input" value={form.certificatePayment.currency} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, currency: event.target.value } })} /></label><label><span className="label">Payment code</span><input required maxLength={40} className="input" value={form.certificatePayment.paymentCode} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, paymentCode: event.target.value } })} /></label><label><span className="label">Account name</span><input required maxLength={120} className="input" value={form.certificatePayment.paymentName} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, paymentName: event.target.value } })} /></label><label className="sm:col-span-2"><span className="label">Payment instructions</span><textarea maxLength={2000} className="input min-h-20" value={form.certificatePayment.instructions} onChange={(event) => setForm({ ...form, certificatePayment: { ...form.certificatePayment, instructions: event.target.value } })} placeholder="Tell students how to pay and what reference details to submit." /></label></div>}
        {!form.certificatePayment.enabled && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">Certificates for this training will be free.</p>}
      </section>

      {attemptsStarted && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">Students have already attempted this assessment, so questions and the enabled state are locked. You can still change the pass mark, attempts, and lockdown mode.</div>}

      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ListChecks size={16} className="text-brand-700" />10 assessment questions</h3><span className="text-xs text-slate-400">{attemptsStarted ? 'Read-only' : 'Select the correct option for each question'}</span></div>
      <div className="space-y-3">
        {form.questions.map((question, index) => <article key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700">Question {index + 1}</p><label className="flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole size={13} />{attemptsStarted ? 'Locked' : 'Correct answer'}</label></div>
          <textarea disabled={attemptsStarted} className="input min-h-16" maxLength={1200} value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="Type the question prompt" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${question.correctOption === optionIndex ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}><input disabled={attemptsStarted} type="radio" name={`correct-${index}`} checked={question.correctOption === optionIndex} onChange={() => updateQuestion(index, { correctOption: optionIndex })} className="accent-emerald-600" /><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{String.fromCharCode(65 + optionIndex)}</span><input disabled={attemptsStarted} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" maxLength={500} value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`} /></label>)}
          </div>
        </article>)}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-400"><CheckCircle2 size={13} />AI-generated questions are not used — every question is written and approved by your team.</p>
    </div>}
  </Modal>;
}
