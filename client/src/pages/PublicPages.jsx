import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, Code2, GraduationCap, Laptop, Search, ShieldCheck, Users, Video } from 'lucide-react';
import api, { apiError, assetUrl } from '../api/client.js';
import { PublicShell, PageHeading } from '../components/PublicSiteLayout.jsx';
import { SITE_URL, ORGANIZATION_SCHEMA } from '../components/SeoMeta.jsx';
import { formatDate } from '../lib/format.js';

const defaultDescription = 'Learn technology with IshConnect through practical online training, learning resources, live classes, assignments and assessments. Explore programmes published on QuickLink.';
const buttonPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800';
const buttonSecondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:border-green-700 hover:text-green-800';
const sectionTitle = 'text-xl font-bold tracking-tight text-slate-950';
const bodyText = 'text-sm leading-7 text-slate-600';

function programmeUrl(programme) { return `/programmes/${programme.slug}`; }

function useProgrammes() {
  const [state, setState] = useState({ programmes: [], loading: true, error: '' });
  useEffect(() => {
    let current = true;
    api.get('/public/programmes', { params: { limit: 60 } })
      .then((response) => { if (current) setState({ programmes: response.data.data.programmes || [], loading: false, error: '' }); })
      .catch((error) => { if (current) setState({ programmes: [], loading: false, error: apiError(error).message }); });
    return () => { current = false; };
  }, []);
  return state;
}

function ProgrammeCard({ programme }) {
  return <article className="flex h-full flex-col border border-slate-200 bg-white">
    {programme.thumbnailUrl && <Link to={programmeUrl(programme)} aria-label={`View ${programme.title}`}><img src={assetUrl(programme.thumbnailUrl)} alt={`${programme.title} training`} loading="lazy" className="aspect-[16/8] w-full bg-green-50 object-cover" /></Link>}
    <div className="flex flex-1 flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-green-800">{programme.subject}{programme.level ? ` · ${programme.level}` : ''}</p>
      <h2 className="mt-2 text-lg font-bold leading-6 text-slate-950"><Link className="hover:text-green-800" to={programmeUrl(programme)}>{programme.title}</Link></h2>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{programme.introduction || programme.description || `Review the verified programme details and requirements for ${programme.title}.`}</p>
      {programme.startsAt && <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500"><CalendarDays size={14} />Starts {formatDate(programme.startsAt)}</p>}
      <Link to={programmeUrl(programme)} className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-green-800">Programme details <ArrowRight size={15} /></Link>
    </div>
  </article>;
}

function PublicHomePage() {
  const { programmes, loading } = useProgrammes();
  const featured = programmes.slice(0, 3);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { ...ORGANIZATION_SCHEMA, '@id': `${SITE_URL}/#ishconnect`, description: 'IshConnect operates QuickLink, its online learning platform.' },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: 'QuickLink by IshConnect', inLanguage: 'en', publisher: { '@id': `${SITE_URL}/#ishconnect` }, potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/programmes?search={search_term_string}`, 'query-input': 'required name=search_term_string' } },
    ],
  };
  return <PublicShell title="QuickLink by IshConnect | Online Learning & Tech Training" description={defaultDescription} path="/" jsonLd={jsonLd}>
    <section className="grid items-center gap-10 border-b border-slate-200 pb-12 md:grid-cols-[1.2fr_0.8fr] md:pb-16">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-green-800">Online technology learning · Kigali, Rwanda</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">Learn Technology. Build Real Skills. Create Your Future.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">QuickLink is IshConnect's online learning platform. Explore published technology programmes, study course materials, join live classes, complete practical work and track your progress in one place.</p>
        <div className="mt-7 flex flex-wrap gap-3"><Link to="/programmes" className={buttonPrimary}>Explore programmes <ArrowRight size={16} /></Link><Link to="/how-learning-works" className={buttonSecondary}>How learning works</Link></div>
        <p className="mt-4 text-sm text-slate-500">Operated by <a className="font-semibold text-green-800 underline-offset-2 hover:underline" href="https://www.ishconnect.rw/" target="_blank" rel="noreferrer">IshConnect</a> in Kigali, Rwanda.</p>
      </div>
      <div className="border-l-4 border-green-700 bg-slate-50 p-6 sm:p-8">
        <p className="text-sm font-semibold text-green-800">Learn with a clear path</p>
        <ul className="mt-4 space-y-4">
          {[[BookOpen, 'Study resources', 'Read and follow course documents with saved learning progress.'], [Video, 'Live learning', 'Join scheduled class sessions from the training you are enrolled in.'], [Code2, 'Practical work', 'Complete assignments, project submissions and assessments when a course requires them.'], [ShieldCheck, 'Verified certificates', 'Eligible course certificates can be shared and checked on a public verification page.']].map(([Icon, title, text]) => <li key={title} className="flex gap-3"><span className="mt-0.5 text-green-800"><Icon size={19} /></span><div><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></li>)}
        </ul>
      </div>
    </section>
    <section className="py-10 sm:py-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-green-800">Current catalogue</p><h2 className={`${sectionTitle} mt-1`}>Programmes published on QuickLink</h2></div><Link to="/programmes" className="text-sm font-semibold text-green-800">View all programmes <ArrowRight className="ml-1 inline" size={15} /></Link></div>
      {loading ? <p className={bodyText}>Loading published programmes…</p> : featured.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{featured.map((programme) => <ProgrammeCard key={programme.id} programme={programme} />)}</div> : <div className="border border-slate-200 bg-slate-50 p-5"><h3 className="font-semibold text-slate-900">No public programmes are listed right now</h3><p className="mt-1 text-sm text-slate-600">Check back for the next IshConnect training or contact IshConnect through its official website.</p></div>}
    </section>
    <section className="grid gap-8 border-t border-slate-200 py-10 sm:grid-cols-3 sm:py-12">
      <div><GraduationCap size={23} className="text-green-800" /><h2 className="mt-3 font-bold text-slate-950">Explore real programmes</h2><p className="mt-2 text-sm leading-6 text-slate-600">The public catalogue is drawn from active programmes an administrator has published. Details reflect the training information currently available.</p></div>
      <div><Laptop size={23} className="text-green-800" /><h2 className="mt-3 font-bold text-slate-950">Learn online</h2><p className="mt-2 text-sm leading-6 text-slate-600">Once enrolled, learners access their assigned trainings, study materials, activities and live classroom pages from their account.</p></div>
      <div><Users size={23} className="text-green-800" /><h2 className="mt-3 font-bold text-slate-950">Get started</h2><p className="mt-2 text-sm leading-6 text-slate-600">Review a programme page and follow its registration link when available. Create an account to access your enrolled learning.</p></div>
    </section>
    <section className="border-t border-slate-200 py-10"><h2 className={sectionTitle}>Learning technology from Rwanda</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Learners looking for online courses in Rwanda can use QuickLink to review actual, published IshConnect trainings and see their specific schedules, learning requirements and registration availability. Programme pages are updated from the live catalogue instead of presenting unpublished course ideas as open offers.</p><div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="font-semibold text-green-800 underline-offset-2 hover:underline" to="/about">About QuickLink</Link><Link className="font-semibold text-green-800 underline-offset-2 hover:underline" to="/resources">Read learning guides</Link><Link className="font-semibold text-green-800 underline-offset-2 hover:underline" to="/contact">Contact IshConnect</Link></div></section>
  </PublicShell>;
}

function PublicProgrammesPage() {
  const { programmes, loading, error } = useProgrammes();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return programmes;
    return programmes.filter((programme) => [programme.title, programme.subject, programme.trade, programme.programme, programme.introduction, programme.description].join(' ').toLowerCase().includes(query));
  }, [programmes, search]);
  const structuredCourses = filtered.filter((item) => item.courseStructuredDataEligible);
  const structured = structuredCourses.length >= 3 ? { '@context': 'https://schema.org', '@type': 'ItemList', name: 'QuickLink technology training programmes', itemListElement: structuredCourses.map((item, index) => ({ '@type': 'ListItem', position: index + 1, url: `${SITE_URL}${programmeUrl(item)}`, item: { '@type': 'Course', name: item.title, description: (item.introduction || item.description).slice(0, 5000), provider: ORGANIZATION_SCHEMA } })) } : undefined;
  return <PublicShell title="Technology Training Programmes in Rwanda | QuickLink" description="Browse current online technology training programmes published by IshConnect on QuickLink. Review programme descriptions, schedules, requirements and registration links." path="/programmes" jsonLd={structured}>
    <PageHeading eyebrow="QuickLink course catalogue" title="Technology training programmes" description="Browse active programmes published by IshConnect. Each programme page uses the current training details, including its learning focus, schedule and registration availability." />
    <label className="mb-6 flex max-w-xl items-center gap-3 border border-slate-300 px-3 focus-within:border-green-700"><Search size={17} className="shrink-0 text-slate-500" /><input className="min-h-12 w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400 focus:ring-0" value={search} onChange={(event) => setSearchParams(event.target.value ? { search: event.target.value } : {})} placeholder="Search published programmes" aria-label="Search published programmes" /></label>
    {loading ? <p className={bodyText}>Loading programmes…</p> : error ? <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">The catalogue could not be loaded. Please try again shortly.</p> : filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((programme) => <ProgrammeCard key={programme.id} programme={programme} />)}</div> : <div className="border border-slate-200 bg-slate-50 p-6"><h2 className="font-semibold text-slate-900">{programmes.length ? 'No matching programmes' : 'No programmes currently published'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{programmes.length ? 'Try another search term.' : 'IshConnect will list programme information here when training is published on QuickLink.'}</p></div>}
    <p className="mt-8 max-w-3xl text-xs leading-5 text-slate-500">Availability and details can change. Confirm the current schedule and requirements on the programme page or the linked registration form.</p>
  </PublicShell>;
}

function PublicProgrammePage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState({ programme: null, loading: true, error: '' });
  useEffect(() => {
    let current = true;
    api.get(`/public/programmes/${slug}`).then((response) => { if (current) setState({ programme: response.data.data.programme, loading: false, error: '' }); })
      .catch((error) => { if (current) setState({ programme: null, loading: false, error: apiError(error).message }); });
    return () => { current = false; };
  }, [slug]);
  const programme = state.programme;
  const description = programme ? (programme.introduction || programme.description || `Review the published details for ${programme.title}, an IshConnect training programme on QuickLink.`).slice(0, 320) : 'Explore current technology training programmes published on QuickLink by IshConnect.';
  const pagePath = `/programmes/${slug}`;
  const jsonLd = programme ? { '@context': 'https://schema.org', '@graph': [
    ...(programme.courseStructuredDataEligible ? [{ '@type': 'Course', name: programme.title, description: programme.introduction || programme.description, provider: ORGANIZATION_SCHEMA, inLanguage: 'en' }] : []),
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Programmes', item: `${SITE_URL}/programmes` }, { '@type': 'ListItem', position: 3, name: programme.title, item: `${SITE_URL}${pagePath}` }] },
  ] } : undefined;
  const title = programme ? `${programme.title} | QuickLink by IshConnect` : state.loading ? 'Technology Training Programmes | QuickLink by IshConnect' : 'Programme not found | QuickLink';
  return <PublicShell title={title} description={description} path={pagePath} jsonLd={jsonLd} noIndex={!programme && !state.loading}>
    {state.loading ? <p className={bodyText}>Loading programme details…</p> : !programme ? <div className="py-16 text-center"><h1 className="text-2xl font-bold text-slate-950">This programme is not available</h1><p className="mt-2 text-sm text-slate-600">It may have been unpublished. Browse the current catalogue for available training.</p><Link className={`${buttonPrimary} mt-5`} to="/programmes">Browse programmes</Link></div> : <>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-800">{programme.subject}{programme.level ? ` · ${programme.level}` : ''}</p>
      <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{programme.title}</h1>
      {programme.programme && <p className="mt-2 text-sm text-slate-500">Programme: {programme.programme}</p>}
      <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{programme.introduction || programme.description || 'Programme description has not yet been added.'}</p>
      <div className="mt-6 flex flex-wrap gap-3">{programme.registrationUrl ? <Link className={buttonPrimary} to={programme.registrationUrl}>Register for this training <ArrowRight size={16} /></Link> : <Link className={buttonPrimary} to="/contact">Ask IshConnect about enrolment <ArrowRight size={16} /></Link>}<Link className={buttonSecondary} to="/programmes">All programmes</Link></div>
      <div className="mt-10 grid gap-8 border-t border-slate-200 pt-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <div className="space-y-8">
          <section><h2 className={sectionTitle}>Programme overview</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{programme.description || programme.introduction || 'More programme information will be added by IshConnect.'}</p></section>
          <section><h2 className={sectionTitle}>Learning activities and completion</h2><p className="mt-2 text-sm leading-6 text-slate-600">The items below reflect the requirements configured for this published programme.</p>
            <ul className="mt-4 space-y-3">{[
              [programme.completionRequirements.requireReading, 'Read the required learning resources'],
              [programme.completionRequirements.requireAttendance, `Attend the required live classes${programme.assessment.minimumAttendanceSessions ? ` (minimum ${programme.assessment.minimumAttendanceSessions} sessions)` : ''}`],
              [programme.completionRequirements.requireTheory, 'Complete required theory assessments'],
              [programme.completionRequirements.requirePractical, 'Complete required practical assignments'],
              [programme.projectSubmission.enabled && programme.projectSubmission.required, programme.projectSubmission.title || 'Submit a practical project'],
            ].filter(([enabled]) => enabled).map(([, text]) => <li key={text} className="flex items-start gap-2 text-sm leading-6 text-slate-700"><Check size={17} className="mt-1 shrink-0 text-green-700" />{text}</li>)}
            {!Object.values(programme.completionRequirements).some(Boolean) && !programme.projectSubmission.required && !programme.assessment.enabled && <li className="text-sm leading-6 text-slate-600">No specific completion requirements are listed for this programme yet. Confirm expectations with IshConnect during registration.</li>}</ul>
            {programme.assessment.enabled && <p className="mt-4 text-sm leading-6 text-slate-600">A final assessment is enabled. The configured pass mark is {programme.assessment.passMark}%.</p>}
            {programme.projectSubmission.enabled && programme.projectSubmission.instructions && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{programme.projectSubmission.instructions}</p>}
          </section>
          <section><h2 className={sectionTitle}>Registration</h2><p className="mt-3 text-sm leading-7 text-slate-600">{programme.registrationUrl ? 'Use the active registration form to submit your details. After registration and account setup, sign in to view the training you are enrolled in.' : programme.enrollmentOpen ? 'Contact IshConnect to ask about registration for this programme. A public registration link has not been published.' : 'Enrollment is currently closed. Contact IshConnect to ask about a future intake.'}</p>{programme.registrationUrl && <Link to={programme.registrationUrl} className={`${buttonPrimary} mt-4`}>Open registration form <ArrowRight size={16} /></Link>}</section>
          <section><h2 className={sectionTitle}>Certificates</h2><p className="mt-3 text-sm leading-7 text-slate-600">QuickLink supports certificates for completed training. An administrator issues a certificate when the learner meets the programme's completion requirements. Each public verification link shows the certificate's current status.</p></section>
        </div>
        <aside className="h-fit border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-bold text-slate-950">Programme information</h2>
          <dl className="mt-4 divide-y divide-slate-200 text-sm">
            <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</dt><dd className="mt-1 font-medium text-slate-800">{programme.subject}</dd></div>
            <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Level</dt><dd className="mt-1 font-medium text-slate-800">{programme.level}</dd></div>
            {programme.startsAt && <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</dt><dd className="mt-1 font-medium text-slate-800">{formatDate(programme.startsAt)}</dd></div>}
            {programme.endsAt && <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">End date</dt><dd className="mt-1 font-medium text-slate-800">{formatDate(programme.endsAt)}</dd></div>}
            {programme.schedule && <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</dt><dd className="mt-1 whitespace-pre-line font-medium text-slate-800">{programme.schedule}</dd></div>}
            {programme.durationMinutes && <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live session length</dt><dd className="mt-1 font-medium text-slate-800">{programme.durationMinutes} minutes</dd></div>}
            <div className="py-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment</dt><dd className="mt-1 font-medium text-slate-800">{programme.enrollmentOpen && (!programme.enrollmentClosesAt || new Date(programme.enrollmentClosesAt) >= new Date()) ? 'Open' : 'Closed'}</dd></div>
          </dl>
        </aside>
      </div>
    </>}
  </PublicShell>;
}

function AboutQuickLinkPage() {
  return <PublicShell title="About QuickLink | IshConnect Online Learning Platform" description="Learn how QuickLink supports IshConnect technology training with learner accounts, enrolled course access, live classes, course materials, assignments and certificates." path="/about">
    <PageHeading eyebrow="About the platform" title="About QuickLink" description="QuickLink is IshConnect's online learning platform for accessing technology training and following learning activities from enrolment through completion." />
    <div className="grid gap-10 md:grid-cols-[1fr_280px]"><div className="space-y-5"><p className={bodyText}>The platform brings student registration, enrolled programme access, class schedules, live learning sessions and course resources into a single account. Learners can follow progress, submit practical assignments and complete assessments where those activities are part of their training.</p><p className={bodyText}>QuickLink also supports instructor-led online classrooms, attendance reports for administrators, and certificate generation and public verification for learners who satisfy the configured completion criteria.</p><p className={bodyText}>The catalogue page lists only active programmes published by IshConnect. A programme may include a public registration form; when a form is not available, learners can contact IshConnect to ask about the current intake.</p><Link to="/how-learning-works" className="inline-flex items-center gap-2 font-semibold text-green-800">How learning works <ArrowRight size={16} /></Link></div><aside className="h-fit border-l-4 border-green-700 bg-slate-50 p-5"><h2 className="font-semibold text-slate-900">Platform features</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>Student accounts and enrolment</li><li>Course materials and saved progress</li><li>Live classes and attendance</li><li>Practical assignments and assessments</li><li>Certificates with public verification</li></ul></aside></div>
  </PublicShell>;
}

function AboutIshConnectPage() {
  return <PublicShell title="IshConnect | Organisation Behind QuickLink" description="QuickLink is operated by IshConnect, a technology organisation based in Kigali, Rwanda. Explore the learning platform and programmes published by IshConnect." path="/about-ishconnect" jsonLd={{ '@context': 'https://schema.org', ...ORGANIZATION_SCHEMA, address: { '@type': 'PostalAddress', addressLocality: 'Kigali', addressCountry: 'RW' } }}>
    <PageHeading eyebrow="Platform operator" title="About IshConnect" description="IshConnect operates QuickLink, its online learning platform, from Kigali, Rwanda." />
    <div className="max-w-3xl space-y-5"><p className={bodyText}>QuickLink provides the digital learning experience for IshConnect training programmes. It supports programme information, learner accounts, course materials, live classes, submissions, assessments and certificates where configured.</p><p className={bodyText}>For the latest information about IshConnect, its organisation and other activities, visit the official IshConnect website. Programme availability on QuickLink is based on the active catalogue displayed here.</p><div className="flex flex-wrap gap-3"><a href="https://www.ishconnect.rw/" target="_blank" rel="noreferrer" className={buttonPrimary}>Visit IshConnect <ArrowUpRight size={16} /></a><Link to="/programmes" className={buttonSecondary}>View QuickLink programmes</Link></div><p className="text-xs leading-5 text-slate-500">QuickLink does not claim accreditation or qualification recognition unless this is explicitly stated in a programme's verified details.</p></div>
  </PublicShell>;
}

function HowLearningWorksPage() {
  const steps = [
    ['01', 'Review a published programme', 'Read the programme description, level, schedule, configured learning requirements and registration status.'],
    ['02', 'Register and create your account', 'Use the public registration link when one is available. Follow the email verification and account setup steps, or sign in to link an existing student account.'],
    ['03', 'Open your enrolled training', 'After enrolment, sign in to see your training, materials, course progress, upcoming live classes and payment status.'],
    ['04', 'Take part in learning activities', 'Study the assigned resources, attend scheduled sessions and submit assignments, projects or assessments required by that training.'],
    ['05', 'Track completion and certificate status', 'QuickLink tracks the configured completion checks. An administrator can issue a certificate after the requirements are met; issued certificates can be publicly verified.'],
  ];
  return <PublicShell title="How Online Learning Works on QuickLink | IshConnect" description="See how to browse an IshConnect programme, register, access enrolled training, join live classes, complete practical work and check certificate status on QuickLink." path="/how-learning-works">
    <PageHeading eyebrow="Learner guide" title="How learning works on QuickLink" description="QuickLink connects programme registration with enrolled course access, practical activities and live learning sessions." />
    <ol className="max-w-4xl divide-y divide-slate-200 border-y border-slate-200">{steps.map(([number, title, description]) => <li key={number} className="grid gap-2 py-5 sm:grid-cols-[4rem_1fr]"><span className="text-sm font-bold tabular-nums text-green-800">{number}</span><div><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div></li>)}</ol><div className="mt-7 flex flex-wrap gap-3"><Link className={buttonPrimary} to="/programmes">Browse programmes <ArrowRight size={16} /></Link><Link className={buttonSecondary} to="/register">Create a student account</Link></div>
  </PublicShell>;
}

function ContactPage() {
  return <PublicShell title="Contact IshConnect about QuickLink Training" description="Questions about a QuickLink programme or registration? Contact IshConnect through its official website in Kigali, Rwanda." path="/contact">
    <PageHeading eyebrow="Questions and support" title="Contact IshConnect" description="For programme availability, registration questions or information about QuickLink, use IshConnect's official contact channels." />
    <div className="max-w-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"><h2 className="text-lg font-bold text-slate-950">Ask about a training programme</h2><p className="mt-2 text-sm leading-7 text-slate-600">Include the name of the programme you are interested in so IshConnect can direct your question. Published QuickLink programme pages show schedules and registration links when available.</p><a href="https://www.ishconnect.rw/" target="_blank" rel="noreferrer" className={`${buttonPrimary} mt-5`}>Contact IshConnect <ArrowUpRight size={16} /></a><p className="mt-4 text-xs text-slate-500">IshConnect is based in Kigali, Rwanda.</p></div>
  </PublicShell>;
}

const publishedOn = '2026-11-08';
const resources = [
  { slug: 'start-software-development-rwanda', title: 'How to Start Learning Software Development in Rwanda', summary: 'Choose a first programming path, practise consistently and build a small portfolio using projects you can explain.', sections: [
    ['Start with a goal and a small scope', 'Decide what you want to build: a web page, a simple mobile interface, or a small data script. A concrete outcome helps you choose between HTML and JavaScript for web interfaces, Python for general programming and data, or another language required by a specific programme. You do not need to learn every language first.'],
    ['Learn the foundations through practice', 'Work through variables, conditions, loops, functions, data structures and debugging. After each concept, write a small example without copying the lesson. Keep notes about what failed and how you diagnosed it; debugging is part of software development, not a sign that you are doing it wrong.'],
    ['Build and explain a project', 'Choose a small problem you understand, list three to five user needs, and build only those first. Save your work with version control, write a README with setup steps, and ask another learner to try it. Do not publish passwords, personal information or API keys in a public repository.'],
    ['Use a steady learning routine', 'Set a realistic weekly practice schedule and review progress every week. Structured training can add resources, instructor feedback, live sessions and assessment; compare the actual programme requirements before enrolling.'] ] },
  { slug: 'python-for-artificial-intelligence', title: 'Why Python Is Used in Artificial Intelligence', summary: 'Understand how Python fundamentals, data handling and model libraries fit into an AI learning path.', sections: [
    ['Learn Python before reaching for a model', 'AI work still depends on ordinary programming skills: naming values, writing functions, reading files, handling errors and testing results. A beginner can start with a small function that cleans a list or calculates a summary before introducing a model.'],
    ['Move from data to models in stages', 'Python libraries help organise data, perform numerical operations and train machine-learning models. A sensible sequence is Python basics, tabular data, descriptive statistics, train/test splitting, a simple baseline and then a model that answers a defined question. Libraries automate steps; they do not decide whether your data or conclusion is appropriate.'],
    ['Check the result, not just the code', 'Compare a model with a simple baseline, select a metric that matches the task and test on data that was not used to train it. Keep sensitive data private and document where example data came from. A high score on one small dataset is not proof that a system works for every person or setting.'],
    ['A small example', 'For a classification task, first define the label and explain what a false positive and false negative mean. Then split the data, train a baseline and inspect the confusion matrix before deciding whether a more complex model is useful.'] ] },
  { slug: 'machine-learning-for-beginners', title: 'Introduction to Machine Learning for Beginners', summary: 'A practical overview of examples, features, labels, model evaluation and responsible use.', sections: [
    ['What machine learning does', 'Machine learning uses examples to estimate patterns that can help make predictions or group data. In supervised learning, examples include a target label. In unsupervised learning, the task looks for structure without a supplied target. Neither approach understands a problem in the human sense.'],
    ['The basic workflow', 'Define one question, collect permitted and relevant data, inspect and clean the records, create a baseline, split data for evaluation, train a suitable model and check errors. Keep a separate test set for a final check. The test set should not guide repeated model tuning.'],
    ['Watch for data leakage', 'Leakage happens when information unavailable at decision time slips into training data or preprocessing. It can make evaluation look much better than deployment. Fit transformations only on training data, keep related records together when splitting and ask whether each input would actually be available at prediction time.'],
    ['Interpret the limits', 'A model can reproduce gaps or mistakes in its examples. Review performance for meaningful subgroups where appropriate, minimise personal data, and keep a human decision-maker involved in high-impact settings. Record assumptions and known failure modes alongside the model.'] ] },
  { slug: 'supervised-vs-unsupervised-machine-learning', title: 'Supervised vs Unsupervised Machine Learning', summary: 'Compare labelled prediction tasks with exploratory grouping, including when each is useful.', sections: [
    ['Supervised learning uses labelled examples', 'A supervised dataset pairs inputs with a target. A spam classifier learns from messages labelled spam or not spam; a numeric model might predict delivery time from past trips. Classification predicts categories, while regression predicts numeric values.'],
    ['Unsupervised learning explores structure', 'Unsupervised methods receive inputs without a target label. Clustering can group records by similarity, and dimensionality reduction can create a compact representation. A cluster is a mathematical grouping, not automatically a meaningful customer segment or a discovery.'],
    ['Choose from the question and data', 'If you have a clearly defined outcome and reliable labels, begin with a supervised baseline. If you are exploring data without known labels, unsupervised methods may help organise investigation. In both cases, first inspect the data, define a useful evaluation and compare with a simpler approach.'],
    ['Avoid common mistakes', 'Do not evaluate a clustering result with the same labels you later claim it discovered. Do not treat correlation as cause. Write down what the method can and cannot establish before sharing the result.'] ] },
  { slug: 'full-stack-developer-path', title: 'How to Become a Full Stack Developer', summary: 'A grounded learning path through browser interfaces, APIs, data storage, testing and deployment.', sections: [
    ['Understand the parts of a web application', 'A browser interface presents information and handles user actions. A server validates requests, applies business rules and communicates with a database or other services. Authentication, authorisation, accessibility and security connect all of these parts.'],
    ['Build in a useful order', 'Start with semantic HTML, CSS and JavaScript. Then learn one UI framework, HTTP and JSON, API design, database basics and server-side validation. Add authentication and deployment after you can explain the request path from a form to persisted data.'],
    ['Create a complete small application', 'For example, build a study planner with a validated form, user-specific records, edit and delete actions, empty and error states, and tests for the main rules. Do not store passwords in plain text; use established authentication libraries and server-side access checks.'],
    ['Demonstrate your engineering decisions', 'Provide a clear README, a few screenshots, setup instructions, tests and a short explanation of trade-offs. A finished, understandable project is more useful than a long list of technologies without evidence of how you used them.'] ] },
  { slug: 'practical-programming-projects', title: 'Practical Projects Every Programming Student Can Build', summary: 'Choose project ideas that test real programming skills and produce clear evidence of learning.', sections: [
    ['Begin with a bounded problem', 'A task tracker, a course-resource search page or a small expense summary can teach useful skills without requiring a large product. Write down the intended user, the information the app stores and three behaviours that must work before adding extras.'],
    ['Add evidence of core skills', 'Use validation, persistent storage, loading and error states, keyboard-accessible controls and tests for important rules. For a data project, document the dataset source, cleaning steps, assumptions and how another person can reproduce the result.'],
    ['Improve through feedback', 'Ask someone to use the project without coaching. Observe where they get stuck, write down the issue and choose one improvement. A practical assignment becomes stronger when it includes a working result and a short account of what you changed after review.'],
    ['Publish safely', 'Remove API keys and private data, check third-party asset licences and include clear setup steps. Explain what the project does not do yet so reviewers can distinguish implemented behaviour from future ideas.'] ] },
  { slug: 'cybersecurity-introduction', title: 'Introduction to Cybersecurity for Technology Learners', summary: 'Learn core security ideas and practise only in systems and labs where you have permission.', sections: [
    ['Start with security fundamentals', 'Confidentiality, integrity and availability are useful ways to discuss security goals. Apply them to a familiar system: who can read an account record, who can change it and how does the service recover if it is unavailable?'],
    ['Practise defensive habits', 'Use unique passwords with a password manager, enable multi-factor authentication where available, update software and make backups that you have tested. In applications, validate input, use least privilege, protect secrets and log security-relevant events without collecting unnecessary personal data.'],
    ['Use authorised practice environments', 'Learn scanning and testing only on systems you own or have written permission to assess. Use intentionally vulnerable training labs for exercises. Do not test a school, employer, website or network merely because it is reachable.'],
    ['Learn from incidents', 'For each lab, record the system boundary, test performed, evidence observed, impact, remediation and retest result. Clear documentation helps a developer fix the issue and shows that the activity stayed within its authorised scope.'] ] },
  { slug: 'how-online-technology-training-works', title: 'How Online Technology Training Works', summary: 'What to look for in programme details, learning activities, instructor sessions and completion requirements.', sections: [
    ['Check the actual programme details', 'Before enrolling, review the subject, level, schedule, start dates, required activities, payment terms and how to ask questions. If a course page does not specify prerequisites or total duration, ask the provider instead of assuming.'],
    ['Use a learning loop', 'Prepare by reviewing the resource, attend the session with questions, practise the concept on a small task, submit work for feedback and revise it. Keep a short record of what you learned and what you still need to practise.'],
    ['Plan for participation', 'Check your device, internet access and session times. If the course uses a live class, know how to join and where to find materials. Contact the training team early if you have an access barrier or scheduling concern.'],
    ['Understand completion', 'Completion rules vary by programme. Some can require reading, attendance, theory assessments, practical assignments or a project. Review the published requirements and ask the provider how feedback and certificates are handled.'] ] },
  { slug: 'build-first-machine-learning-model', title: 'How to Build Your First Machine Learning Model', summary: 'A careful beginner workflow from a specific question to a tested baseline model.', sections: [
    ['Define a narrow question', 'Choose a prediction question with an observable target, such as estimating a numeric value from permitted example data. State who would use the output and what a wrong answer costs. If you cannot define an evaluation, refine the question before training.'],
    ['Prepare a reproducible dataset', 'Inspect rows, missing values, duplicate records, units and labels. Keep a record-level train/test split before tuning. Any preprocessing that learns from data, such as scaling or imputation, should be fitted on training data only and then applied to the held-out data.'],
    ['Compare with a baseline', 'A baseline can predict the training median for a numeric target or the most common class for classification. Train one simple model and compare its errors with that baseline using a metric tied to the task. Do not rely on accuracy when classes are imbalanced.'],
    ['Review and document', 'Inspect representative errors and note data limitations, test-set size and metric definitions. Save the code and environment instructions so another learner can reproduce the result. Treat the model as a learning exercise until its reliability and appropriate use are established.'] ] },
  { slug: 'why-practical-learning-matters', title: 'Why Practical Learning Matters in Technology', summary: 'Use practice, feedback and reflection to turn concepts into skills you can demonstrate.', sections: [
    ['Recall and application are different', 'Recognising a code example is not the same as writing one from a blank file or adapting it to a new requirement. Short exercises that require recall expose what you understand and what you still need to review.'],
    ['Feedback shortens the learning cycle', 'A reviewer can point out a bug, unclear explanation, missing test or accessibility problem. The learner then makes a specific revision and checks that the change worked. Good feedback explains the reason, not just the answer.'],
    ['Projects create evidence', 'A small project can show how you break down requirements, organise code, test behaviour and explain trade-offs. Keep scope realistic and record your process. No project by itself guarantees a job or professional competence; it is one useful piece of evidence.'],
    ['Make practice sustainable', 'Choose a task that fits your current level, schedule focused practice, take breaks and revisit it after a day or two. Consistent, reviewed work is more effective than collecting tutorials without applying them.'] ] },
];

function ResourcesPage() {
  return <PublicShell title="Technology Learning Resources | QuickLink by IshConnect" description="Read practical technology learning guides from IshConnect on programming, Python, machine learning, software projects, cybersecurity and online study." path="/resources">
    <PageHeading eyebrow="Learning resources" title="Practical guides for learning technology" description="Start with a question, work through a clear explanation and use the ideas in a small project. These guides complement structured training; they do not replace programme-specific requirements." />
    <div className="grid gap-0 border-y border-slate-200 md:grid-cols-2 md:divide-x md:divide-slate-200">{resources.map((article) => <article key={article.slug} className="border-b border-slate-200 p-5 md:p-6"><h2 className="text-lg font-bold leading-6 text-slate-950"><Link className="hover:text-green-800" to={`/resources/${article.slug}`}>{article.title}</Link></h2><p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p><Link className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-green-800" to={`/resources/${article.slug}`}>Read guide <ArrowRight size={15} /></Link></article>)}</div>
    <p className="mt-6 text-xs leading-5 text-slate-500">Published by IshConnect. Technical examples are educational and should be adapted and tested for the system in which they are used.</p>
  </PublicShell>;
}

function ResourceArticlePage() {
  const { slug = '' } = useParams();
  const article = resources.find((item) => item.slug === slug);
  if (!article) return <PublicShell title="Resource not found | QuickLink" description="Browse QuickLink technology learning resources." path={`/resources/${slug}`} noIndex><PageHeading title="Guide not found" description="Browse the resource library for available learning guides." /><Link className={buttonPrimary} to="/resources">Browse resources</Link></PublicShell>;
  const path = `/resources/${article.slug}`;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.summary, datePublished: publishedOn, dateModified: publishedOn, inLanguage: 'en', mainEntityOfPage: `${SITE_URL}${path}`, author: ORGANIZATION_SCHEMA, publisher: ORGANIZATION_SCHEMA };
  return <PublicShell title={`${article.title} | QuickLink Resources`} description={article.summary} path={path} type="article" jsonLd={jsonLd}>
    <article className="mx-auto max-w-3xl"><p className="text-xs font-semibold uppercase tracking-wide text-green-800">IshConnect learning resources · Published {formatDate(publishedOn)}</p><h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">{article.title}</h1><p className="mt-4 text-base leading-7 text-slate-600">{article.summary}</p><div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">{article.sections.map(([heading, content]) => <section key={heading} className="py-6"><h2 className="text-xl font-bold text-slate-950">{heading}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{content}</p></section>)}</div><aside className="mt-8 border-l-4 border-green-700 bg-slate-50 p-5"><h2 className="font-bold text-slate-950">Connect learning with practice</h2><p className="mt-2 text-sm leading-6 text-slate-600">Explore the current programmes published by IshConnect and review their actual learning requirements.</p><Link to="/programmes" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-green-800">View published programmes <ArrowRight size={15} /></Link></aside><p className="mt-6 text-xs leading-5 text-slate-500">Published by IshConnect on {formatDate(publishedOn)}. Always check current tools, documentation and programme details before applying these learning examples.</p></article>
  </PublicShell>;
}

export function PublicRoute({ kind }) {
  if (kind === 'home') return <PublicHomePage />;
  if (kind === 'programmes') return <PublicProgrammesPage />;
  if (kind === 'programme') return <PublicProgrammePage />;
  if (kind === 'about') return <AboutQuickLinkPage />;
  if (kind === 'about-ishconnect') return <AboutIshConnectPage />;
  if (kind === 'how') return <HowLearningWorksPage />;
  if (kind === 'contact') return <ContactPage />;
  if (kind === 'resources') return <ResourcesPage />;
  if (kind === 'resource') return <ResourceArticlePage />;
  return null;
}
