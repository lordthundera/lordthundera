import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui';
import { exportBlob, useApp } from '../store/store';
import { parse, describe, type Intent } from '../lib/nl';
import { defaultHits, search, type Hit } from '../lib/search';
import { useActions } from './actions';
import { applyAll } from '../lib/apply';
import { useToast } from './ui';

/* =====================================================================
   ⌘K — one bar for everything: commands, natural language, and search.
   ===================================================================== */

type Row = { kind: 'run'; label: string; intents: Intent[] } | { kind: 'hit'; hit: Hit } | { kind: 'hint'; label: string };

export function CommandSheet({ open, prefill, onClose }: { open: boolean; prefill?: string; onClose: () => void }) {
  const { state, add, patch, remove, dispatch } = useApp();
  const { go, startTimer, openChat } = useActions();
  const push = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lang = state.settings.lang;

  useEffect(() => {
    if (!open) return;
    setQ(prefill ?? '');
    setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open, prefill]);

  const parsed = useMemo(() => (q.trim() ? parse(q, { now: new Date() }) : null), [q, open]);
  const hits = useMemo(() => (q.trim() ? search(q, state) : defaultHits(state, lang)), [q, state, lang]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const intents = parsed?.intents ?? [];
    if (intents.length) out.push({ kind: 'run', label: lang === 'fa' ? 'اجرا کن' : 'Run it', intents });
    for (const h of hits) out.push({ kind: 'hit', hit: h });
    if (!out.length && q.trim()) out.push({ kind: 'hint', label: lang === 'fa' ? 'چیزی پیدا نشد — Enter را بزن تا به دستیار بپرسم' : 'Nothing found — press Enter to ask the assistant' });
    return out;
  }, [parsed, hits, q, lang]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  if (!open) return null;

  const runIntents = (intents: Intent[]) => {
    const res = applyAll(intents, { add, patch, remove, state, go, startTimer });
    if (res.asks.length) {
      onClose();
      openChat(res.asks.join('\n'));
      return;
    }
    const lines = res.lines.filter((l) => !l.startsWith('→'));
    push(lines.length ? lines.join('\n') : lang === 'fa' ? 'انجام شد' : 'done', 'success');
    setQ('');
    onClose();
  };

  const activate = (row: Row | undefined) => {
    if (!row) {
      if (q.trim()) {
        onClose();
        openChat(q);
      }
      return;
    }
    if (row.kind === 'run') runIntents(row.intents);
    else if (row.kind === 'hit') {
      const h = row.hit;
      if (h.view.startsWith('action:')) {
        const a = h.view.slice(7);
        const map: Record<string, () => void> = {
          'new-task': () => setQ(lang === 'fa' ? '/task ' : '/task '),
          'new-note': () => setQ('/note '),
          'new-event': () => setQ(lang === 'fa' ? '/event ' : '/event '),
          'new-expense': () => setQ('/money '),
          'new-income': () => setQ('/income '),
          'new-habit': () => setQ(lang === 'fa' ? '/habit ' : '/habit '),
          water: () => runIntents([{ kind: 'health', field: 'water', amount: 1, date: new Date().toISOString().slice(0, 10), mode: 'add' }]),
          timer: () => (onClose(), startTimer(25, lang === 'fa' ? 'کار عمیق' : 'deep work')),
          chat: () => (onClose(), openChat()),
          brief: () => (onClose(), openChat(lang === 'fa' ? 'وضعیت امروز من چطوره؟' : 'how is my day going?')),
          theme: () => {
            const next = (document.documentElement.dataset.theme ?? 'light') === 'dark' ? 'light' : 'dark';
            dispatch({ type: 'settings', patch: { theme: next } });
            onClose();
          },
          export: () => {
            const blob = new Blob([exportBlob(state)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'assistant-backup.json';
            a.click();
            onClose();
          },
          import: () => (onClose(), go('settings')),
          model: () => (onClose(), go('settings')),
        };
        map[a]?.();
        return;
      }
      onClose();
      go(h.view, h.id ? { id: h.id } : undefined);
    } else if (q.trim()) {
      onClose();
      openChat(q);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ width: 'min(760px, 100%)' }} role="dialog" aria-modal="true">
        <div className="row" style={{ padding: '0 4px 0 14px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="bolt" size={18} style={{ color: 'var(--brand)' }} />
          <input
            ref={inputRef}
            className="cmd-input"
            value={q}
            placeholder={lang === 'fa' ? 'بگو چه کاری کنم… «فردا ساعت ۹ جلسه با تیم» یا «خرج شام ۴۵۰ هزار» یا «کجاست یادداشت بودجه؟»' : 'Tell me what to do… “meeting with team tomorrow 9am”, “spent 450 on dinner”, or “budget note”'}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(rows.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                activate(rows[sel]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          {q ? (
            <button className="icon-btn" onClick={() => setQ('')} title="clear">
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>

        {parsed && parsed.intents.length ? (
          <div className="col" style={{ padding: '10px 16px', gap: 6, borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
            {parsed.intents.map((i, idx) => (
              <div key={idx} className="row tight" style={{ gap: 8 }}>
                <span className="chip ok" style={{ fontSize: 11 }}>
                  {i.kind}
                </span>
                <span style={{ fontSize: 13.5 }}>{describe(i, lang)}</span>
              </div>
            ))}
            {parsed.notes.map((nn, idx) => (
              <div key={'n' + idx} className="tiny" style={{ color: 'var(--warn)' }}>
                ⚠ {nn}
              </div>
            ))}
          </div>
        ) : null}

        <div className="results" ref={listRef}>
          {rows.map((r, i) => {
            if (r.kind === 'run')
              return (
                <div key="run" className={`res ${sel === i ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => activate(r)}>
                  <span className="tick on" style={{ borderRadius: 9, width: 20, height: 20 }}>
                    <Icon name="bolt" size={12} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="res-title">
                      {lang === 'fa' ? 'انجامش بده' : 'Do it'} · {r.intents.map((x) => x.kind).join(' + ')}
                    </div>
                    <div className="res-sub truncate">{q}</div>
                  </div>
                  <kbd>↵</kbd>
                </div>
              );
            if (r.kind === 'hint')
              return (
                <div key="hint" className="res" onClick={() => activate(r)}>
                  <Icon name="robot" size={16} />
                  <div className="res-title">{r.label}</div>
                </div>
              );
            const h = r.hit;
            return (
              <div key={h.group + h.title + i} className={`res ${sel === i ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => activate(r)}>
                <Icon name={h.icon} size={16} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="res-title truncate">{h.title}</div>
                  {h.sub ? <div className="res-sub truncate">{h.sub}</div> : null}
                </div>
                <span className="tiny">{h.group}</span>
              </div>
            );
          })}
        </div>

        <div className="cmd-hint">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span className="tiny">{lang === 'fa' ? 'جابه‌جایی' : 'move'}</span>
          <kbd>↵</kbd>
          <span className="tiny">{lang === 'fa' ? 'اجرا' : 'run'}</span>
          <kbd>esc</kbd>
          <span className="tiny">{lang === 'fa' ? 'بستن' : 'close'}</span>
          <span className="spacer" />
          <span className="row tight" style={{ gap: 4 }}>
            {['/task', '/note', '/money', '/event', '/timer', '/habit', '/ask'].map((c) => (
              <button
                key={c}
                className="chip clickable"
                onClick={() => {
                  setQ(c + ' ');
                  inputRef.current?.focus();
                }}
              >
                {c}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
