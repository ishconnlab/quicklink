import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';

export default function PublicRegistrationPage() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [values, setValues] = useState({ name: '', email: '', whatsapp: '', answers: {} });

  useEffect(() => {
    let active = true;
    api.get(`/registrations/public/${slug}`)
      .then((response) => { if (active) setForm(response.data.data.form); })
      .catch((caught) => { if (active) setError(apiError(caught).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await api.post(`/registrations/public/${slug}`, values);
      setSubmitted(response.data.data.registration);
    } catch (caught) {
      setError(apiError(caught).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader label="Loading application…" />;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="QuickLink application"
        title={submitted ? 'Application received' : form?.title || 'Registration unavailable'}
        subtitle={submitted ? 'Your application is saved with Pending status. An administrator will review it before any course or class assignment.' : form?.description || 'This application opportunity is not currently available.'}
      />

      {submitted ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-700" size={32} />
          <p className="mt-3 text-lg font-bold text-slate-950">{submitted.name}</p>
          <p className="mt-1 text-sm text-slate-600">{submitted.email}</p>
          <p className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">Pending review</p>
          <p className="mt-5 text-sm leading-6 text-slate-600">Submitting this application does not enroll or assign you. Enrollment happens only after administrator approval.</p>
          <Link to="/register" className="btn-primary mt-5">Create student account</Link>
        </section>
      ) : form ? (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Full name</span><input className="input" required minLength={2} maxLength={120} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder={form.placeholders?.name} /></label>
            <label><span className="label">Email address</span><input className="input" type="email" required maxLength={254} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} placeholder={form.placeholders?.email} /></label>
            <label className="sm:col-span-2"><span className="label">Phone / WhatsApp</span><input className="input" required minLength={7} maxLength={40} value={values.whatsapp} onChange={(event) => setValues({ ...values, whatsapp: event.target.value })} placeholder={form.placeholders?.whatsapp} /></label>
          </div>
          {form.fields?.map((field) => (
            <label key={field.key} className="block">
              <span className="label">{field.label}{field.required ? ' *' : ''}</span>
              {field.type === 'textarea' ? (
                <textarea className="input min-h-28" required={field.required} maxLength={2000} value={values.answers[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, answers: { ...current.answers, [field.key]: event.target.value } }))} placeholder={field.placeholder} />
              ) : (
                <input className="input" required={field.required} maxLength={2000} value={values.answers[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, answers: { ...current.answers, [field.key]: event.target.value } }))} placeholder={field.placeholder} />
              )}
            </label>
          ))}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>{submitting ? <Spinner size={16} /> : <ClipboardList size={16} />}Submit application</button>
          <p className="text-center text-xs text-slate-400">No enrollment or payment is created until an administrator approves and assigns you.</p>
        </form>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center"><ClipboardList className="mx-auto text-slate-400" /><p className="mt-3 text-sm text-slate-600">{error || 'This application is unavailable.'}</p><Link to="/login" className="btn-secondary mt-4">Sign in</Link></section>
      )}
    </div>
  );
}
