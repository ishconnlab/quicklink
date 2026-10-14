import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter your full name';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errs.email = 'Enter a valid email';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setDone(true);
    } catch (err) {
      const info = apiError(err);
      setError(info.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="relative rounded-xl border border-slate-200 bg-white">
          <div className="absolute -top-5 left-5">
            <div className="flex items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-white/15 text-[11px] font-bold">
                QL
              </span>
              <span className="text-sm font-semibold tracking-wide">QuickLink</span>
            </div>
          </div>

          <div className="p-6 pt-9 sm:p-7 sm:pt-10">
            {done ? (
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <CheckCircle2 size={26} />
                </div>
                <h1 className="mt-4 text-lg font-semibold text-slate-900">Registration received</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Your account is awaiting approval by an account owner. You will be able to sign in
                  once it has been approved.
                </p>
                <Link to="/login" className="btn-primary mt-5 w-full">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-slate-900">Create an account</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Register to collect and manage your own school data
                </p>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={onSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="label" htmlFor="name">
                      Full name
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="name"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        className={`input pl-9 ${errors.name ? 'ring-2 ring-red-400' : ''}`}
                        placeholder="Jane Doe"
                        autoComplete="name"
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="email">
                      Email
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                        className={`input pl-9 ${errors.email ? 'ring-2 ring-red-400' : ''}`}
                        placeholder="you@example.com"
                        autoComplete="username"
                      />
                    </div>
                    {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
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
                        value={form.password}
                        onChange={(e) => set('password', e.target.value)}
                        className={`input pl-9 ${errors.password ? 'ring-2 ring-red-400' : ''}`}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="confirm">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="confirm"
                        type="password"
                        value={form.confirm}
                        onChange={(e) => set('confirm', e.target.value)}
                        className={`input pl-9 ${errors.confirm ? 'ring-2 ring-red-400' : ''}`}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                    </div>
                    {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? <Spinner size={18} /> : <UserPlus size={18} />}
                    {loading ? 'Submitting…' : 'Create account'}
                  </button>
                </form>

                <p className="mt-4 text-center text-sm text-slate-500">
                  Already have an account?{' '}
                  <Link to="/login" className="font-semibold text-brand-700 hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
