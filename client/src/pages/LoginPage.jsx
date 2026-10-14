import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err).message);
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
              School data collection &amp; reporting
            </p>

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

            <p className="mt-4 text-xs text-slate-400">
              Accounts are created by existing users. There is no public registration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
