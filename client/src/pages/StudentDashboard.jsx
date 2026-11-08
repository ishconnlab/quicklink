import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Award, CalendarClock, CheckCircle2, Clock3, CreditCard, FileCheck2, GraduationCap, Radio, Sparkles, Video } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, ProgressBar, SectionHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';

const paymentLabel = { not_required: 'No payment', unpaid: 'Payment due', pending: 'Under review', paid: 'Paid', rejected: 'Needs attention', waived: 'Waived' };
const paymentTone = { not_required: 'slate', unpaid: 'amber', pending: 'brand', paid: 'green', rejected: 'red', waived: 'green' };

export default function StudentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, courses: [], certificates: [], classes: [], completion: {} });

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/courses', { params: { enrolled: true, limit: 100 } }),
      api.get('/certificates/mine'),
      api.get('/classes', { params: { limit: 50 } }),
    ]).then(async ([coursesResponse, certificatesResponse, classesResponse]) => {
      const courses = coursesResponse.data.data.courses;
      const completionPairs = await Promise.all(courses.map(async (course) => {
        try {
          const result = await api.get(`/courses/${course.id}/completion`);
          return [course.id, result.data.data];
        } catch {
          return [course.id, null];
        }
      }));
      if (!active) return;
      setState({
        loading: false,
        courses,
        certificates: certificatesResponse.data.data.certificates,
        classes: classesResponse.data.data.classes || [],
        completion: Object.fromEntries(completionPairs),
      });
    }).catch((error) => {
      if (!active) return;
      toast.error(apiError(error).message);
      setState((current) => ({ ...current, loading: false }));
    });
    return () => { active = false; };
  }, [toast]);

  if (state.loading) return <PageLoader label="Preparing your learning workspace…" />;

  const firstName = user?.name?.split(' ')[0] || 'there';
  const liveClasses = state.classes.filter((item) => item.liveSession);
  const upcoming = state.classes.filter((item) => !item.liveSession && item.startsAt && new Date(item.startsAt) > new Date()).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 4);
  const paymentDue = state.courses.filter((course) => course.enrollment?.payment && !course.enrollment.payment.allowed).length;
  const validCertificates = state.certificates.filter((certificate) => !certificate.revoked);
  const completedTrainings = Object.values(state.completion).filter((item) => item?.eligible).length;

  const progressFor = (course) => {
    const completion = state.completion[course.id];
    if (!completion?.checks?.length) return 0;
    return Math.round(completion.checks.filter((check) => check.complete).length / completion.checks.length * 100);
  };

  return <div>
    <PageHeader
      eyebrow="Student workspace"
      title={`Welcome back, ${firstName}`}
      subtitle="Your trainings, live sessions, projects, assessments, and certificates are all in one place."
      actions={<><Link to="/courses" className="btn-secondary">Explore trainings</Link><Link to="/classes" className="btn-primary"><Video size={16} />My live classes</Link></>}
    />

    {paymentDue > 0 && <Link to="/courses" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-green-50 p-4 transition hover:border-amber-300">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><CreditCard size={19} /></span><div><p className="text-sm font-bold text-amber-950">{paymentDue} training{paymentDue === 1 ? '' : 's'} need payment attention</p><p className="text-xs text-amber-700">Submit your payment reference to keep accessing live classes.</p></div></div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800">Review <ArrowRight size={15} /></span>
    </Link>}

    <section className="mb-7">
      <SectionHeader title="Your snapshot" description="A quick view of your current learning." icon={Sparkles} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active trainings" value={state.courses.length} icon={GraduationCap} hint="Enrolled and in progress" />
        <StatCard label="Live now" value={liveClasses.length} icon={Radio} accent="red" hint={liveClasses.length ? 'Join from My live classes' : 'No sessions live'} />
        <StatCard label="Completed" value={completedTrainings} icon={CheckCircle2} accent="green" hint="Requirements fully met" />
        <StatCard label="Certificates" value={validCertificates.length} icon={Award} accent="amber" hint="Valid and shareable" />
      </div>
    </section>

    <section className="mb-8">
      <SectionHeader title="Continue your trainings" description="Pick up where you left off." action={<Link to="/courses" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Browse all <ArrowRight size={15} /></Link>} icon={GraduationCap} />
      {state.courses.length ? <div className="grid gap-4 md:grid-cols-2">
        {state.courses.map((course) => {
          const progress = progressFor(course);
          const payment = course.enrollment?.payment;
          return <article key={course.id} className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1 bg-green-50" />
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2"><Badge color="brand">{course.level}</Badge><Badge>{course.subject}</Badge>{liveClasses.some((item) => item.id === course.id) && <Badge color="red">Live now</Badge>}</div>
              <h3 className="mt-3 break-words text-base font-bold leading-6 text-slate-950">{course.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">{course.introduction || course.description || 'Open the training to see your requirements and next step.'}</p>
              <div className="mt-4"><div className="mb-1.5 flex items-center justify-between text-xs text-slate-500"><span>Requirements completed</span><span className="font-semibold text-slate-700">{progress}%</span></div><ProgressBar value={progress} /></div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge color={paymentTone[payment?.status] || 'slate'}>{payment ? paymentLabel[payment.status] || payment.status : 'No payment'}</Badge>
                {course.startsAt && <span className="inline-flex items-center gap-1 text-slate-500"><CalendarClock size={13} />{formatDateTime(course.startsAt)}</span>}
                {payment?.required && <span className="font-semibold text-amber-700">{formatMoney(payment.amount, payment.currency)} due</span>}
              </div>
              <div className="mt-4 flex gap-2"><Link to={`/courses/${course.id}`} className="btn-primary flex-1">Open training</Link><Link to={`/classes/${course.id}`} className="btn-secondary"><Video size={16} />Classroom</Link></div>
            </div>
          </article>;
        })}
      </div> : <EmptyState icon={GraduationCap} title="You are not enrolled yet" description="Browse the training catalog and enroll in a program that fits your goals." action={<Link to="/courses" className="btn-primary">Browse trainings</Link>} />}
    </section>

    <div className="mb-8 grid gap-5 lg:grid-cols-2">
      <section>
        <SectionHeader title="Live and upcoming" description="Sessions from your trainings." icon={Radio} action={<Link to="/classes" className="text-sm font-semibold text-brand-700">View classes</Link>} />
        {liveClasses.length || upcoming.length ? <div className="space-y-2">
          {liveClasses.slice(0, 3).map((item) => <Link key={item.id} to={`/classes/sessions/${item.liveSession.id}/live`} className="flex items-center gap-3 rounded-2xl border border-red-200 bg-green-50 p-4 transition hover:border-red-300"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><Radio size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{item.liveSession.title || item.title}</span><span className="block text-xs text-red-700">Live now · join your class</span></span><ArrowRight size={16} className="text-red-500" /></Link>)}
          {upcoming.map((item) => <Link key={item.id} to={`/classes/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-green-200"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-brand-700"><CalendarClock size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{item.title}</span><span className="block text-xs text-slate-500">{formatDateTime(item.startsAt)}{item.schedule ? ` · ${item.schedule}` : ''}</span></span><ArrowRight size={16} className="text-slate-300" /></Link>)}
        </div> : <EmptyState icon={CalendarClock} title="No sessions scheduled" description="Your trainer will announce live classes here." />}
      </section>

      <section>
        <SectionHeader title="Certificates" description="Your verified achievements." icon={Award} action={validCertificates.length > 0 ? <Link to="/certificates" className="text-sm font-semibold text-brand-700">Open certificates</Link> : null} />
        {validCertificates.length ? <div className="space-y-2">{validCertificates.slice(0, 3).map((certificate) => <Link key={certificate.id} to="/certificates" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-green-200"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Award size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{certificate.courseTitle}</span><span className="block text-xs text-slate-500">{certificate.level} · Issued {formatDateTime(certificate.issuedAt)}</span></span><FileCheck2 size={16} className="text-emerald-600" /></Link>)}</div> : <EmptyState icon={Award} title="No certificates yet" description="Complete your training requirements to unlock your certificate." />}
      </section>
    </div>

    <section className="rounded-2xl border border-green-100 bg-green-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-green-100"><Clock3 size={20} /></span><div><p className="font-bold text-slate-900">Keep your streak going</p><p className="text-sm text-slate-500">Check your requirements before each session so nothing blocks your certificate.</p></div></div><Link to="/courses" className="btn-secondary">Review requirements <ArrowRight size={15} /></Link></div>
    </section>
  </div>;
}
