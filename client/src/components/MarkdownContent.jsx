function renderInline(value) {
  const tokenPattern = /(\*\*[^*]+\*\*|==[^=]+==|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  return value.split(tokenPattern).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('==') && part.endsWith('==')) return <mark key={index} className="rounded bg-yellow-200 px-0.5 text-slate-900">{part.slice(2, -2)}</mark>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2], window.location.origin);
        if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="font-medium text-green-800 underline">{link[1]}</a>;
        }
      } catch {
        return part;
      }
    }
    return part;
  });
}

export default function MarkdownContent({ content, className = '' }) {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4';
      blocks.push(<Tag key={index} className="font-bold text-slate-900">{renderInline(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(<li key={index}>{renderInline(lines[index].trim().slice(2))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`} className="list-disc space-y-1 pl-6">{items}</ul>);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(<li key={index}>{renderInline(lines[index].trim().replace(/^\d+\.\s+/, ''))}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`} className="list-decimal space-y-1 pl-6">{items}</ol>);
      continue;
    }
    if (line.startsWith('> ')) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(renderInline(lines[index].trim().slice(2)));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`} className="border-l-2 border-green-700 pl-4 text-slate-600">{quote.map((part, quoteIndex) => <p key={quoteIndex}>{part}</p>)}</blockquote>);
      continue;
    }
    if (/^(---|\*\*\*|___)$/.test(line)) {
      blocks.push(<hr key={index} className="border-slate-200" />);
      index += 1;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        const cells = lines[index].trim().split('|').slice(1, -1).map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      blocks.push(<div key={`table-${index}`} className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-200">{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} className="bg-slate-50 px-3 py-2 font-semibold">{renderInline(cell)}</th> : <td key={cellIndex} className="px-3 py-2">{renderInline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s/.test(lines[index].trim()) && !/^\s*[-*]\s+/.test(lines[index]) && !/^\s*\d+\.\s+/.test(lines[index]) && !lines[index].trim().startsWith('> ') && !lines[index].trim().startsWith('|')) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={index} className="leading-7">{renderInline(paragraph.join(' '))}</p>);
  }
  return <div className={`space-y-4 break-words text-sm text-slate-700 ${className}`}>{blocks}</div>;
}
