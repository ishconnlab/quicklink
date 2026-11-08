import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import SeoMeta, { SITE_URL, ORGANIZATION_SCHEMA } from './SeoMeta.jsx';

const navClass = ({ isActive }) => `rounded-md px-2.5 py-2 text-sm font-medium ${isActive ? 'text-green-800' : 'text-slate-600 hover:text-green-800'}`;

export function PublicShell({ children, title, description, path, jsonLd, type, noIndex = false }) {
  return <div className="min-h-screen bg-white text-slate-800">
    <SeoMeta title={title} description={description} path={path} jsonLd={jsonLd} type={type} noIndex={noIndex} />
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-green-800 focus:shadow">Skip to content</a>
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-4 sm:px-6" aria-label="Main navigation">
        <Link to="/" aria-label="QuickLink by IshConnect home" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-green-700 text-xs font-bold tracking-wide text-white">QL</span>
          <span><span className="block text-sm font-bold tracking-tight text-slate-950">QuickLink</span><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-green-800">by IshConnect</span></span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <NavLink to="/programmes" className={navClass}>Programmes</NavLink>
          <NavLink to="/how-learning-works" className={navClass}>How it works</NavLink>
          <NavLink to="/resources" className={navClass}>Resources</NavLink>
          <Link to="/login" className="ml-1 inline-flex min-h-10 items-center rounded-md bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">Sign in</Link>
        </div>
      </nav>
    </header>
    <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div><Link to="/" className="font-bold text-slate-950">QuickLink</Link><p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">IshConnect's online learning platform for technology training, study resources, live classes and practical work.</p></div>
        <div><h2 className="text-sm font-semibold text-slate-900">Explore</h2><ul className="mt-2 space-y-2 text-sm"><li><Link className="text-slate-600 hover:text-green-800" to="/programmes">Available programmes</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/how-learning-works">How learning works</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/resources">Learning resources</Link></li></ul></div>
        <div><h2 className="text-sm font-semibold text-slate-900">About</h2><ul className="mt-2 space-y-2 text-sm"><li><Link className="text-slate-600 hover:text-green-800" to="/about">About QuickLink</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/about-ishconnect">About IshConnect</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/contact">Contact</Link></li></ul></div>
        <div><h2 className="text-sm font-semibold text-slate-900">Learner access</h2><ul className="mt-2 space-y-2 text-sm"><li><Link className="text-slate-600 hover:text-green-800" to="/register">Create an account</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/login">Sign in</Link></li><li><Link className="text-slate-600 hover:text-green-800" to="/verify">Certificate verification</Link></li></ul></div>
      </div>
      <div className="border-t border-slate-200"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6"><span>© {new Date().getFullYear()} IshConnect. QuickLink is IshConnect's online learning platform.</span><a className="inline-flex items-center gap-1 hover:text-green-800" href={ORGANIZATION_SCHEMA.url} target="_blank" rel="noreferrer">IshConnect website <ArrowUpRight size={13} /></a><span className="sr-only">{SITE_URL}</span></div></div>
    </footer>
  </div>;
}

export function PageHeading({ eyebrow, title, description, children }) {
  return <div className="mb-8 border-b border-slate-200 pb-7">
    {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-green-800">{eyebrow}</p>}
    <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
    {description && <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{description}</p>}
    {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
  </div>;
}
