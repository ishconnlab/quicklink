import { useEffect, useState } from 'react';
import { Download, KeyRound, ShieldCheck, Smartphone, User } from 'lucide-react';
import { PageHeader } from '../components/layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';
import { Spinner } from '../components/ui.jsx';
import { roleLabel } from '../lib/roles.js';

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const handler = (event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.currentPassword) nextErrors.currentPassword = 'Required';
    if (form.newPassword.length < 8) nextErrors.newPassword = 'At least 8 characters';
    if (form.newPassword !== form.confirm) nextErrors.confirm = 'Passwords do not match';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      toast.success('Password updated. Use the new password next time you sign in.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const install = async () => {
    if (!installEvent) { toast.info('Use your browser menu and choose Install app or Add to Home screen.'); return; }
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return <div className="mx-auto max-w-2xl">
    <PageHeader title="Settings" subtitle="Your QuickLink account" />
    <div className="card mb-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><User size={16} /> Profile</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs uppercase text-slate-400">Name</dt><dd className="mt-0.5 font-medium text-slate-800">{user?.name}</dd></div>
        <div><dt className="text-xs uppercase text-slate-400">Email</dt><dd className="mt-0.5 font-medium text-slate-800">{user?.email}</dd></div>
        <div><dt className="text-xs uppercase text-slate-400">Role</dt><dd className="mt-0.5"><span className="badge bg-brand-100 text-brand-700"><ShieldCheck size={11} />{roleLabel(user?.role)}</span></dd></div>
        <div><dt className="text-xs uppercase text-slate-400">Last sign-in</dt><dd className="mt-0.5 font-medium text-slate-800">{formatDateTime(user?.lastLoginAt)}</dd></div>
      </dl>
    </div>
    <div className="card mb-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><KeyRound size={16} /> Change password</h2>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label">Current password</label><input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={`input ${errors.currentPassword ? 'ring-2 ring-red-400' : ''}`} />{errors.currentPassword && <p className="mt-1 text-xs text-red-600">{errors.currentPassword}</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">New password</label><input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className={`input ${errors.newPassword ? 'ring-2 ring-red-400' : ''}`} />{errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>}</div>
          <div><label className="label">Confirm new password</label><input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={`input ${errors.confirm ? 'ring-2 ring-red-400' : ''}`} />{errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}</div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? <Spinner size={16} /> : <KeyRound size={16} />}Update password</button>
      </form>
    </div>
    <div className="card">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Smartphone size={16} /> Install QuickLink</h2>
      <p className="mb-3 text-sm text-slate-500">Add QuickLink to your device for quick access to the learning library.</p>
      <button onClick={install} className="btn-secondary"><Download size={16} /> Install app</button>
    </div>
  </div>;
}
