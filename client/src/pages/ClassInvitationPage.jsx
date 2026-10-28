import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Check, Mail } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageLoader } from '../components/ui.jsx';

export default function ClassInvitationPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.post(`/classes/invitations/${token}/accept`).then((response) => {
      if (active) setDestination(response.data.data.sessionId
        ? `/classes/sessions/${response.data.data.sessionId}/live`
        : `/classes/${response.data.data.classId}`);
    }).catch((err) => { if (active) setError(apiError(err).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  if (destination) return <Navigate to={destination} replace />;
  if (loading) return <PageLoader label="Checking class invitation…" />;
  return <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">{error ? <Mail size={21} /> : <Check size={21} />}</div><h1 className="mt-4 text-lg font-semibold text-slate-900">Invitation unavailable</h1><p role="alert" className="mt-2 text-sm leading-6 text-slate-600">{error || 'Ask your teacher to send a new invitation.'}</p><a className="btn-primary mt-5" href="/classes">Go to classes</a></div>;
}
