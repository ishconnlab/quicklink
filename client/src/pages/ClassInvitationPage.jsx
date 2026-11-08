import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
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
    }).catch((requestError) => { if (active) setError(apiError(requestError).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (destination) return <Navigate to={destination} replace />;
  if (loading) return <PageLoader label="Checking class invitation…" />;
  return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
    <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-brand-700'}`}>{error ? <Mail size={22} /> : <Check size={22} />}</span>
    <h1 className="mt-4 text-lg font-bold text-slate-900">Invitation unavailable</h1>
    <p role="alert" className="mt-2 text-sm leading-6 text-slate-600">{error || 'Sign in with the invited student account, or ask your training administrator to send a new invitation.'}</p>
    <Link to="/classes" className="btn-primary mt-5">Go to live classes</Link>
  </div>;
}
