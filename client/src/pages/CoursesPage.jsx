import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, Search, Users } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function CourseCard({ course }) {
  const action = course.enrolled ? 'Continue Learning' : course.enrollmentStatus === 'open' ? 'View Course' : 'View Details';
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-brand-700 to-sky-600">
      {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt={`Cover for ${course.title}`} loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="flex h-full items-center justify-center text-white/90"><GraduationCap size={42} aria-hidden="true" /></div>}
      <div className="absolute left-3 top-3 flex gap-2"><Badge color="brand">{course.level}</Badge>{course.enrolled && <Badge color="green">Enrolled</Badge>}</div>
    </div>
    <div className="flex flex-1 flex-col p-4"><div className="mb-2 flex flex-wrap gap-1.5"><Badge>{course.subject}</Badge>{course.trade && <Badge color="slate">{course.trade}</Badge>}</div>
      <h2 className="break-words text-base font-bold leading-6 text-slate-900">{course.title}</h2>
      <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-slate-600">{course.introduction || course.description || 'Open the course to review its learning objectives and materials.'}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Users size={14} /><span className="truncate">{course.teachers?.map((teacher) => teacher.name).join(', ') || course.teacher?.name || 'QuickLink instructor'}</span></div>
      {course.enrolled && <div className="mt-3"><div className="flex justify-between text-xs text-slate-500"><span>Reading progress</span><span>{course.readingProgress || 0}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${course.readingProgress || 0}%` }} /></div></div>}
      <div className="mt-auto pt-4"><Link to={`/courses/${course.id}`} className="btn-primary w-full">{action}</Link></div>
    </div>
  </article>;
}

export default function CoursesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [filters, setFilters] = useState({ search: '', level: user?.educationLevel || '', subject: '', trade: '' });
  const [result, setResult] = useState({ courses: [], subjects: [], trades: [], page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
      const response = await api.get('/courses', { params: { ...query, page, limit: 12 } });
      setResult(response.data.data);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [load]);
  return <div><PageHeader title="Courses" subtitle="Explore published courses and continue your training." />
    <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative sm:col-span-2 lg:col-span-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="input pl-9" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search courses" aria-label="Search courses" /></label>
      <select className="input" value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })} aria-label="Filter by course level"><option value="">All levels</option>{['L3', 'L4', 'L5', 'Bootcamp', 'Training'].map((level) => <option key={level}>{level}</option>)}</select>
      <select className="input" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} aria-label="Filter by subject"><option value="">All subjects</option>{result.subjects.map((subject) => <option key={subject}>{subject}</option>)}</select>
      <select className="input" value={filters.trade} onChange={(event) => setFilters({ ...filters, trade: event.target.value })} aria-label="Filter by trade"><option value="">All trades</option>{result.trades.map((trade) => <option key={trade}>{trade}</option>)}</select>
    </div>
    {loading ? <PageLoader label="Loading published courses…" /> : !result.courses.length ? <EmptyState icon={BookOpen} title="No courses found" description="Try changing your search or filters." /> : <><div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{result.courses.map((course) => <CourseCard key={course.id} course={course} />)}</div>
      {result.pages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={result.page <= 1} onClick={() => load(result.page - 1)}>Previous</button><span className="text-sm text-slate-500">Page {result.page} of {result.pages}</span><button className="btn-secondary" disabled={result.page >= result.pages} onClick={() => load(result.page + 1)}>Next</button></div>}</>}
  </div>;
}
