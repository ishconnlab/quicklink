import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Award, CalendarDays, CheckCircle2, GraduationCap, ShieldCheck, ShieldX, Share2 } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge } from '../components/layout.jsx';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate } from '../lib/format.js';

export default function CertificateVerifyPage() {
  const { code } = useParams();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, result: null, error: '' });

  useEffect(() => {
    let active = true;
    api.get(`/certificates/verify/${code}`)
      .then((response) => { if (active) setState({ loading: false, result: response.data.data, error: '' }); })
      .catch((error) => {
        if (!active) return;
        const result = error.response?.data?.data || null;
        setState({ loading: false, result, error: result ? '' : apiError(error).message });
      });
    return () => { active = false; };
  }, [code]);

  if (state.loading) return <main className="flex min-h-[100dvh] items-center justify-center bg-white"><PageLoader label="Verifying certificate…" /></main>;

  const result = state.result;
  const valid = Boolean(result?.valid);
  const revoked = result?.status === 'revoked';
  const share = async () => {
    const url = `${window.location.origin}${result?.verificationPath || `/verify/${code}`}`;
    try {
      if (navigator.share) await navigator.share({ title: `${result?.courseTitle || 'IshConnect'} certificate`, text: `Verify this IshConnect certificate awarded to ${result?.studentName || 'a learner'}`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Verification link copied.'); }
    } catch (error) { if (error.name !== 'AbortError') toast.error('Could not share the verification link.'); }
  };

  return <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-white px-4 py-10 sm:py-16">
    <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
    <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
    <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-orange-100 bg-white shadow-2xl shadow-orange-950/[0.08]">
      <div className={`h-1.5 ${valid ? 'bg-brand-600' : revoked ? 'bg-red-600' : 'bg-slate-300'}`} />
      <div className="p-6 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-xs font-black text-white shadow-lg shadow-orange-900/20 ring-1 ring-white/25">IC</div><div><p className="text-sm font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-700/80">QuickLink Learning Portal</p></div></div>
          <Badge color={valid ? 'green' : revoked ? 'red' : 'slate'}>{valid ? 'Authentic certificate' : revoked ? 'Revoked certificate' : 'Not found'}</Badge>
        </div>

        {valid ? <>
          <div className="mt-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-green-50 text-brand-700 ring-1 ring-orange-100"><Award size={30} /></span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Certificate of completion</p>
            <h1 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{result.courseTitle}</h1>
            <p className="mt-4 text-sm text-slate-500">This certifies that</p>
            <p className="mt-1 break-words text-xl font-bold text-brand-800 sm:text-2xl">{result.studentName}</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">has successfully completed the training and met all certification requirements through the IshConnect QuickLink Learning Portal.</p>
          </div>
          <dl className="mt-7 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Level</dt><dd className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-800"><GraduationCap size={14} className="text-brand-700" />{result.level}</dd></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Issued</dt><dd className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-800"><CalendarDays size={14} className="text-brand-700" />{formatDate(result.issuedAt)}</dd></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Issuer</dt><dd className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-800"><ShieldCheck size={14} className="text-brand-700" />{result.issuer || 'IshConnect'}</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-xs leading-5 text-emerald-800"><CheckCircle2 size={14} className="mr-1 inline" />This verification confirms the certificate code exists and has not been revoked. Certificate ID: <span className="break-all font-mono font-semibold">{result.certificateId}</span></div>
        </> : <div className="mt-10 text-center">
          <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl ${revoked ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{revoked ? <ShieldX size={30} /> : <ShieldX size={30} />}</span>
          <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{revoked ? 'This certificate was revoked' : 'Certificate not found'}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{revoked ? 'The certificate record exists but is no longer valid. Contact the training administrator or IshConnect for assistance.' : state.error || 'No certificate matches this verification code. Check the link or QR code and try again.'}</p>
          {revoked && result?.courseTitle && <p className="mt-4 text-sm text-slate-500">{result.studentName} · {result.courseTitle}</p>}
          {revoked && result?.revocationReason && <p className="mx-auto mt-3 max-w-md rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800">Reason: {result.revocationReason}</p>}
        </div>}

        <div className="mt-8 flex flex-wrap justify-center gap-2 border-t border-slate-100 pt-5">
          {(valid || revoked) && <button className="btn-primary" onClick={share}><Share2 size={16} />Share verification</button>}
          <Link to="/login" className="btn-secondary">{valid ? 'Open QuickLink' : 'Go to sign in'}<ArrowRight size={15} /></Link>
        </div>
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">Always verify certificates through an official IshConnect / QuickLink verification link. A downloaded PDF alone is not proof of validity.</p>
      </div>
    </section>
  </main>;
}
