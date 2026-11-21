import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, KeyRound, LockKeyhole, LogOut, Mail, MapPin, Phone, Save, ShieldCheck, Smartphone, User, Palette } from 'lucide-react';
import { PageHeader } from '../components/layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';
import { roleLabel } from '../lib/roles.js';
import { Spinner } from '../components/ui.jsx';
import UserAvatar from '../components/UserAvatar.jsx';

export default function SettingsPage() {
  const { user, updateProfile, updateProfileImage, changePassword, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: '', whatsapp: '', country: '', province: '', location: '', institution: '', educationLevel: '', biography: '', skills: '', githubUrl: '', linkedinUrl: '', portfolioUrl: '', socialUrl: '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const profileImageInput = useRef(null);
  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || false);

  useEffect(() => {
    if (user) setProfile({
      name: user.name || '', whatsapp: user.whatsapp || '', country: user.country || '', province: user.province || '',
      location: user.location || '', institution: user.institution || '', educationLevel: user.educationLevel || '',
      biography: user.biography || '', skills: user.skills || '', githubUrl: user.githubUrl || '',
      linkedinUrl: user.linkedinUrl || '', portfolioUrl: user.portfolioUrl || '', socialUrl: user.socialUrl || '',
    });
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

  useEffect(() => {
    if (!profileImage) { setProfileImagePreview(''); return undefined; }
    const preview = URL.createObjectURL(profileImage);
    setProfileImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [profileImage]);

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
      await updateProfile({
        name: profile.name.trim(),
        whatsapp: profile.whatsapp.trim(),
        country: profile.country.trim(),
        province: profile.province.trim(),
        location: profile.location.trim(),
        institution: profile.institution.trim(),
        educationLevel: profile.educationLevel,
        biography: profile.biography.trim(),
        skills: profile.skills.trim(),
        githubUrl: profile.githubUrl.trim(),
        linkedinUrl: profile.linkedinUrl.trim(),
        portfolioUrl: profile.portfolioUrl.trim(),
        socialUrl: profile.socialUrl.trim(),
      });
      toast.success('Profile updated.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setProfileSaving(false); }
  };

  const saveProfileImage = async () => {
    if (!profileImage) return;
    setProfileImageSaving(true);
    try {
      await updateProfileImage(profileImage);
      setProfileImage(null);
      if (profileImageInput.current) profileImageInput.current.value = '';
      toast.success('Profile picture updated.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setProfileImageSaving(false); }
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

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const chooseProfileImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) { setProfileImage(null); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Choose a PNG, JPEG, or WebP image.');
      event.target.value = '';
      setProfileImage(null);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Choose an image that is 3 MB or smaller.');
      event.target.value = '';
      setProfileImage(null);
      return;
    }
    setProfileImage(file);
  };

  return <div className="mx-auto max-w-3xl">
    <PageHeader eyebrow="Your account" title="Settings" subtitle="Keep your contact details current, manage security, and install the QuickLink QuickLink app on your device." />

    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><User size={18} className="text-brand-700" />Profile</h2><p className="mt-1 text-sm text-slate-500">Used on class rosters, invitations, and your certificate.</p></div>
          <div className="flex shrink-0 items-center gap-2"><Badge>{roleLabel(user?.role)}</Badge><button type="button" onClick={signOut} className="btn-ghost min-h-9 px-2.5 text-xs text-slate-600"><LogOut size={14} />Sign out</button></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <UserAvatar name={user?.name} imageUrl={profileImagePreview || user?.profileImageUrl} className="h-14 w-14 text-lg ring-2 ring-white" />
          <label className="min-w-48 flex-1 text-xs text-slate-500">
            <span className="block font-semibold text-slate-700">Profile picture</span>
            <input
              ref={profileImageInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700"
              onChange={chooseProfileImage}
              disabled={profileImageSaving}
            />
            <span className="mt-1 block">PNG, JPEG, or WebP · up to 3 MB</span>
            {profileImage && <span className="mt-1 block truncate text-brand-700">Selected: {profileImage.name}</span>}
          </label>
          <button type="button" className="btn-secondary" disabled={!profileImage || profileImageSaving} onClick={saveProfileImage}>
            {profileImageSaving ? <Spinner size={16} /> : <Save size={16} />}Upload
          </button>
        </div>
        <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Full name</span><input className={`input ${profileErrors.name ? 'ring-2 ring-red-400' : ''}`} autoComplete="name" required minLength={2} maxLength={120} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />{profileErrors.name && <span className="mt-1 block text-xs text-red-600">{profileErrors.name}</span>}</label>
          <label><span className="label">Email</span><div className="relative"><Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input bg-slate-50 pl-9 text-slate-500" value={user?.email || ''} readOnly aria-describedby="email-help" /></div><span id="email-help" className="mt-1 block text-xs text-slate-400">Contact an administrator to change your sign-in email.</span></label>
          <label><span className="label">WhatsApp number</span><div className="relative"><Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`input pl-9 ${profileErrors.whatsapp ? 'ring-2 ring-red-400' : ''}`} type="tel" autoComplete="tel" maxLength={40} value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} placeholder="+250 700 000 000" /></div>{profileErrors.whatsapp && <span className="mt-1 block text-xs text-red-600">{profileErrors.whatsapp}</span>}</label>
          <label><span className="label">Country</span><div className="relative"><MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`input pl-9 ${profileErrors.country ? 'ring-2 ring-red-400' : ''}`} autoComplete="country-name" maxLength={120} value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} /></div>{profileErrors.country && <span className="mt-1 block text-xs text-red-600">{profileErrors.country}</span>}</label>
          <label><span className="label">Province / state / region</span><input className={`input ${profileErrors.province ? 'ring-2 ring-red-400' : ''}`} autoComplete="address-level1" maxLength={120} value={profile.province} onChange={(event) => setProfile({ ...profile, province: event.target.value })} />{profileErrors.province && <span className="mt-1 block text-xs text-red-600">{profileErrors.province}</span>}</label>
          <label><span className="label">Location</span><input className="input" maxLength={120} value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} placeholder="City or neighbourhood" /></label>
          <label><span className="label">Institution</span><input className="input" maxLength={180} value={profile.institution} onChange={(event) => setProfile({ ...profile, institution: event.target.value })} placeholder="School or organisation" /></label>
          <label><span className="label">Education level</span><select className="input" value={profile.educationLevel} onChange={(event) => setProfile({ ...profile, educationLevel: event.target.value })}><option value="">Select level</option>{['L3', 'L4', 'L5', 'Bootcamp', 'Training'].map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="label">Short biography</span><textarea className="input min-h-24 resize-y" maxLength={2000} value={profile.biography} onChange={(event) => setProfile({ ...profile, biography: event.target.value })} placeholder="Tell the learning team about yourself." /></label>
          <label className="sm:col-span-2"><span className="label">Skills and interests</span><input className="input" maxLength={1000} value={profile.skills} onChange={(event) => setProfile({ ...profile, skills: event.target.value })} placeholder="Networking, JavaScript, project management" /></label>
          <label><span className="label">GitHub URL</span><input className="input" type="url" maxLength={500} value={profile.githubUrl} onChange={(event) => setProfile({ ...profile, githubUrl: event.target.value })} placeholder="https://github.com/username" /></label>
          <label><span className="label">LinkedIn URL</span><input className="input" type="url" maxLength={500} value={profile.linkedinUrl} onChange={(event) => setProfile({ ...profile, linkedinUrl: event.target.value })} placeholder="https://linkedin.com/in/username" /></label>
          <label><span className="label">Portfolio URL</span><input className="input" type="url" maxLength={500} value={profile.portfolioUrl} onChange={(event) => setProfile({ ...profile, portfolioUrl: event.target.value })} placeholder="https://yourportfolio.example" /></label>
          <label><span className="label">Other social link</span><input className="input" type="url" maxLength={500} value={profile.socialUrl} onChange={(event) => setProfile({ ...profile, socialUrl: event.target.value })} placeholder="https://..." /></label>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2"><p className="text-xs text-slate-400">Last sign-in: {formatDateTime(user?.lastLoginAt)}</p><button className="btn-primary" disabled={profileSaving}>{profileSaving ? <Spinner size={16} /> : <Save size={16} />}{profileSaving ? 'Saving…' : 'Save profile'}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><Palette size={18} className="text-brand-700" />Appearance</h2>
        <p className="mt-1 text-sm text-slate-500">Choose how QuickLink looks on this device.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${theme === value ? 'border-brand-500 bg-green-50 text-brand-800 ring-1 ring-green-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
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

      <section className="rounded-2xl border border-green-100 bg-green-50 p-4 shadow-sm shadow-green-950/[0.03] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-green-100"><Smartphone size={19} /></span><div><h2 className="text-base font-bold text-slate-950">Install the QuickLink app</h2><p className="mt-1 max-w-lg text-sm leading-6 text-slate-600">Add QuickLink QuickLink to your home screen for faster access to trainings, live classes, and certificates.</p><p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} />{installed ? 'Installed on this device' : 'Works offline for the app shell'}</p></div></div>
          <button onClick={install} className="btn-secondary shrink-0" disabled={installed}>{installed ? <ShieldCheck size={16} /> : <Download size={16} />}{installed ? 'App installed' : 'Install app'}</button>
        </div>
      </section>

      <p className="text-center text-xs text-slate-400">Need help with your account? Contact your training administrator. <Link to="/dashboard" className="font-semibold text-brand-700 hover:underline">Back to dashboard</Link></p>
    </div>
  </div>;
}

function Badge({ children }) {
  return <span className="badge bg-green-50 text-brand-800 ring-1 ring-green-100">{children}</span>;
}
