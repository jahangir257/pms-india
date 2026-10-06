'use client';
import { Fragment } from 'react';

// Lightweight, XSS-safe Markdown renderer (builds React elements, never uses innerHTML).
function inline(text, key) {
  const out = []; const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={`${key}b${i}`} className="underline decoration-brand-900/30 underline-offset-2">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}c${i}`} className="rounded bg-white/70 px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); out.push(<a key={`${key}a${i}`} href={mm[2]} target="_blank" rel="noopener noreferrer" className="underline">{mm[1]}</a>); }
    else out.push(<em key={`${key}i${i}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text = '' }) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = []; let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((ln, idx) => {
    let m;
    if ((m = /^\s*(\d+)[.)]\s+(.*)/.exec(ln))) { if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; } list.items.push(m[2]); }
    else if ((m = /^\s*[-*•]\s+(.*)/.exec(ln))) { if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); }
    else if ((m = /^(#{1,4})\s+(.*)/.exec(ln))) { flush(); blocks.push({ type: 'h', text: m[2] }); }
    else if (!ln.trim()) flush();
    else { flush(); blocks.push({ type: 'p', text: ln }); }
  });
  flush();
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === 'h') return <div key={i} className="text-base tracking-wide text-brand-900">{inline(b.text, i)}</div>;
        if (b.type === 'p') return <p key={i} className="break-words">{inline(b.text, i)}</p>;
        const Tag = b.type;
        return <Tag key={i} className={`${b.type === 'ol' ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>{b.items.map((it, k) => <li key={k} className="break-words">{inline(it, `${i}-${k}`)}</li>)}</Tag>;
      })}
    </div>
  );
}
