import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import { isAdmin, isTeacher } from '../lib/roles.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await login(email.trim(), password);
      const destination = location.state?.from;
      navigate(destination ? `${destination.pathname}${destination.search || ''}` : isAdmin(account) ? '/learning' : isTeacher(account) ? '/classes' : '/dashboard', { replace: true });
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="relative rounded-xl border border-slate-200 bg-white">
          {/* QuickLink label attached to the top edge of the form */}
          <div className="absolute -top-5 left-5">
            <div className="flex items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-white/15 text-[11px] font-bold">
                QL
              </span>
              <span className="text-sm font-semibold tracking-wide">QuickLink</span>
            </div>
          </div>

          <div className="p-6 pt-9 sm:p-7 sm:pt-10">
            <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Student learning library
            </p>

            <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              serverStatus === 'online' ? 'bg-emerald-50 text-emerald-800'
                : serverStatus === 'checking' || serverStatus === 'starting' ? 'bg-amber-50 text-amber-800'
                  : 'bg-red-50 text-red-700'
            }`} role="status" aria-live="polite">
              {serverStatus === 'online' ? <Wifi size={15} />
                : serverStatus === 'checking' || serverStatus === 'starting' ? <Spinner size={15} />
                  : <WifiOff size={15} />}
              <span className="flex-1">
                {serverStatus === 'online' ? 'QuickLink server connected'
                  : serverStatus === 'checking' ? 'Checking connection to QuickLink…'
                    : serverStatus === 'starting' ? 'QuickLink server is starting up; this may take a moment.'
                      : 'Cannot reach QuickLink. Check your connection, then retry.'}
              </span>
              {(serverStatus === 'offline' || serverStatus === 'starting') && <button type="button" onClick={checkServer} className="inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw size={13} />Retry</button>}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-9"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-9"
                    placeholder="Enter your password"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <Spinner size={18} /> : <LogIn size={18} />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-500">New to QuickLink? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Create a student account</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
