import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, KeyRound, LockKeyhole, Mail, MapPin, Phone, Save, ShieldCheck, Smartphone, User } from 'lucide-react';
import { PageHeader } from '../components/layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';
import { roleLabel } from '../lib/roles.js';
import { Spinner } from '../components/ui.jsx';

export default function SettingsPage() {
  const { user, updateProfile, changePassword } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: '', whatsapp: '', country: '', province: '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || false);

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', whatsapp: user.whatsapp || '', country: user.country || '', province: user.province || '' });
  }, [user]);

  useEffect(() => {
    const handler = (event) => { event.preventDefault(); setInstallEvent(event); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    const errors = {};
    if (profile.name.trim().length < 2) errors.name = 'Enter your full name.';
    if (profile.whatsapp.trim() && profile.whatsapp.trim().length < 7) errors.whatsapp = 'Enter a valid WhatsApp number.';
    if (profile.country.trim() && profile.country.trim().length < 2) errors.country = 'Enter a valid country.';
    if (profile.province.trim() && profile.province.trim().length < 2) errors.province = 'Enter a valid province, state, or region.';
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;
    setProfileSaving(true);
    try {
      await updateProfile({ name: profile.name.trim(), whatsapp: profile.whatsapp.trim(), country: profile.country.trim(), province: profile.province.trim() });
      toast.success('Profile updated.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setProfileSaving(false); }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!password.currentPassword) errors.currentPassword = 'Enter your current password.';
    if (password.newPassword.length < 8) errors.newPassword = 'Use at least 8 characters.';
    if (password.newPassword !== password.confirm) errors.confirm = 'Passwords do not match.';
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;
    setPasswordSaving(true);
    try {
      await changePassword(password.currentPassword, password.newPassword);
      toast.success('Password updated. Sign in again with your new password.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setPasswordSaving(false); }
  };

  const install = async () => {
    if (!installEvent) { toast.info('Use your browser menu and choose “Install app” or “Add to Home screen”.'); return; }
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  return <div className="mx-auto max-w-3xl">
    <PageHeader eyebrow="Your account" title="Settings" subtitle="Keep your contact details current, manage security, and install the IshConnect QuickLink app on your device." />

    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><User size={18} className="text-brand-700" />Profile</h2><p className="mt-1 text-sm text-slate-500">Used on class rosters, invitations, and your certificate.</p></div>
          <Badge>{roleLabel(user?.role)}</Badge>
        </div>
        <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Full name</span><input className={`input ${profileErrors.name ? 'ring-2 ring-red-400' : ''}`} autoComplete="name" required minLength={2} maxLength={120} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />{profileErrors.name && <span className="mt-1 block text-xs text-red-600">{profileErrors.name}</span>}</label>
          <label><span className="label">Email</span><div className="relative"><Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input bg-slate-50 pl-9 text-slate-500" value={user?.email || ''} readOnly aria-describedby="email-help" /></div><span id="email-help" className="mt-1 block text-xs text-slate-400">Contact an administrator to change your sign-in email.</span></label>
          <label><span className="label">WhatsApp number</span><div className="relative"><Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`input pl-9 ${profileErrors.whatsapp ? 'ring-2 ring-red-400' : ''}`} type="tel" autoComplete="tel" maxLength={40} value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} placeholder="+250 700 000 000" /></div>{profileErrors.whatsapp && <span className="mt-1 block text-xs text-red-600">{profileErrors.whatsapp}</span>}</label>
          <label><span className="label">Country</span><div className="relative"><MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`input pl-9 ${profileErrors.country ? 'ring-2 ring-red-400' : ''}`} autoComplete="country-name" maxLength={120} value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} /></div>{profileErrors.country && <span className="mt-1 block text-xs text-red-600">{profileErrors.country}</span>}</label>
          <label><span className="label">Province / state / region</span><input className={`input ${profileErrors.province ? 'ring-2 ring-red-400' : ''}`} autoComplete="address-level1" maxLength={120} value={profile.province} onChange={(event) => setProfile({ ...profile, province: event.target.value })} />{profileErrors.province && <span className="mt-1 block text-xs text-red-600">{profileErrors.province}</span>}</label>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2"><p className="text-xs text-slate-400">Last sign-in: {formatDateTime(user?.lastLoginAt)}</p><button className="btn-primary" disabled={profileSaving}>{profileSaving ? <Spinner size={16} /> : <Save size={16} />}{profileSaving ? 'Saving…' : 'Save profile'}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><KeyRound size={18} className="text-brand-700" />Change password</h2>
        <p className="mt-1 text-sm text-slate-500">Use at least 8 characters. You will be signed out after changing your password.</p>
        <form onSubmit={savePassword} className="mt-4 space-y-3">
          <label className="block"><span className="label">Current password</span><input className={`input ${passwordErrors.currentPassword ? 'ring-2 ring-red-400' : ''}`} type="password" autoComplete="current-password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} />{passwordErrors.currentPassword && <span className="mt-1 block text-xs text-red-600">{passwordErrors.currentPassword}</span>}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">New password</span><input className={`input ${passwordErrors.newPassword ? 'ring-2 ring-red-400' : ''}`} type="password" autoComplete="new-password" minLength={8} value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} />{passwordErrors.newPassword && <span className="mt-1 block text-xs text-red-600">{passwordErrors.newPassword}</span>}</label>
            <label><span className="label">Confirm new password</span><input className={`input ${passwordErrors.confirm ? 'ring-2 ring-red-400' : ''}`} type="password" autoComplete="new-password" minLength={8} value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} />{passwordErrors.confirm && <span className="mt-1 block text-xs text-red-600">{passwordErrors.confirm}</span>}</label>
          </div>
          <button type="submit" className="btn-primary" disabled={passwordSaving}>{passwordSaving ? <Spinner size={16} /> : <LockKeyhole size={16} />}{passwordSaving ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-orange-100 bg-green-50 p-4 shadow-sm shadow-orange-950/[0.03] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-orange-100"><Smartphone size={19} /></span><div><h2 className="text-base font-bold text-slate-950">Install the QuickLink app</h2><p className="mt-1 max-w-lg text-sm leading-6 text-slate-600">Add IshConnect QuickLink to your home screen for faster access to trainings, live classes, and certificates.</p><p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} />{installed ? 'Installed on this device' : 'Works offline for the app shell'}</p></div></div>
          <button onClick={install} className="btn-secondary shrink-0" disabled={installed}>{installed ? <ShieldCheck size={16} /> : <Download size={16} />}{installed ? 'App installed' : 'Install app'}</button>
        </div>
      </section>

      <p className="text-center text-xs text-slate-400">Need help with your account? Contact your training administrator. <Link to="/dashboard" className="font-semibold text-brand-700 hover:underline">Back to dashboard</Link></p>
    </div>
  </div>;
}

function Badge({ children }) {
  return <span className="badge bg-orange-50 text-brand-800 ring-1 ring-orange-100">{children}</span>;
}
