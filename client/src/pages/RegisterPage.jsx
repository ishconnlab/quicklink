import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRoundPlus, AlertCircle, Mail, Lock, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const user = await register(form.name.trim(), form.email.trim(), form.password, form.educationLevel);
      setSubmitted(user);
    } catch (err) { setError(apiError(err).message); }
    finally { setLoading(false); }
  };

  const fields = [
    ['name', 'Full name', 'text', UserRound, 'Your name'],
    ['email', 'Email', 'email', Mail, 'you@example.com'],
    ['password', 'Password', 'password', Lock, 'At least 10 characters'],
    ['confirmPassword', 'Confirm password', 'password', Lock, 'Enter the password again'],
  ];
  if (submitted) return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8"><div className="mb-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">QL</div><div><p className="font-bold text-slate-900">QuickLink</p><p className="text-xs text-slate-500">Student registration</p></div></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h1 className="text-lg font-semibold text-emerald-900">Registration submitted</h1><p className="mt-2 text-sm leading-6 text-emerald-800">Your account is waiting for administrator approval. You can sign in after your registration is reviewed.</p></div><dl className="my-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Name</dt><dd className="text-right font-medium text-slate-800">{submitted.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="break-all text-right font-medium text-slate-800">{submitted.email}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Education level</dt><dd className="font-medium text-slate-800">{submitted.educationLevel}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="font-medium text-amber-700">Awaiting approval</dd></div></dl><Link to="/login" className="btn-primary w-full">Go to sign in</Link></div></div>;
  return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
    <div className="mb-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">QL</div><div><p className="font-bold text-slate-900">QuickLink</p><p className="text-xs text-slate-500">Create your student account</p></div></div>
    <h1 className="text-xl font-semibold text-slate-900">Student registration</h1><p className="mt-1 text-sm text-slate-500">Enter your real name, email, and current education level. An administrator reviews each student registration.</p>
    {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
    <form onSubmit={submit} className="mt-5 space-y-4">{fields.slice(0, 2).map(([key, label, type, Icon, placeholder]) => <div key={key}><label className="label" htmlFor={key}>{label}</label><div className="relative"><Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id={key} className="input pl-9" type={type} autoComplete={key === 'name' ? 'name' : 'email'} required maxLength={key === 'name' ? 120 : 254} minLength={key === 'name' ? 2 : undefined} value={form[key]} placeholder={placeholder} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div><p className="mt-1 text-xs text-slate-400">{key === 'name' ? 'Use the name shown on your school or training records.' : 'Use an email address you can access; approval updates will be tied to this account.'}</p></div>)}
      <div><label className="label" htmlFor="educationLevel">Education level</label><select id="educationLevel" required className="input" value={form.educationLevel || ''} onChange={(event) => setForm({ ...form, educationLevel: event.target.value })}><option value="" disabled>Select your current level</option><option value="L3">L3</option><option value="L4">L4</option><option value="L5">L5</option></select><p className="mt-1 text-xs text-slate-400">Choose the level you are registering to study. An admin can confirm it during review.</p></div>
      {fields.slice(2).map(([key, label, type, Icon, placeholder]) => <div key={key}><label className="label" htmlFor={key}>{label}</label><div className="relative"><Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id={key} className="input pl-9" type={type} autoComplete="new-password" required minLength={10} maxLength={200} value={form[key]} placeholder={placeholder} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div></div>)}<div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">You will not be able to sign in or enroll in classes until an administrator approves your registration.</div><button disabled={loading} className="btn-primary w-full">{loading ? <Spinner size={18} /> : <UserRoundPlus size={18} />}{loading ? 'Submitting registration…' : 'Submit for approval'}</button></form>
    <p className="mt-5 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
  </div></div>;
}
