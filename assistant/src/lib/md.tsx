import { createElement, type ReactNode } from 'react';

/* ============================================================================
   A ~90-line markdown renderer (headings, lists, tasks, code, quotes, links,
   bold/italic/code) that returns React nodes — no dangerouslySetInnerHTML.
   ========================================================================== */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const rx = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(createElement('strong', { key }, tok.slice(2, -2)));
    else if (tok.startsWith('~~')) out.push(createElement('s', { key }, tok.slice(2, -2)));
    else if (tok.startsWith('`')) out.push(createElement('code', { key }, tok.slice(1, -1)));
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      out.push(createElement('a', { key, href: mm?.[2], target: '_blank', rel: 'noreferrer noopener' }, mm?.[1] ?? tok));
    } else if (tok.startsWith('http')) out.push(createElement('a', { key, href: tok, target: '_blank', rel: 'noreferrer noopener' }, tok));
    else out.push(createElement('em', { key }, tok.slice(1, -1)));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ children }: { children: string }) {
  const lines = (children ?? '').replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let list: ReactNode[] = [];
  let listKind: 'ul' | 'ol' | 'task' | null = null;
  let code: string[] | null = null;
  let quote: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    const tag = listKind === 'ol' ? 'ol' : 'ul';
    nodes.push(createElement(tag, { key: `l${nodes.length}`, className: listKind === 'task' ? 'md-task' : undefined }, list));
    list = [];
    listKind = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    nodes.push(createElement('blockquote', { key: `q${nodes.length}` }, quote.map((q, i) => createElement('div', { key: i }, inline(q, `qi${i}`)) )));
    quote = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '');
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      if (code) {
        nodes.push(
          createElement('pre', { key: `c${idx}` }, createElement('code', null, code.join('\n'))),
        );
        code = null;
      } else {
        flushList();
        flushQuote();
        code = [];
      }
      return;
    }
    if (code) {
      code.push(raw);
      return;
    }
    if (/^\s*>\s?/.test(line)) {
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ''));
      return;
    }
    flushQuote();
    if (!line.trim()) {
      flushList();
      return;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = Math.min(h[1].length + 1, 6) as 2 | 3 | 4 | 5 | 6;
      nodes.push(createElement(`h${level}`, { key: `h${idx}` }, inline(h[2], `h${idx}`)));
      return;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushList();
      nodes.push(createElement('hr', { key: `r${idx}` }));
      return;
    }
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      if (listKind && listKind !== 'task') flushList();
      listKind = 'task';
      list.push(
        createElement('li', { key: `t${idx}`, className: 'task' }, createElement('input', { type: 'checkbox', checked: task[1] !== ' ', readOnly: true }), inline(task[2], `ti${idx}`)),
      );
      return;
    }
    const ul = /^\s*[-*+•]\s+(.*)$/.exec(line);
    if (ul) {
      if (listKind === 'ol') flushList();
      listKind = 'ul';
      list.push(createElement('li', { key: `u${idx}` }, inline(ul[1], `ui${idx}`)));
      return;
    }
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      if (listKind === 'ul' || listKind === 'task') flushList();
      listKind = 'ol';
      list.push(createElement('li', { key: `o${idx}` }, inline(ol[2], `oi${idx}`)));
      return;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
      const row = createElement(
        'div',
        { key: `row${idx}`, className: 'md-row' },
        cells.map((c, i) => createElement('span', { key: i, className: 'md-cell' }, inline(c, `rc${idx}${i}`))),
      );
      nodes.push(row);
      return;
    }
    flushList();
    nodes.push(createElement('p', { key: `p${idx}` }, inline(line, `pi${idx}`)));
  });
  flushList();
  flushQuote();
  const tail = code as string[] | null;
  if (tail) nodes.push(createElement('pre', { key: 'c-end' }, createElement('code', null, tail.join('\n'))));

  return createElement('div', { className: 'md' }, ...nodes);
}
