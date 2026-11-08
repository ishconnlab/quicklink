import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, MapPin, Phone, UserRound, UserRoundPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import AuthLearningVisual from '../components/AuthLearningVisual.jsx';

const COUNTRIES = ['Rwanda', 'Burundi', 'Democratic Republic of the Congo', 'Tanzania', 'Uganda', 'Kenya', 'South Africa', 'Zambia', 'Zimbabwe', 'Malawi', 'Mozambique', 'Nigeria', 'Ghana', 'Ethiopia', 'Other'];

export default function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', country: 'Rwanda', province: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    if (form.password.length < 10) { setError('Use a password with at least 10 characters.'); return; }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        country: form.country,
        province: form.province.trim(),
        password: form.password,
      });
      await login(form.email.trim(), form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return <div className="relative min-h-screen overflow-hidden bg-[#fffaf5]">
    <div className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-green-200/50 blur-3xl" />
    <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
    <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
      <section className="order-2 hidden lg:block">
        <AuthLearningVisual />
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-green-600 to-amber-600 text-sm font-black text-white shadow-xl shadow-green-900/20">IC</span>
          <div><p className="text-lg font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">QuickLink Learning Portal</p></div>
        </div>
        <h1 className="mt-12 max-w-md text-4xl font-black leading-[1.08] tracking-tight text-slate-950">Start your next<br /><span className="bg-gradient-to-r from-brand-600 to-amber-500 bg-clip-text text-transparent">professional chapter.</span></h1>
        <p className="mt-5 max-w-md text-base leading-7 text-slate-600">Create your student account to enroll in trainings, join live classes, complete projects, and earn certificates.</p>
        <ul className="mt-8 space-y-3 text-sm text-slate-600">
          {['Apply for open trainings in a few clicks', 'Attend live sessions from any device', 'Track assessment attempts and project feedback', 'Download and share verified certificates'].map((item) => <li key={item} className="flex items-center gap-2.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">✓</span>{item}</li>)}
        </ul>
      </section>

      <section className="order-1 mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-green-600 to-amber-600 text-xs font-black text-white shadow-lg shadow-green-900/20">IC</span>
          <div><p className="font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">QuickLink Learning</p></div>
        </div>
        <div className="rounded-3xl border border-green-100 bg-white/95 p-6 shadow-2xl shadow-green-950/[0.07] backdrop-blur sm:p-8">
          <p className="eyebrow">Student registration</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Create your account</h1>
          <p className="mt-1.5 text-sm text-slate-500">Your account is activated immediately. Use accurate details because certificates use your registered name.</p>

          {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="name">Full name</label><div className="relative"><UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="name" className="input pl-9" autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Names as they should appear on your certificate" /></div></div>
              <div><label className="label" htmlFor="email">Email address</label><div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="email" type="email" className="input pl-9" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></div></div>
              <div><label className="label" htmlFor="whatsapp">WhatsApp number</label><div className="relative"><Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="whatsapp" type="tel" className="input pl-9" autoComplete="tel" required minLength={7} maxLength={40} value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="+250 7XX XXX XXX" /></div><p className="mt-1 text-[11px] text-slate-400">Include your country code. Trainers use this for class updates.</p></div>
              <div><label className="label" htmlFor="country">Country</label><div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select id="country" className="input pl-9" required value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })}>{COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</select></div></div>
              <div><label className="label" htmlFor="province">Province / state / region</label><input id="province" className="input" required minLength={2} maxLength={120} value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} placeholder="e.g. Kigali City" /></div>
              <div><label className="label" htmlFor="password">Password</label><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="password" type={showPassword ? 'text' : 'password'} className="input pl-9 pr-11" autoComplete="new-password" required minLength={10} maxLength={200} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 10 characters" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
              <div><label className="label" htmlFor="confirmPassword">Confirm password</label><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="confirmPassword" type={showPassword ? 'text' : 'password'} className="input pl-9" autoComplete="new-password" required minLength={10} maxLength={200} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Enter it again" /></div></div>
            </div>
            <p className="rounded-xl bg-green-50 px-3 py-2.5 text-xs leading-5 text-brand-900">By creating an account you agree to follow IshConnect training rules, submit original project work, and keep your login details private.</p>
            <button disabled={loading} className="btn-primary w-full">{loading ? <Spinner size={18} /> : <UserRoundPlus size={18} />}{loading ? 'Creating your account…' : 'Create student account'}</button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-bold text-brand-700 hover:underline">Sign in</Link></p>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400"><ArrowRight size={12} /> No education level or role selection needed — every new account starts as a student.</p>
      </section>
    </div>
  </div>;
}
