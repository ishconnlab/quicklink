import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  School,
  FileText,
  RefreshCw,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  WifiOff,
  CloudOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { classNames } from '../lib/format.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schools', label: 'Schools', icon: School },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/sync', label: 'Sync', icon: RefreshCw },
  { to: '/users', label: 'Accounts', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/schools', label: 'Schools', icon: School },
  { to: '/schools/new', label: 'Add', icon: Plus, primary: true },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'More', icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
        QL
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">QuickLink</p>
        <p className="text-[11px] text-slate-400">School Data</p>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { online, pendingCount } = useSync();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <Brand />
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
              <span className="flex-1">{label}</span>
              {label === 'Sync' && pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
              {user?.name?.slice(0, 1)?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white p-4 lg:hidden"
            >
              <div className="flex items-center justify-between">
                <Brand />
                <button onClick={() => setDrawer(false)} className="btn-ghost p-2">
                  <X size={20} />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {NAV.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setDrawer(false)}
                    className={({ isActive }) =>
                      classNames(
                        'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600'
                      )
                    }
                  >
                    <Icon size={18} />
                    <span className="flex-1">{label}</span>
                    {label === 'Sync' && pendingCount > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
              <button onClick={handleLogout} className="btn-ghost mt-4 w-full justify-start">
                <LogOut size={16} /> Sign out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 lg:hidden">
          <button onClick={() => setDrawer(true)} className="btn-ghost p-2" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <Brand />
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
            {user?.name?.slice(0, 1)?.toUpperCase()}
          </div>
        </header>

        {!online && (
          <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white lg:hidden">
            <WifiOff size={16} /> Offline — records saved locally
          </div>
        )}
        {online && pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-brand-600 px-4 py-2 text-sm font-medium text-white lg:hidden">
            <CloudOff size={16} /> {pendingCount} record(s) pending sync
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5">
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
                <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
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
