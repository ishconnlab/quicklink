import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Radio } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function JoinClassPage() {
  const { sessionCode } = useParams();
  const toast = useToast();
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.get(`/classes/join/${sessionCode}`).then((response) => {
      if (active) setSessionId(response.data.data.session.id);
    }).catch((error) => toast.error(apiError(error).message)).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionCode]);
  if (loading) return <PageLoader label="Checking class link…" />;
  return sessionId ? <Navigate to={`/classes/sessions/${sessionId}/live`} replace /> : <div className="mx-auto mt-16 max-w-md text-center"><Radio size={34} className="mx-auto text-slate-300" /><h1 className="mt-3 text-lg font-semibold text-slate-800">This class link is unavailable</h1><p className="mt-1 text-sm text-slate-500">Ask your teacher for the current link and make sure you are signed in with an enrolled student account.</p></div>;
}
