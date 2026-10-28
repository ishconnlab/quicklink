import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Badge } from '../components/layout.jsx';
import { PageLoader } from '../components/ui.jsx';
import api from '../api/client.js';

export default function CertificateVerifyPage() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, result: null });
  useEffect(() => {
    api.get(`/certificates/verify/${code}`).then((response) => setState({ loading: false, result: response.data.data })).catch((error) => setState({ loading: false, result: error.response?.data?.data || { valid: false, status: 'unavailable' } }));
  }, [code]);
  if (state.loading) return <PageLoader label="Verifying certificate…" />;
  const result = state.result;
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"><section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="mb-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">QL</div><div><p className="font-bold text-slate-900">QuickLink</p><p className="text-xs text-slate-500">Certificate verification</p></div></div><Badge color={result?.valid ? 'green' : 'red'}>{result?.valid ? 'Authentic certificate' : result?.status === 'revoked' ? 'Certificate revoked' : 'Certificate not found'}</Badge>{result?.valid && <><h1 className="mt-4 text-xl font-bold text-slate-900">{result.courseTitle}</h1><p className="mt-2 text-sm text-slate-600">Awarded to <strong>{result.studentName}</strong></p><p className="mt-1 text-sm text-slate-600">{result.level} · Issued {new Date(result.issuedAt).toLocaleDateString()}</p><p className="mt-4 break-all text-xs text-slate-400">Certificate ID: {result.certificateId}</p></>}<Link to="/login" className="btn-secondary mt-6">Go to QuickLink</Link></section></main>;
}
