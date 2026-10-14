import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center">
      <Compass size={44} className="text-slate-300" />
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="btn-primary mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}
