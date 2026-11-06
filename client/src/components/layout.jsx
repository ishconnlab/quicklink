import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId } from 'react';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm shadow-slate-900/[0.03] backdrop-blur sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-brand-100/60 blur-3xl" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-500 to-emerald-700" />
      <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-3xl break-words text-sm leading-5 text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionHeader({ title, description, action, icon: Icon }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon size={18} /></span>}
        <div className="min-w-0">
          <h2 className="break-words text-base font-bold tracking-tight text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 break-words text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, accent = 'brand' }) {
  const accents = {
    brand: { icon: 'bg-gradient-to-br from-brand-500 to-emerald-700 text-white shadow-brand-900/20', bar: 'from-brand-500 to-emerald-600' },
    green: { icon: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-900/20', bar: 'from-emerald-500 to-teal-600' },
    amber: { icon: 'bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-amber-900/20', bar: 'from-amber-400 to-orange-500' },
    slate: { icon: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-slate-900/20', bar: 'from-slate-400 to-slate-600' },
    purple: { icon: 'bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-purple-900/20', bar: 'from-violet-500 to-purple-600' },
  };
  const theme = accents[accent] || accents.brand;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {Icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg ${theme.icon}`}><Icon size={19} /></div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', manage: 'max-w-3xl', reader: 'max-w-7xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative z-10 w-full ${sizes[size]} rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5 ${size === 'reader' ? 'reader-modal-scroll max-h-[96dvh] overflow-y-auto' : size === 'manage' || size === 'lg' ? 'manage-modal-scroll max-h-[92dvh] overflow-y-auto' : ''}`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 id={titleId} className="min-w-0 break-words text-lg font-semibold text-slate-900">{title}</h3>
              <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div>{children}</div>
            {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Badge({ children, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200/70',
    green: 'bg-emerald-100 text-emerald-700 ring-emerald-200/70',
    amber: 'bg-amber-100 text-amber-700 ring-amber-200/70',
    red: 'bg-red-100 text-red-700 ring-red-200/70',
    brand: 'bg-brand-100 text-brand-700 ring-brand-200/70',
  };
  return <span className={`badge ring-1 ring-inset ${colors[color]}`}>{children}</span>;
}

export default { PageHeader, SectionHeader, StatCard, Modal, Badge };
