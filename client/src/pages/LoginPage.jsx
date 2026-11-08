import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, LogIn, Mail, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import AuthLearningVisual from '../components/AuthLearningVisual.jsx';

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
      await login(email.trim(), password);
      const destination = location.state?.from;
      navigate(destination ? `${destination.pathname}${destination.search || ''}` : '/dashboard', { replace: true });
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
    <main className="grid min-h-screen bg-white lg:min-h-dvh lg:grid-cols-2">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:min-h-dvh lg:px-12 xl:px-20">
        <div className="w-full max-w-md">
          <Link to="/login" className="mb-10 inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-xs font-black text-white">QL</span>
            <span><span className="block font-bold tracking-tight text-slate-950">QuickLink</span><span className="block text-xs text-slate-500">by IshConnect</span></span>
          </Link>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Sign in to QuickLink</h1>
            <p className="mt-1.5 text-sm text-slate-500">Use the email and password linked to your student account.</p>

            <div className={`mt-5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
              serverStatus === 'online' ? 'bg-green-50 text-green-800'
                : serverStatus === 'checking' || serverStatus === 'starting' ? 'bg-slate-50 text-slate-700'
                  : 'bg-red-50 text-red-700'
            }`} role="status" aria-live="polite">
              {serverStatus === 'online' ? <Wifi size={15} />
                : serverStatus === 'checking' || serverStatus === 'starting' ? <Spinner size={15} />
                  : <WifiOff size={15} />}
              <span className="flex-1">
                {serverStatus === 'online' ? 'QuickLink is ready'
                  : serverStatus === 'checking' ? 'Connecting to QuickLink…'
                    : serverStatus === 'starting' ? 'QuickLink is starting; this may take a moment.'
                      : 'Cannot reach QuickLink. Check your connection.'}
              </span>
              {(serverStatus === 'offline' || serverStatus === 'starting') && <button type="button" onClick={checkServer} className="inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw size={13} />Retry</button>}
            </div>

            {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="input pl-9" placeholder="you@example.com" /></div>
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input pl-9 pr-11" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? <Spinner size={18} /> : <LogIn size={18} />}{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">New to QuickLink? <Link to="/register" className="font-bold text-brand-700 hover:underline">Create a student account</Link></p>
          </div>
          <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400"><ShieldCheck size={14} /> Secure access to your learning workspace</p>
        </div>
      </section>

      <aside className="relative hidden min-h-dvh flex-col justify-center overflow-hidden border-l border-green-100 bg-green-50 px-10 py-12 lg:flex xl:px-16">
        <div className="mx-auto w-full max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-800">Learn with IshConnect</p>
          <h2 className="mt-3 max-w-lg text-4xl font-bold leading-tight tracking-tight text-slate-950 xl:text-5xl">Learn by doing.<br /><span className="text-green-800">Build what’s next.</span></h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">Join live technology classes, practise with real projects, and follow your progress in one place.</p>
          <AuthLearningVisual />
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-700">
            <span className="rounded-full border border-green-200 bg-white px-3 py-2">Live classes</span>
            <span className="rounded-full border border-green-200 bg-white px-3 py-2">Programming projects</span>
            <span className="rounded-full border border-green-200 bg-white px-3 py-2">AI &amp; machine learning</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
