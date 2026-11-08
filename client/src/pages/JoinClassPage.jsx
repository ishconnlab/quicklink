import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Radio, Video } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function JoinClassPage() {
  const { sessionCode } = useParams();
  const toast = useToast();
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get(`/classes/join/${sessionCode}`).then((response) => {
      if (active) setSessionId(response.data.data.session.id);
    }).catch((requestError) => {
      if (active) setError(apiError(requestError).message);
      toast.error(apiError(requestError).message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionCode, toast]);

  if (loading) return <PageLoader label="Checking class link…" />;
  if (sessionId) return <Navigate to={`/classes/sessions/${sessionId}/live`} replace />;
  return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-brand-700"><Radio size={22} /></span>
    <h1 className="mt-4 text-lg font-bold text-slate-900">This class link is unavailable</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{error || 'The session may have ended, or your account may not be enrolled in this training.'} Ask the training administrator for a current link and make sure you are signed in with your enrolled student account.</p>
    <Link to="/classes" className="btn-primary mt-5"><Video size={16} />Go to live classes</Link>
  </div>;
}
