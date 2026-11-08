import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldCheck } from 'lucide-react';
import { PublicShell, PageHeading } from '../components/PublicSiteLayout.jsx';

export default function CertificateLookupPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const submit = (event) => {
    event.preventDefault();
    const clean = code.trim();
    if (/^[A-Za-z0-9_-]{32}$/.test(clean)) navigate(`/verify/${clean}`);
    else setCode(clean);
  };
  return <PublicShell title="Verify a QuickLink Certificate | IshConnect" description="Enter the verification code printed on a QuickLink certificate to view its current public status." path="/verify" noIndex>
    <PageHeading eyebrow="Public certificate record" title="Verify a certificate" description="Use the 32-character verification code shown on the certificate. This page only displays information for the code you submit." />
    <form onSubmit={submit} className="max-w-xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
      <label htmlFor="certificate-code" className="mb-2 block text-sm font-semibold text-slate-800">Certificate verification code</label>
      <input id="certificate-code" className="min-h-12 w-full border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/20" value={code} onChange={(event) => setCode(event.target.value)} minLength={32} maxLength={32} pattern="[A-Za-z0-9_-]{32}" required autoComplete="off" />
      <p className="mt-2 text-xs leading-5 text-slate-500">Enter the full code from the certificate. Do not include spaces.</p>
      <button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800"><Search size={16} />Verify certificate</button>
    </form>
  </PublicShell>;
}
