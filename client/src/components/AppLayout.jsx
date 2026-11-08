import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Award, ChevronDown, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Menu, PanelLeftClose,
  PanelLeftOpen, ReceiptText, Settings, Users, Video, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { classNames } from '../lib/format.js';
import { isAdmin, roleLabel } from '../lib/roles.js';

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-green-50 text-xs font-black tracking-tight text-white shadow-lg shadow-orange-900/25 ring-1 ring-white/25">
        <span className="relative z-10">IC</span>
        <span className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white/20" />
      </div>
      {!compact && <div className="leading-tight"><p className="text-sm font-black tracking-tight text-slate-950">IshConnect</p><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700/80">QuickLink Learning</p></div>}
    </div>
  );
}

function AccountMenu({ placement = 'down', compact = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  useEffect(() => {
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  const signOut = () => {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  };
  return <div className="relative" ref={ref}>
    <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} className={compact ? 'flex w-full items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 text-left transition hover:border-brand-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60' : 'flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-orange-50'} aria-label="Account menu" aria-haspopup="true" aria-expanded={open} aria-controls={open ? menuId : undefined}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-white shadow-sm">{user?.name?.slice(0, 1)?.toUpperCase() || '?'}</span>
      {compact && <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{user?.name}</span><span className="block truncate text-xs text-slate-400">{roleLabel(user?.role)}</span></span>}
      <ChevronDown size={compact ? 16 : 14} className={classNames('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div id={menuId} className={classNames('absolute right-0 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl shadow-slate-900/10', placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2')}>
      <div className="flex items-center gap-3 rounded-xl bg-orange-50/70 px-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-bold text-white">{user?.name?.slice(0, 1)?.toUpperCase() || '?'}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p><p className="truncate text-xs text-slate-400">{user?.email}</p></div></div>
      <div className="mt-1 space-y-0.5">
        <button type="button" onClick={() => { setOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"><Settings size={15} /> Settings</button>
        <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"><LogOut size={15} /> Sign out</button>
      </div>
    </div>}
  </div>;
}

function NavItems({ groups, onNavigate }) {
  return <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label="Primary navigation">{groups.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label}</p><div className="space-y-1">{group.links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => classNames('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-orange-50 text-brand-900 ring-1 ring-orange-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>{({ isActive }) => <><span className={classNames('absolute left-0 h-5 w-1 rounded-r-full bg-brand-600 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} /><span className={classNames('flex h-8 w-8 items-center justify-center rounded-lg transition', isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-orange-100' : 'text-slate-400 group-hover:text-slate-600')}><Icon size={17} /></span><span className="truncate">{label}</span></>}</NavLink>)}</div></div>)}</nav>;
}

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('quicklink.sidebar.collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const admin = isAdmin(user);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  const navGroups = admin
    ? [
      { label: 'Overview', links: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
      { label: 'Training operations', links: [
        { to: '/courses', label: 'Trainings', icon: GraduationCap },
        { to: '/classes', label: 'Live classes', icon: Video },
        { to: '/enrollments', label: 'Enrollments & payments', icon: ReceiptText },
        { to: '/certificates', label: 'Certificates', icon: Award },
      ] },
      { label: 'People', links: [
        { to: '/students', label: 'Students', icon: Users },
        { to: '/registrations', label: 'Registrations', icon: ClipboardList },
      ] },
      { label: 'Account', links: [{ to: '/settings', label: 'Settings', icon: Settings }] },
    ]
    : [
      { label: 'Overview', links: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
      { label: 'My learning', links: [
        { to: '/courses', label: 'Trainings', icon: GraduationCap },
        { to: '/classes', label: 'Live classes', icon: Video },
        { to: '/certificates', label: 'My certificates', icon: Award },
      ] },
      { label: 'Account', links: [{ to: '/settings', label: 'Settings', icon: Settings }] },
    ];
  const allLinks = navGroups.flatMap((group) => group.links);
  const mobileLinks = allLinks.slice(0, 5);
  const toggleSidebar = () => setCollapsed((value) => {
    const next = !value;
    localStorage.setItem('quicklink.sidebar.collapsed', next ? '1' : '0');
    return next;
  });
  return <div className="min-h-[100dvh] bg-white">
    {collapsed && <button onClick={toggleSidebar} title="Show sidebar" className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-r-xl border border-l-0 border-slate-200 bg-white py-3 pl-1.5 pr-1 text-slate-400 shadow-sm transition hover:text-slate-700 lg:block"><PanelLeftOpen size={18} /></button>}
    <aside className={classNames('fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-orange-100/80 bg-white/95 shadow-xl shadow-orange-950/5 backdrop-blur', !collapsed && 'lg:flex')}>
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5"><NavLink to="/dashboard"><Brand /></NavLink><button onClick={toggleSidebar} title="Hide sidebar" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><PanelLeftClose size={18} /></button></div>
      <NavItems groups={navGroups} />
      <div className="border-t border-slate-100 p-3"><AccountMenu placement="up" compact /></div>
    </aside>

    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
      <aside className="relative flex h-full w-[86%] max-w-xs flex-col bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5"><Brand /><button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X size={20} /></button></div>
        <NavItems groups={navGroups} onNavigate={() => setMobileOpen(false)} />
        <div className="border-t border-slate-100 p-3"><AccountMenu placement="up" compact /></div>
      </aside>
    </div>}

    <header className="sticky top-0 z-30 border-b border-orange-100/70 bg-white/90 backdrop-blur lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2"><button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-orange-50" aria-label="Open navigation"><Menu size={21} /></button><NavLink to="/dashboard"><Brand /></NavLink></div>
        <AccountMenu />
      </div>
    </header>

    <div className={classNames(collapsed ? 'lg:pl-0' : 'lg:pl-64')}>
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:pb-12 lg:pt-8"><div key={location.pathname} className="animate-fade-in"><Outlet /></div></main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-orange-100/80 bg-white/95 shadow-[0_-8px_24px_rgba(124,45,18,0.06)] backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${mobileLinks.length}, minmax(0, 1fr))` }}>{mobileLinks.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} aria-label={label} title={label} className="group flex min-w-0 items-center justify-center px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">{({ isActive }) => <span className={classNames('flex h-10 w-12 items-center justify-center rounded-xl transition', isActive ? 'bg-orange-50 text-brand-700 ring-1 ring-orange-100' : 'text-slate-400 group-hover:bg-slate-50 group-hover:text-slate-600')}><Icon size={21} strokeWidth={isActive ? 2.4 : 2} /></span>}</NavLink>)}</div>
    </nav>
  </div>;
}
