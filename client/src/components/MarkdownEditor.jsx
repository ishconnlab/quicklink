import { useRef, useState } from 'react';
import { Bold, Code2, Eye, Heading2, Highlighter, Italic, List, ListOrdered, Pencil, Quote } from 'lucide-react';
import MarkdownContent from './MarkdownContent.jsx';

export default function MarkdownEditor({ value, onChange, minHeight = 160, maxLength = 100000 }) {
  const textareaRef = useRef(null);
  const [preview, setPreview] = useState(false);

  const wrapSelection = (marker) => {
    const textarea = textareaRef.current;
    const text = value || '';
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = text.slice(start, end);
    const next = `${text.slice(0, start)}${marker}${selected}${marker}${text.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + marker.length;
      textarea.setSelectionRange(cursor, cursor + selected.length);
    });
  };

  const prefixLines = (prefix) => {
    const textarea = textareaRef.current;
    const text = value || '';
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = text.indexOf('\n', end);
    const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
    const selectedLines = text.slice(lineStart, lineEnd);
    const lines = selectedLines.split('\n');
    const removePrefix = lines.every((line) => line.startsWith(prefix));
    const nextLines = lines.map((line) => removePrefix ? line.slice(prefix.length) : `${prefix}${line}`);
    const replacement = nextLines.join('\n');
    onChange(`${text.slice(0, lineStart)}${replacement}${text.slice(lineEnd)}`);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const offset = (removePrefix ? -prefix.length : prefix.length) * lines.length;
      textarea.setSelectionRange(Math.max(lineStart, start + (removePrefix ? -prefix.length : prefix.length)), Math.max(lineStart, end + offset));
    });
  };

  const actions = [
    { label: 'Bold', icon: Bold, run: () => wrapSelection('**') },
    { label: 'Italic', icon: Italic, run: () => wrapSelection('*') },
    { label: 'Highlight', icon: Highlighter, run: () => wrapSelection('==') },
    { label: 'Inline code', icon: Code2, run: () => wrapSelection('`') },
    { label: 'Heading', icon: Heading2, run: () => prefixLines('## ') },
    { label: 'Bulleted list', icon: List, run: () => prefixLines('- ') },
    { label: 'Numbered list', icon: ListOrdered, run: () => prefixLines('1. ') },
    { label: 'Quote', icon: Quote, run: () => prefixLines('> ') },
  ];

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
      {!preview && actions.map(({ label, icon: Icon, run }) => <button key={label} type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={run} aria-label={`${label} selected text`} title={label}><Icon size={14} /><span className="hidden sm:inline">{label}</span></button>)}
      <button type="button" className={`btn-ghost min-h-8 px-2 text-xs ${preview ? 'bg-white text-green-900' : ''}`} onClick={() => setPreview((current) => !current)} aria-pressed={preview}>{preview ? <Pencil size={14} /> : <Eye size={14} />}{preview ? 'Edit' : 'Preview'}</button>
      <span className="ml-auto pr-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{(value || '').length.toLocaleString()} / {maxLength.toLocaleString()}</span>
    </div>
    {preview
      ? <div className="min-h-40 bg-white p-4 sm:p-5"><MarkdownContent content={value} className="max-w-4xl" /></div>
      : <textarea
        ref={textareaRef}
        className="block w-full resize-y bg-white px-4 py-4 font-sans text-sm leading-7 text-slate-800 outline-none"
        style={{ minHeight }}
        maxLength={maxLength}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Lesson content in Markdown"
      />}
  </div>;
}
