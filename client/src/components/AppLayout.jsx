import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  School,
  FileText,
  Settings,
  LogOut,
  Plus,
  WifiOff,
  CloudOff,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  ClipboardList,
  Layers,
  Compass,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { classNames } from '../lib/format.js';
import NotificationBell from './NotificationBell.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/onboarding', label: 'Onboarding', icon: Compass },
  { to: '/schools', label: 'Schools', icon: School },
  { to: '/students', label: 'Students', icon: GraduationCap },
  { to: '/admissions', label: 'Admissions', icon: ClipboardList },
  { to: '/admission-packs', label: 'Admission packs', icon: Layers },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Students', icon: GraduationCap },
  { to: '/admissions', label: 'Admissions', icon: ClipboardList },
  { to: '/admission-packs/new', label: 'Add', icon: Plus, primary: true },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/reports', label: 'Reports', icon: FileText },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
        QL
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">QuickLink</p>
        <p className="hidden text-[11px] text-slate-400 sm:block">School Data</p>
      </div>
    </div>
  );
}

function AccountIdentity() {
  const { user } = useAuth();
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
      <p className="truncate text-xs text-slate-400">{user?.email}</p>
    </div>
  );
}

function AccountMenu({ openUp = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initial = user?.name?.slice(0, 1)?.toUpperCase() || '?';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
          {initial}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div
          className={classNames(
            'absolute right-0 z-40 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg',
            openUp ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="border-b border-slate-100 px-4 py-3 lg:hidden">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
          {user?.role !== 'parent' && (
            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Settings size={15} /> Settings
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              logout();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { online, pendingCount } = useSync();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('quicklink.sidebar.collapsed') === '1'
  );

  const toggleSidebar = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('quicklink.sidebar.collapsed', next ? '1' : '0');
      return next;
    });

  const offlineBanner = (!online || pendingCount > 0) && (
    <div
      className={classNames(
        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white',
        !online ? 'bg-amber-500' : 'bg-brand-600'
      )}
    >
      {!online ? <WifiOff size={16} /> : <CloudOff size={16} />}
      {!online
        ? 'Offline — records saved locally'
        : `${pendingCount} record(s) pending sync`}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Desktop sidebar (large screens) — can be hidden */}
      {collapsed && (
        <button
          onClick={toggleSidebar}
          title="Show sidebar"
          className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-slate-200 bg-white py-3 pl-1.5 pr-1 text-slate-400 shadow-sm hover:text-slate-700 lg:block"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white',
          !collapsed && 'lg:flex'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <NavLink to="/">
            <Brand />
          </NavLink>
          <button
            onClick={toggleSidebar}
            title="Hide sidebar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                classNames(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <AccountIdentity />
            <div className="flex items-center gap-1">
              <NotificationBell openUp />
              <AccountMenu openUp />
            </div>
          </div>
        </div>
      </aside>

      {/* Top bar (small screens / PWA) — no hamburger */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
          <NavLink to="/" className="shrink-0">
            <Brand />
          </NavLink>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className={classNames(collapsed ? 'lg:pl-0' : 'lg:pl-64')}>
        {offlineBanner}

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom taskbar (small screens / PWA only) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-6">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                classNames(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-600' : 'text-slate-500'
                )
              }
            >
              {primary ? (
                <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg">
                  <Icon size={22} />
                </span>
              ) : (
                <Icon size={20} />
              )}
              <span className={primary ? 'sr-only' : ''}>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
