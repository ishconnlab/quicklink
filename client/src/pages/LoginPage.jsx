import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Award, CalendarCheck2, Eye, EyeOff, Lock, LogIn, Mail, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');

  const checkServer = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setServerStatus('offline');
      return;
    }
    setServerStatus('checking');
    try {
      await api.get('/health', { timeout: 60000 });
      setServerStatus('online');
    } catch (requestError) {
      const failure = apiError(requestError);
      setServerStatus(failure.timeout ? 'starting' : 'offline');
    }
  }, []);

  useEffect(() => {
    checkServer();
    const onOnline = () => checkServer();
    const onOffline = () => setServerStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [checkServer]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await login(email.trim(), password);
      const destination = location.state?.from;
      navigate(destination ? `${destination.pathname}${destination.search || ''}` : account.isAdmin ? '/dashboard' : '/dashboard', { replace: true });
    } catch (err) {
      const failure = apiError(err);
      setError(failure.message);
      if (failure.offline) setServerStatus('offline');
      else if (failure.timeout) setServerStatus('starting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffaf5]">
      <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-orange-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <section className="hidden lg:block">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-orange-600 to-amber-600 text-sm font-black text-white shadow-xl shadow-orange-900/20">IC</span>
            <div><p className="text-lg font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">QuickLink Learning Portal</p></div>
          </div>
          <h1 className="mt-12 max-w-xl text-4xl font-black leading-[1.08] tracking-tight text-slate-950 xl:text-5xl">Learn deeply.<br /><span className="bg-gradient-to-r from-brand-600 to-amber-500 bg-clip-text text-transparent">Get certified.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">Join structured trainings, attend live sessions with your trainers, submit real projects, and earn verifiable certificates.</p>
          <div className="mt-9 grid max-w-xl gap-3 sm:grid-cols-2">
            {[
              { icon: CalendarCheck2, title: 'Live training', text: 'Interactive classes and attendance tracking' },
              { icon: ShieldCheck, title: 'Structured projects', text: 'Submit work and receive trainer feedback' },
              { icon: Award, title: 'Certificates', text: 'Shareable, verifiable achievement records' },
              { icon: ArrowRight, title: 'One workspace', text: 'Every training and result in one place' },
            ].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-orange-100 bg-white/70 p-4 backdrop-blur"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-brand-700 ring-1 ring-orange-100"><Icon size={17} /></span><p className="mt-3 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-orange-600 to-amber-600 text-xs font-black text-white shadow-lg shadow-orange-900/20">IC</span>
            <div><p className="font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">QuickLink Learning</p></div>
          </div>
          <div className="rounded-3xl border border-orange-100 bg-white/95 p-6 shadow-2xl shadow-orange-950/[0.07] backdrop-blur sm:p-8">
            <p className="eyebrow">Welcome back</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Sign in to your portal</h1>
            <p className="mt-1.5 text-sm text-slate-500">Use the email and password linked to your student account.</p>

            <div className={`mt-5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
              serverStatus === 'online' ? 'bg-emerald-50 text-emerald-800'
                : serverStatus === 'checking' || serverStatus === 'starting' ? 'bg-amber-50 text-amber-800'
                  : 'bg-red-50 text-red-700'
            }`} role="status" aria-live="polite">
              {serverStatus === 'online' ? <Wifi size={15} />
                : serverStatus === 'checking' || serverStatus === 'starting' ? <Spinner size={15} />
                  : <WifiOff size={15} />}
              <span className="flex-1">
                {serverStatus === 'online' ? 'IshConnect server connected'
                  : serverStatus === 'checking' ? 'Connecting to IshConnect…'
                    : serverStatus === 'starting' ? 'Server is starting up; this may take a moment.'
                      : 'Cannot reach the server. Check your connection.'}
              </span>
              {(serverStatus === 'offline' || serverStatus === 'starting') && <button type="button" onClick={checkServer} className="inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw size={13} />Retry</button>}
            </div>

            {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="input pl-9" placeholder="you@example.com" /></div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between"><label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label></div>
                <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input pl-9 pr-11" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? <Spinner size={18} /> : <LogIn size={18} />}{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">New to IshConnect? <Link to="/register" className="font-bold text-brand-700 hover:underline">Create a student account</Link></p>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400"><ShieldCheck size={12} /> Secure access · IshConnect training platform</p>
        </section>
      </div>
    </div>
  );
}
