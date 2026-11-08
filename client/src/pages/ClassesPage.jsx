import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Clock3, GraduationCap, Radio,
  Search, Users, Video, Wallet,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import CourseThumbnail from '../components/CourseThumbnail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

const paymentTone = { paid: 'green', waived: 'green', pending: 'brand', rejected: 'red', unpaid: 'amber', not_required: 'slate' };

export default function ClassesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const admin = isAdmin(user);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/classes', { params: { ...(includeArchived ? { includeArchived: true } : {}), page, limit: 12 } });
      setClasses(response.data.data.classes);
      setPages(response.data.data.pages || 1);
      setTotal(response.data.data.total || 0);
      setStale(false);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [includeArchived, page, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!classes.some((item) => item.liveSession)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.get('/classes', { params: { ...(includeArchived ? { includeArchived: true } : {}), page, limit: 12 } });
        setClasses(response.data.data.classes);
        setStale(false);
      } catch { setStale(true); }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [classes, includeArchived, page]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return classes;
    return classes.filter((item) => `${item.title} ${item.course || ''} ${item.subject} ${item.level} ${item.schedule || ''}`.toLowerCase().includes(term));
  }, [classes, search]);

  const liveCount = classes.filter((item) => item.liveSession).length;
  const paymentDue = classes.filter((item) => !admin && item.paymentState && !item.paymentState.allowed).length;
  const activeCount = classes.filter((item) => item.active).length;

  return <div>
    <PageHeader
      eyebrow={admin ? 'Live operations' : 'Your classroom'}
      title={admin ? 'Live classes' : 'My live classes'}
      subtitle={admin ? 'Start sessions, take attendance, send invitations, and review classroom reports. Training setup and enrollment live under Trainings.' : 'Join trainer-led sessions, track your attendance, and review previous class reports. Payment access is checked before joining media.'}
      actions={admin ? <><button className="btn-secondary" onClick={() => setIncludeArchived((value) => !value)}>{includeArchived ? 'Hide archived' : 'Show archived'}</button><Link to="/courses/new" className="btn-primary"><GraduationCap size={17} />New training</Link></> : <Link to="/courses" className="btn-secondary"><GraduationCap size={17} />Browse trainings</Link>}
    />

    <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <StatCard label={admin ? 'Active classes' : 'My classes'} value={total} icon={Video} accent="brand" hint={includeArchived && admin ? 'Including archived' : 'Ready for live sessions'} />
      <StatCard label="Live now" value={liveCount} icon={Radio} accent={liveCount ? 'red' : 'slate'} hint={liveCount ? 'Sessions in progress' : 'No session in progress'} />
      {admin ? <StatCard label="On this page" value={classes.length} icon={Users} accent="purple" hint={`${activeCount} active`} /> : <StatCard label="Payment blocks" value={paymentDue} icon={Wallet} accent={paymentDue ? 'amber' : 'green'} hint={paymentDue ? 'Action needed' : 'Full access'} />}
      <StatCard label="Schedule" value={classes.find((item) => item.startsAt) ? formatDateTime(classes.find((item) => item.startsAt).startsAt).split(',')[0] : 'Flexible'} icon={CalendarClock} accent="green" hint="See each class for details" />
    </div>

    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="relative block"><span className="sr-only">Search classes</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by training, subject, level, or schedule" /></label>
      <button className="btn-secondary" onClick={load} disabled={loading}>{loading ? <Spinner size={16} /> : null}Refresh</button>
    </div>

    {stale && <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Live status could not refresh. Showing the last known state.</p>}

    {loading && !classes.length ? <PageLoader label="Loading live classes…" /> : filtered.length === 0 ? <EmptyState icon={Video} title={classes.length ? 'No matching classes' : 'No live classes yet'} description={classes.length ? 'Try a different search term.' : admin ? 'Classes appear here when students are enrolled in a training. Create or open a training to manage its classroom.' : 'Enroll in a training to open its live classroom.'} action={!classes.length && (admin ? <Link to="/courses" className="btn-primary">Manage trainings</Link> : <Link to="/courses" className="btn-primary">Browse trainings</Link>)} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((item) => {
        const blocked = !admin && item.paymentState && !item.paymentState.allowed;
        const unpaid = !admin && item.enrollment?.payment && !['paid', 'waived', 'not_required'].includes(item.enrollment.payment.status);
        return <article key={item.id} className={`group overflow-hidden rounded-2xl border bg-white shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:shadow-md ${item.liveSession ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200/80'}`}>
          <Link to={`/classes/${item.id}`} className="block"><div className="relative"><CourseThumbnail imageUrl={item.thumbnailUrl} title={item.title} className="aspect-[16/8]" />{item.liveSession && <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live now</span>}{!item.active && <span className="absolute left-3 top-3"><Badge color="slate">Archived</Badge></span>}</div></Link>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><Link to={`/classes/${item.id}`} className="block truncate font-bold text-slate-900 group-hover:text-brand-800">{item.title}</Link><p className="mt-0.5 truncate text-xs text-slate-400">{item.course || item.subject} · {item.level}</p></div><Badge color="brand">{item.level}</Badge></div>
            <div className="mt-3 space-y-1.5 text-xs text-slate-500">
              <p className="flex items-center gap-1.5"><Users size={13} />{item.enrolledCount} enrolled{item.maxStudents ? ` of ${item.maxStudents}` : ''}</p>
              {item.startsAt && <p className="flex items-center gap-1.5"><CalendarClock size={13} />Starts {formatDateTime(item.startsAt)}</p>}
              {item.schedule && <p className="flex items-center gap-1.5"><Clock3 size={13} /><span className="truncate">{item.schedule}</span></p>}
              {blocked && <p className="flex items-center gap-1.5 font-semibold text-amber-700"><AlertCircle size={13} />Payment required from day {(item.payment?.freeDays ?? 2) + 1}</p>}
              {!blocked && unpaid && item.enrollment?.payment?.status === 'pending' && <p className="flex items-center gap-1.5 text-brand-700"><Wallet size={13} />Payment under review</p>}
              {!blocked && unpaid && item.enrollment?.payment?.status === 'unpaid' && <p className="flex items-center gap-1.5 text-slate-500"><Wallet size={13} />Payment due · {formatMoney(item.payment?.amount, item.payment?.currency)}</p>}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-semibold text-slate-500">{item.liveSession ? 'Classroom is live' : item.recentSession ? 'No live session' : 'Waiting for trainer'}</span>
              <Link to={`/classes/${item.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900">{admin ? 'Manage class' : blocked ? 'Resolve payment' : 'Open class'}<ArrowRight size={13} /></Link>
            </div>
          </div>
        </article>;
      })}
    </div>}

    {pages > 1 && <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Class pagination"><button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />Previous</button><span className="text-sm text-slate-500">Page {page} of {pages}</span><button className="btn-secondary" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={16} /></button></nav>}

    {!admin && paymentDue > 0 && <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"><Wallet size={15} className="mt-0.5 shrink-0" />Some classes require payment before live media unlocks. Open the class or its training page to submit a payment reference.</p>}
  </div>;
}
