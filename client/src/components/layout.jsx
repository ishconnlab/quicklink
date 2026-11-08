import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId } from 'react';

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-orange-100 bg-green-50 p-5 shadow-sm shadow-orange-900/[0.04] sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-green-50" />
      <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">{eyebrow}</p>}
          <h1 className="break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-3xl break-words text-sm leading-6 text-slate-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionHeader({ title, description, action, icon: Icon }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-brand-700 ring-1 ring-orange-100"><Icon size={18} /></span>}
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
    brand: { icon: 'bg-brand-700 text-white', bar: 'bg-brand-600' },
    orange: { icon: 'bg-brand-700 text-white', bar: 'bg-brand-600' },
    green: { icon: 'bg-emerald-700 text-white', bar: 'bg-emerald-600' },
    amber: { icon: 'bg-amber-600 text-white', bar: 'bg-amber-600' },
    slate: { icon: 'bg-slate-600 text-white', bar: 'bg-slate-500' },
    purple: { icon: 'bg-violet-700 text-white', bar: 'bg-violet-600' },
    red: { icon: 'bg-red-700 text-white', bar: 'bg-red-600' },
  };
  const theme = accents[accent] || accents.brand;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 ${theme.bar}`} />
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
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
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
    amber: 'bg-amber-100 text-amber-800 ring-amber-200/70',
    red: 'bg-red-100 text-red-700 ring-red-200/70',
    brand: 'bg-brand-100 text-brand-800 ring-brand-200/70',
    dark: 'bg-slate-900 text-white ring-slate-800',
  };
  return <span className={`badge ring-1 ring-inset ${colors[color] || colors.slate}`}>{children}</span>;
}

export function ProgressBar({ value = 0, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-600',
  };
  return <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tones[tone] || tones.brand} transition-all`} style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0))}%` }} /></div>;
}

export default { PageHeader, SectionHeader, StatCard, Modal, Badge, ProgressBar };
