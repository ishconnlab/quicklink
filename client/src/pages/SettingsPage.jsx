import { useState, useEffect } from 'react';
import { KeyRound, User, ShieldCheck, Smartphone, Info, Download, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';
import { hardRefresh } from '../lib/cache.js';

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [installEvent, setInstallEvent] = useState(null);

  // Capture the PWA install prompt if the browser offers one.
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.currentPassword) errs.currentPassword = 'Required';
    if (form.newPassword.length < 8) errs.newPassword = 'At least 8 characters';
    if (form.newPassword !== form.confirm) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      toast.success('Password updated. Use the new password next time you sign in.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    if (!installEvent) {
      toast.info('Use your browser menu and choose “Install app” / “Add to Home screen”.');
      return;
    }
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="Your account and app preferences" />

      <div className="card mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <User size={16} /> Profile
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-400">Name</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Email</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Role</dt>
            <dd className="mt-0.5">
              <span className="badge bg-brand-100 text-brand-700">
                <ShieldCheck size={11} /> Standard user
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Last sign-in</dt>
            <dd className="mt-0.5 font-medium text-slate-800">
              {formatDateTime(user?.lastLoginAt)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <KeyRound size={16} /> Change password
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              className={`input ${errors.currentPassword ? 'ring-2 ring-red-400' : ''}`}
            />
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.currentPassword}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                className={`input ${errors.newPassword ? 'ring-2 ring-red-400' : ''}`}
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>
              )}
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className={`input ${errors.confirm ? 'ring-2 ring-red-400' : ''}`}
              />
              {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Spinner size={16} /> : <KeyRound size={16} />} Update password
          </button>
        </form>
      </div>

      <div className="card mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Smartphone size={16} /> Install as an app
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Install QuickLink on your device for fast, full-screen access and offline data capture.
        </p>
        <button onClick={install} className="btn-secondary">
          <Download size={16} /> Install app
        </button>
      </div>

      <div className="card">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Info size={16} /> About
        </h2>
        <p className="text-sm text-slate-500">
          QuickLink — school data collection, monitoring and reporting. Records are stored securely in
          MongoDB and synchronized from offline devices.
        </p>
        <p className="mt-2 text-xs text-slate-400">Version 1.0.0</p>
        <button onClick={hardRefresh} className="btn-secondary mt-3">
          <RefreshCw size={16} /> Refresh app data
        </button>
        <p className="mt-1.5 text-xs text-slate-400">
          Clears the offline cache and reloads the latest version.
        </p>
      </div>
    </div>
  );
}
