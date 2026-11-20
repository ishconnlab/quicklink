import { useRef } from 'react';
import { Bold, Highlighter } from 'lucide-react';

export default function MarkdownEditor({ value, onChange, placeholder = '', minHeight = 160, maxLength = 30000 }) {
  const textareaRef = useRef(null);

  const wrapSelection = (marker) => {
    const textarea = textareaRef.current;
    const text = value || '';
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = text.slice(start, end) || 'text';
    const next = `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + marker.length;
      textarea.setSelectionRange(cursor, cursor + selected.length);
    });
  };

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
      <button type="button" className="btn-ghost min-h-7 px-2 text-xs" onClick={() => wrapSelection('**')} aria-label="Bold selected text"><Bold size={13} />Bold</button>
      <button type="button" className="btn-ghost min-h-7 px-2 text-xs" onClick={() => wrapSelection('==')} aria-label="Highlight selected text"><Highlighter size={13} />Highlight</button>
      <span className="ml-auto pr-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Markdown</span>
    </div>
    <textarea
      ref={textareaRef}
      className="block w-full resize-y bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none"
      style={{ minHeight }}
      maxLength={maxLength}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </div>;
}
