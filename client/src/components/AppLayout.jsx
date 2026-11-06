import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ClipboardList, GraduationCap, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Users, Video, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { classNames } from '../lib/format.js';
import { isAdmin, isStudent, isTeacher, roleLabel } from '../lib/roles.js';

function Brand() {
  return <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">QL</div><div className="leading-tight"><p className="text-sm font-bold text-slate-900">QuickLink</p><p className="hidden text-[11px] text-slate-400 sm:block">Learning</p></div></div>;
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div className="relative" ref={ref}>
    <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-label="Account menu">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{user?.name?.slice(0, 1)?.toUpperCase() || '?'}</span><ChevronDown size={14} className="text-slate-400" />
    </button>
    {open && <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="border-b border-slate-100 px-4 py-3"><p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p><p className="truncate text-xs text-slate-400">{user?.email}</p></div>
      <button onClick={() => { setOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Settings size={15} /> Settings</button>
      <button onClick={() => { setOpen(false); logout(); navigate('/login', { replace: true }); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"><LogOut size={15} /> Sign out</button>
    </div>}
  </div>;
}

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('quicklink.sidebar.collapsed') === '1');
  const admin = isAdmin(user);
  const links = [
    ...(admin ? [{ to: '/dashboard', label: 'Admin dashboard', icon: LayoutDashboard }] : isStudent(user) ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: '/courses', label: 'Courses', icon: GraduationCap }] : isTeacher(user) ? [{ to: '/dashboard', label: 'Teacher dashboard', icon: LayoutDashboard }] : []),
    { to: admin ? '/learning' : '/learn', label: 'Learning library', icon: BookOpen },
    { to: '/classes', label: 'Classes', icon: Video },
    ...(admin ? [{ to: '/registrations', label: 'Registrations', icon: ClipboardList }] : []),
    ...(admin ? [{ to: '/users', label: 'People and accounts', icon: Users }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  const toggleSidebar = () => setCollapsed((value) => {
    const next = !value;
    localStorage.setItem('quicklink.sidebar.collapsed', next ? '1' : '0');
    return next;
  });
  return <div className="min-h-screen bg-slate-100">
    {collapsed && <button onClick={toggleSidebar} title="Show sidebar" className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-slate-200 bg-white py-3 pl-1.5 pr-1 text-slate-400 shadow-sm hover:text-slate-700 lg:block"><PanelLeftOpen size={18} /></button>}
    <aside className={classNames('fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white', !collapsed && 'lg:flex')}>
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5"><NavLink to={admin ? '/learning' : '/learn'}><Brand /></NavLink><button onClick={toggleSidebar} title="Hide sidebar" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><PanelLeftClose size={18} /></button></div>
      <nav className="flex-1 space-y-1 p-3">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => classNames('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}><Icon size={18} />{label}</NavLink>)}</nav>
      <div className="border-t border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p><p className="truncate text-xs text-slate-400">{roleLabel(user?.role)}</p></div><AccountMenu /></div></div>
    </aside>
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden"><div className="flex h-14 items-center justify-between gap-3 px-4"><NavLink to={admin ? '/learning' : '/learn'}><Brand /></NavLink><AccountMenu /></div></header>
    <div className={classNames(collapsed ? 'lg:pl-0' : 'lg:pl-64')}>
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6 lg:pb-10 lg:pt-6"><div key={location.pathname} className="animate-fade-in"><Outlet /></div></main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}><div className="grid" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => classNames('flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}><Icon size={20} /><span>{label}</span></NavLink>)}</div></nav>
  </div>;
}
