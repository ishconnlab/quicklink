export const TRADE_KEYS = ['sod', 'nit', 'csa', 'acc', 'other'];
export const TRADE_LABELS = {
  sod: 'SOD',
  nit: 'NIT',
  csa: 'CSA',
  acc: 'ACC',
  other: 'Other',
};

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toInputDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Unknown (blank) values render as an em dash; an explicit "N/A" stays "N/A".
export function displayCount(value) {
  if (value === null || value === undefined) return '—';
  return String(value);
}

export function formatNumber(value) {
  const n = Number(value) || 0;
  return n.toLocaleString();
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}
