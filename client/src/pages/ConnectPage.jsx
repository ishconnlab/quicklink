import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Link2, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function ConnectPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const { user, registerParent, acceptInvitation, login } = useAuth();

  const [mode, setMode] = useState('register');
  const [form, setForm] = useState({ name: '', email: '', password: '', relationship: '' });
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const afterConnect = (linkedUser) => {
    navigate(linkedUser?.role === 'parent' ? '/parent' : '/messages', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!token) return toast.error('This link is missing its invitation token.');
    setBusy(true);
    try {
      if (mode === 'register') {
        const data = await registerParent({ token, ...form });
        toast.success('Account created. Your link awaits school approval.');
        afterConnect(data.user);
      } else {
        const u = await login(form.email, form.password);
        await acceptInvitation(token);
        toast.success('Invitation accepted. Awaiting school approval.');
        afterConnect(u);
      }
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const acceptAsCurrent = async () => {
    setBusy(true);
    try {
      await acceptInvitation(token);
      toast.success('Invitation accepted. Awaiting school approval.');
      afterConnect(user);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white">
            QL
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Connect to your child</h1>
          <p className="mt-1 text-sm text-slate-500">
            QuickLink keeps you updated on your child&apos;s school requirements and messages.
          </p>
        </div>

        <div className="card">
          {!token ? (
            <p className="text-center text-sm text-red-600">
              This connection link is invalid or incomplete. Ask your school for a new invitation.
            </p>
          ) : user ? (
            <div className="space-y-4 text-center">
              <ShieldCheck size={32} className="mx-auto text-brand-600" />
              <p className="text-sm text-slate-600">
                You are signed in as <span className="font-semibold">{user.email}</span>. Accept the
                invitation to connect to this learner?
              </p>
              <button onClick={acceptAsCurrent} disabled={busy} className="btn-primary w-full">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                Accept invitation
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm">
                <button
                  onClick={() => setMode('register')}
                  className={`flex-1 rounded-md py-1.5 font-medium ${
                    mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Create account
                </button>
                <button
                  onClick={() => setMode('login')}
                  className={`flex-1 rounded-md py-1.5 font-medium ${
                    mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Sign in
                </button>
              </div>

              <form onSubmit={submit} className="space-y-3">
                {mode === 'register' && (
                  <>
                    <label className="block">
                      <span className="label">Full name</span>
                      <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input" required />
                    </label>
                    <label className="block">
                      <span className="label">Relationship to learner</span>
                      <input
                        value={form.relationship}
                        onChange={(e) => set('relationship', e.target.value)}
                        className="input"
                        placeholder="mother / father"
                      />
                    </label>
                  </>
                )}
                <label className="block">
                  <span className="label">Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    className="input"
                    required
                  />
                </label>
                <label className="block">
                  <span className="label">Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    className="input"
                    minLength={8}
                    required
                  />
                </label>
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                  {mode === 'register' ? 'Create account & connect' : 'Sign in & connect'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-slate-600">
            School staff sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
