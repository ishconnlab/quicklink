import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, GraduationCap, PlusCircle, Search, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import CourseThumbnail from '../components/CourseThumbnail.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

const paymentTone = { not_required: 'slate', unpaid: 'amber', pending: 'brand', paid: 'green', rejected: 'red', waived: 'green' };
const paymentLabel = { not_required: 'No payment', unpaid: 'Payment due', pending: 'Under review', paid: 'Paid', rejected: 'Needs attention', waived: 'Waived' };

function CourseCard({ course, admin }) {
  const action = admin ? 'Manage training' : course.enrolled ? 'Open training' : course.enrollmentStatus === 'open' ? 'View and enroll' : 'View details';
  const payment = course.enrollment?.payment;
  return <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
    <div className="relative aspect-[16/9] overflow-hidden">
      <CourseThumbnail imageUrl={course.thumbnailUrl} title={course.title} className="absolute inset-0 transition duration-300 group-hover:scale-[1.02]" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-green-50" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5"><Badge color="dark">{course.level}</Badge>{course.enrolled && <Badge color="green">Enrolled</Badge>}{!course.active && <Badge color="red">Archived</Badge>}</div>
      <p className="absolute bottom-3 left-3 text-xs font-semibold text-white/90">{course.subject}</p>
    </div>
    <div className="flex flex-1 flex-col p-4 sm:p-5">
      <h2 className="break-words text-base font-bold leading-6 text-slate-950">{course.title}</h2>
      <p className="mt-1.5 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-slate-500">{course.introduction || course.description || 'Open the training to review its schedule, requirements, and outcomes.'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Users size={13} />{course.enrolledCount}{course.maxStudents ? ` / ${course.maxStudents}` : ''} enrolled</span>
        {course.startsAt && <span className="inline-flex items-center gap-1"><CalendarClock size={13} />{formatDateTime(course.startsAt)}</span>}
        {course.payment?.enabled && <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Wallet size={13} />{formatMoney(course.payment.amount, course.payment.currency)}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {admin ? <>
          <Badge color={course.active ? (course.published ? 'green' : 'amber') : 'slate'}>{course.active ? (course.published ? 'Published' : 'Draft') : 'Archived'}</Badge>
          <Badge color={course.enrollmentOpen ? 'brand' : 'slate'}>{course.enrollmentOpen ? 'Enrollment open' : 'Enrollment closed'}</Badge>
          {course.payment?.enabled && <Badge color="amber">Paid training</Badge>}
        </> : payment ? <Badge color={paymentTone[payment.status] || 'slate'}>{paymentLabel[payment.status] || payment.status}</Badge> : null}
      </div>
      <div className="mt-auto pt-4"><Link to={admin ? `/courses/${course.id}/edit` : `/courses/${course.id}`} className={admin ? 'btn-secondary w-full' : 'btn-primary w-full'}>{action}<ArrowRight size={15} /></Link></div>
    </div>
  </article>;
}

export default function CoursesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [filters, setFilters] = useState({ search: '', level: '', subject: '', sort: 'newest' });
  const [result, setResult] = useState({ courses: [], subjects: [], trades: [], page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
      const response = await api.get('/courses', { params: { ...query, ...(admin ? { manage: true } : {}), page, limit: 12 } });
      setResult(response.data.data);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [filters, admin, toast]);

  useEffect(() => {
    const timer = setTimeout(() => load(1), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return <div>
    <PageHeader
      eyebrow={admin ? 'Training operations' : 'Training catalog'}
      title={admin ? 'Trainings' : 'Explore trainings'}
      subtitle={admin ? 'Create, publish, schedule, and manage every IshConnect training.' : 'Choose a program, enroll, and follow your path to a verified certificate.'}
      actions={admin ? <Link to="/courses/new" className="btn-primary"><PlusCircle size={17} />New training</Link> : <Link to="/classes" className="btn-secondary">My live classes</Link>}
    />

    <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-900/[0.03] sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><SlidersHorizontal size={14} className="text-brand-700" />Refine results</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2 lg:col-span-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="input pl-9" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search trainings" aria-label="Search trainings" /></label>
        <select className="input" value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })} aria-label="Filter by level"><option value="">All levels</option>{['Bootcamp', 'Training'].map((level) => <option key={level}>{level}</option>)}</select>
        <select className="input" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} aria-label="Filter by subject"><option value="">All subjects</option>{result.subjects.map((subject) => <option key={subject}>{subject}</option>)}</select>
        <select className="input" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })} aria-label="Sort trainings"><option value="newest">Recently updated</option><option value="title">Title A–Z</option><option value="popular">Most enrolled</option><option value="level">Level</option></select>
      </div>
      <p className="mt-2 text-xs text-slate-400">{result.total} training{result.total === 1 ? '' : 's'} found{admin ? ' · archived and draft trainings included' : ''}</p>
    </div>

    {loading ? <PageLoader label="Loading trainings…" /> : !result.courses.length ? <EmptyState icon={GraduationCap} title="No trainings found" description={admin ? 'Create the first training or adjust your filters.' : 'Try changing your search or filters.'} action={admin ? <Link to="/courses/new" className="btn-primary">Create training</Link> : null} /> : <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{result.courses.map((course) => <CourseCard key={course.id} course={course} admin={admin} />)}</div>
      {result.pages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={result.page <= 1} onClick={() => load(result.page - 1)}>Previous</button><span className="text-sm text-slate-500">Page {result.page} of {result.pages}</span><button className="btn-secondary" disabled={result.page >= result.pages} onClick={() => load(result.page + 1)}>Next</button></div>}
    </>}
  </div>;
}
