import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, GraduationCap, LockKeyhole, Mail, ShieldCheck, UserRoundPlus } from 'lucide-react';
import api, { apiError, assetUrl } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PublicTrainingRegistrationPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({ name: '', email: '', whatsapp: '', answers: {} });
  const [accountDetails, setAccountDetails] = useState({ password: '', confirmPassword: '' });
  const [claim, setClaim] = useState(null);
  const [accountSetup, setAccountSetup] = useState(null);
  const [accountMode, setAccountMode] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [error, setError] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/registrations/public/${slug}`)
      .then((response) => { if (active) setForm(response.data.data.form); })
      .catch((requestError) => { if (active) setError(apiError(requestError).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const registrationId = query.get('registration');
    const accountVerificationToken = query.get('verify');
    if (!registrationId || !accountVerificationToken) {
      try {
        const saved = sessionStorage.getItem(`training-account-setup:${slug}`);
        if (saved) {
          setAccountSetup(JSON.parse(saved));
          setAccountMode('setup');
          setSubmitted(true);
        }
      } catch {
        sessionStorage.removeItem(`training-account-setup:${slug}`);
      }
      return undefined;
    }
    let active = true;
    setVerifying(true);
    api.post(`/registrations/public/${slug}/verify-account`, { registrationId, accountVerificationToken })
      .then((response) => {
        sessionStorage.setItem(`training-account-setup:${slug}`, JSON.stringify(response.data.data));
        setAccountSetup(response.data.data);
        setAccountMode('setup');
        setSubmitted(true);
      })
      .catch((requestError) => { if (active) setVerificationError(apiError(requestError).message); })
      .finally(() => { if (active) setVerifying(false); });
    return () => { active = false; };
  }, [slug]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await api.post(`/registrations/public/${slug}`, values);
      setClaim({ ...response.data.data.registration, accountClaimToken: response.data.data.accountClaimToken });
      setSubmitted(true);
    } catch (requestError) { setError(apiError(requestError).message); }
    finally { setSaving(false); }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setError('');
    if (!claim) return;
    setAccountSaving(true);
    try {
      await api.post(`/registrations/public/${slug}/create-account`, {
        registrationId: claim.id,
        accountClaimToken: claim.accountClaimToken,
      });
      setAccountMode('verify');
    } catch (requestError) { setError(apiError(requestError).message); }
    finally { setAccountSaving(false); }
  };

  const completeAccount = async (event) => {
    event.preventDefault();
    setError('');
    if (accountDetails.password !== accountDetails.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!accountSetup) return;
    setAccountSaving(true);
    try {
      const response = await api.post(`/registrations/public/${slug}/complete-account`, {
        registrationId: accountSetup.registrationId,
        accountSetupToken: accountSetup.accountSetupToken,
        password: accountDetails.password,
      });
      sessionStorage.removeItem(`training-account-setup:${slug}`);
      navigate('/login', {
        replace: true,
        state: { email: accountSetup.email, from: { pathname: `/courses/${response.data.data.classId}` } },
      });
    } catch (requestError) { setError(apiError(requestError).message); }
    finally { setAccountSaving(false); }
  };

  const linkExistingAccount = async (event) => {
    event.preventDefault();
    if (!claim) return;
    setError('');
    setAccountSaving(true);
    try {
      await login(accountEmail.trim() || values.email, accountPassword);
      await api.post(`/registrations/public/${slug}/claim-account`, {
        registrationId: claim.id,
        accountClaimToken: claim.accountClaimToken,
      });
      navigate(`/courses/${form.classId}`, { replace: true });
    } catch (requestError) { setError(apiError(requestError).message); }
    finally { setAccountSaving(false); }
  };

  if (loading) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#fffaf5]"><Spinner size={28} /></main>;
  if (!form) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#fffaf5] px-4"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><h1 className="text-lg font-bold text-slate-900">Registration unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error || 'This registration link may have expired or the training may be closed.'}</p></div></main>;
  if (verifying) return <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#fffaf5] text-sm text-slate-600"><Spinner size={28} />Verifying your email…</main>;

  return <main className="min-h-[100dvh] bg-white px-4 py-8 sm:py-12">
    <section className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-2xl shadow-orange-950/[0.07]">
      <div className="h-1.5 bg-green-50" />
      {form.imageUrl && <img src={assetUrl(form.imageUrl)} alt="" className="h-44 w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      <div className="p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[10px] font-black text-white shadow-md shadow-orange-900/20">IC</div><div><p className="text-sm font-black text-slate-950">IshConnect</p><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700/80">QuickLink training registration</p></div></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-orange-100"><GraduationCap size={13} />Enrollment open</span>
        </div>
        <h1 className="break-words text-2xl font-black tracking-tight text-slate-950">{form.title}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{form.training}{form.subject ? ` · ${form.subject}` : ''}{form.level ? ` · ${form.level}` : ''}</p>
        {form.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{form.description}</p>}
        {verificationError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{verificationError}</div>}

        {submitted ? <div className="mt-6">
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 size={25} className="text-emerald-600" />
            <h2 className="mt-2 font-bold text-emerald-900">{accountSetup ? 'Email verified' : 'Registration received'}</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-800">{accountSetup ? `Your email is verified. Set a password to create your student account and enroll in ${form.classTitle}.` : `Thank you, ${values.name}. Your registration is linked to ${form.classTitle}. Create or link a student account to enroll and open your training.`}</p>
          </div>
          {claim && !accountMode && <div className="mt-4 grid gap-2 sm:grid-cols-2"><button className="btn-primary" onClick={() => setAccountMode('create')}><UserRoundPlus size={17} />Create my student account</button><button className="btn-secondary" onClick={() => setAccountMode('signin')}><Mail size={17} />I already have an account</button></div>}
          {claim && accountMode === 'create' && <form onSubmit={createAccount} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
            <h2 className="font-bold text-slate-900">Create your student account</h2>
            <p className="text-sm leading-6 text-slate-600">We will use <strong>{values.email}</strong> and email you a secure verification link. No education level or role selection is needed.</p>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            <div className="rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-5 text-brand-900"><ShieldCheck size={14} className="mr-1 inline" />The verification link expires in one hour. Check your spam folder if it does not arrive.</div>
            <button type="submit" className="btn-primary w-full" disabled={accountSaving}>{accountSaving ? <Spinner size={17} /> : <Mail size={17} />}{accountSaving ? 'Sending verification…' : 'Email me a verification link'}</button>
          </form>}
          {claim && accountMode === 'verify' && <div role="status" className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4"><h2 className="font-bold text-brand-950">Check your email</h2><p className="mt-1 text-sm leading-6 text-brand-800">We sent a secure verification link to {values.email}. Open it within one hour, then set a password to finish enrolling in {form.classTitle}.</p></div>}
          {accountSetup && accountMode === 'setup' && <form onSubmit={completeAccount} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
            <h2 className="font-bold text-slate-900">Set your student account password</h2>
            <p className="text-sm leading-6 text-slate-600">Email verified for <strong>{accountSetup.email}</strong>. Choose a password to create your account and enroll in {form.classTitle}.</p>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            <div><label className="label" htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className="input" value={accountDetails.password} onChange={(event) => setAccountDetails({ ...accountDetails, password: event.target.value })} /><p className="mt-1 text-xs text-slate-400">At least 10 characters.</p></div>
            <div><label className="label" htmlFor="account-confirm-password">Confirm password</label><input id="account-confirm-password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required className="input" value={accountDetails.confirmPassword} onChange={(event) => setAccountDetails({ ...accountDetails, confirmPassword: event.target.value })} /></div>
            <button type="submit" className="btn-primary w-full" disabled={accountSaving}>{accountSaving ? <Spinner size={17} /> : <LockKeyhole size={17} />}{accountSaving ? 'Creating account…' : 'Create account and enroll'}</button>
          </form>}
          {claim && accountMode === 'signin' && <form onSubmit={linkExistingAccount} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
            <h2 className="font-bold text-slate-900">Link your existing student account</h2>
            <p className="text-sm leading-6 text-slate-600">Sign in with the same email address used on this registration to enroll in {form.classTitle}.</p>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            <div><label className="label" htmlFor="existing-account-email">Account email</label><input id="existing-account-email" type="email" autoComplete="username" required className="input" value={accountEmail || values.email} onChange={(event) => setAccountEmail(event.target.value)} /></div>
            <div><label className="label" htmlFor="existing-account-password">Password</label><input id="existing-account-password" type="password" autoComplete="current-password" required className="input" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} /></div>
            <button type="submit" className="btn-primary w-full" disabled={accountSaving}>{accountSaving ? <Spinner size={17} /> : <LockKeyhole size={17} />}{accountSaving ? 'Signing in…' : 'Sign in and enroll'}</button>
          </form>}
        </div> : <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <div><label className="label" htmlFor="registration-name">Full name</label><input id="registration-name" autoComplete="name" className="input" required maxLength={120} minLength={2} placeholder={form.placeholders.name} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></div>
          <div><label className="label" htmlFor="registration-email">Email address</label><input id="registration-email" autoComplete="email" type="email" className="input" required maxLength={254} placeholder={form.placeholders.email} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></div>
          <div><label className="label" htmlFor="registration-whatsapp">WhatsApp number</label><input id="registration-whatsapp" autoComplete="tel" type="tel" className="input" required minLength={7} maxLength={40} placeholder={form.placeholders.whatsapp} value={values.whatsapp} onChange={(event) => setValues({ ...values, whatsapp: event.target.value })} /><p className="mt-1 text-xs text-slate-400">Include the country calling code so the administrator can contact you.</p></div>
          {form.fields.map((field) => <div key={field.key}><label className="label" htmlFor={field.key}>{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label><input id={field.key} className="input" required={field.required} maxLength={2000} placeholder={field.placeholder} value={values.answers[field.key] || ''} onChange={(event) => setValues({ ...values, answers: { ...values.answers, [field.key]: event.target.value } })} /></div>)}
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Your details are shared only with the training administrator to follow up about this training. Creating an account requires email verification and a password of at least 10 characters.</p>
          <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? <Spinner size={17} /> : <UserRoundPlus size={17} />}{saving ? 'Submitting…' : 'Register for training'}</button>
        </form>}
      </div>
    </section>
  </main>;
}
