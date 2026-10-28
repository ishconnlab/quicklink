import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function PagedCheckboxList({ title, items, selectedIds, onChange, emptyLabel, searchable = true, pageSize = 7 }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = items.filter((item) => `${item.name || item.title} ${item.email || ''} ${item.level || ''} ${item.category || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);

  return <section className="min-w-0 rounded-xl border border-slate-200 p-3" aria-label={title}>
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{title}</h3><span className="text-xs text-slate-500">{selectedIds.length} selected · {filtered.length} total</span></div>
    {searchable && <label className="relative mb-2 block"><span className="sr-only">Search {title.toLowerCase()}</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input h-10 pl-9 text-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`} /></label>}
    <div className="reader-content-scroll max-h-56 space-y-1 overflow-y-auto" aria-live="polite">
      {visible.map((item) => <label key={item.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} /><span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-800">{item.name || item.title}</span><span className="block truncate text-xs text-slate-500">{item.email || `${item.level} · ${item.category}`}</span></span></label>)}
      {!visible.length && <p className="px-2 py-4 text-center text-sm text-slate-500">{emptyLabel}</p>}
    </div>
    {pageCount > 1 && <nav className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2" aria-label={`${title} pagination`}><button type="button" className="btn-ghost min-h-9 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} />Previous</button><span className="text-xs tabular-nums text-slate-500">Page {currentPage} of {pageCount}</span><button type="button" className="btn-ghost min-h-9 px-2 text-xs" disabled={currentPage >= pageCount} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></nav>}
  </section>;
}
