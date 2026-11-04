import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, GraduationCap, UserRoundPlus } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

function imageSrc(url) {
  if (!url) return '';
  const origin = new URL(api.defaults.baseURL || '/', window.location.origin).origin;
  return `${origin}${url}`;
}

export default function PublicTrainingRegistrationPage() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({ name: '', email: '', whatsapp: '', answers: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/registrations/public/${slug}`)
      .then((response) => { if (active) setForm(response.data.data.form); })
      .catch((requestError) => { if (active) setError(apiError(requestError).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/registrations/public/${slug}`, values);
      setSubmitted(true);
    } catch (requestError) { setError(apiError(requestError).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Spinner size={28} /></div>;
  if (!form) return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4"><div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center"><h1 className="text-lg font-semibold text-slate-900">Form unavailable</h1><p className="mt-2 text-sm text-slate-500">{error || 'This registration link may have expired.'}</p></div></div>;

  return <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
    <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {form.imageUrl && <img src={imageSrc(form.imageUrl)} alt="" className="h-52 w-full object-cover" />}
      <div className="p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-brand-700"><GraduationCap size={19} />QuickLink training registration</div>
        <h1 className="text-2xl font-bold text-slate-900">{form.title}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{form.training}{form.subject ? ` · ${form.subject}` : ''}</p>
        {form.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{form.description}</p>}

        {submitted ? <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2 size={24} className="text-emerald-600" />
          <h2 className="mt-2 font-semibold text-emerald-900">Registration received</h2>
          <p className="mt-1 text-sm leading-6 text-emerald-800">Thank you, {values.name}. The training administrator has received your details. This registration does not create a QuickLink student account.</p>
        </div> : <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <div><label className="label" htmlFor="registration-name">Full name</label><input id="registration-name" autoComplete="name" className="input" required maxLength={120} minLength={2} placeholder={form.placeholders.name} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></div>
          <div><label className="label" htmlFor="registration-email">Email address</label><input id="registration-email" autoComplete="email" type="email" className="input" required maxLength={254} placeholder={form.placeholders.email} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></div>
          <div><label className="label" htmlFor="registration-whatsapp">WhatsApp number</label><input id="registration-whatsapp" autoComplete="tel" type="tel" className="input" required minLength={7} maxLength={40} placeholder={form.placeholders.whatsapp} value={values.whatsapp} onChange={(event) => setValues({ ...values, whatsapp: event.target.value })} /><p className="mt-1 text-xs text-slate-400">Include the country calling code so the administrator can contact you.</p></div>
          {form.fields.map((field) => <div key={field.key}><label className="label" htmlFor={field.key}>{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label><input id={field.key} className="input" required={field.required} maxLength={2000} placeholder={field.placeholder} value={values.answers[field.key] || ''} onChange={(event) => setValues({ ...values, answers: { ...values.answers, [field.key]: event.target.value } })} /></div>)}
          <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">Your details will be shared with the training administrator to follow up about this training.</p>
          <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <Spinner size={17} /> : <UserRoundPlus size={17} />}{saving ? 'Submitting…' : 'Register for training'}</button>
        </form>}
      </div>
    </section>
  </main>;
}
