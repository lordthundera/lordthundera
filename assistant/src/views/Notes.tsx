import { useMemo, useRef, useState } from 'react';
import { Card, Confirm, CopyButton, Empty, Field, Icon, Segmented, useToast } from '../components/ui';
import type { Note } from '../store/store';
import { useApp } from '../store/store';
import { formatJalaliShort, localizeDigits, normalizeText, relTime } from '../lib/date';
import { Markdown } from '../lib/md';
import { stats, summarize } from '../lib/text';
import { useActions } from '../components/actions';

/* =====================================================================
   Notes — markdown, tags, pin, live preview, and "ask about this note".
   ===================================================================== */

export function Notes() {
  const { state, add, patch, remove } = useApp();
  const push = useToast();
  const { openChat, openPalette } = useActions();
  const lang = state.settings.lang;
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [mode, setMode] = useState<'edit' | 'split' | 'read'>('split');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const notes = state.collections.notes;
  const filtered = useMemo(() => {
    let arr = [...notes];
    if (tag) arr = arr.filter((n) => n.tags.includes(tag));
    if (q.trim()) {
      const needle = normalizeText(q).toLowerCase();
      arr = arr.filter((n) => (n.title + n.body + n.tags.join(' ')).toLowerCase().includes(needle));
    }
    return arr.sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [notes, q, tag]);

  const current = filtered.find((n) => n.id === sel) ?? notes.find((n) => n.id === sel) ?? null;
  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  const st = current ? stats(current.title + '\n' + current.body) : null;

  const create = (title = '', body = '') => {
    const n: Omit<Note, 'id'> = {
      title: title || (lang === 'fa' ? 'یادداشت بی‌نام' : 'Untitled'),
      body,
      tags: [],
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const id = add('notes', n as never, 'یادداشت');
    setSel(id);
    return id;
  };

  return (
    <div className="grid fade-in" style={{ gap: 14, gridTemplateColumns: 'minmax(240px, 300px) minmax(0,1fr)' }} id="notes-grid">
      <Card pad0 className="col" style={{ gap: 0, overflow: 'hidden' }}>
        <div className="col" style={{ gap: 8, padding: 12 }}>
          <div className="row tight">
            <input className="input" placeholder={lang === 'fa' ? 'جست‌وجو در یادداشت‌ها' : 'Search notes'} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={() => create()} title={lang === 'fa' ? 'یادداشت جدید' : 'New note'}>
              <Icon name="plus" size={15} />
            </button>
          </div>
          <div className="row tight" style={{ flexWrap: 'wrap' }}>
            <button className={`chip ${tag === '' ? 'ok' : ''}`} onClick={() => setTag('')}>
              {lang === 'fa' ? 'همه' : 'All'} ({localizeDigits(String(notes.length), lang)})
            </button>
            {allTags.map((t) => (
              <button key={t} className={`chip ${tag === t ? 'ok' : ''}`} onClick={() => setTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        </div>
        <div className="note-list" style={{ padding: '0 8px 8px', maxHeight: 'calc(100dvh - 300px)' }}>
          {filtered.length === 0 ? (
            <Empty
              icon="🗒"
              title={lang === 'fa' ? 'یادداشتی نیست' : 'No notes'}
              action={
                <button className="btn primary" onClick={() => create()}>
                  {lang === 'fa' ? 'اولین یادداشت' : 'New note'}
                </button>
              }
            />
          ) : (
            filtered.map((n) => (
              <div key={n.id} className={`note-tile ${sel === n.id ? 'sel' : ''}`} onClick={() => setSel(n.id)}>
                <div className="row between" style={{ gap: 6 }}>
                  <b className="truncate" style={{ fontSize: 13.5 }}>
                    {n.pinned ? '📌 ' : ''}
                    {n.title}
                  </b>
                  <span className="tiny nowrap">{relTime(n.updatedAt, new Date(), lang)}</span>
                </div>
                <div className="ex">{normalizeText(n.body.replace(/[#*`>-]/g, '')).slice(0, 110) || (lang === 'fa' ? 'بدون متن' : 'empty')}</div>
                {n.tags.length ? (
                  <div className="row tight" style={{ marginTop: 4 }}>
                    {n.tags.map((t) => (
                      <span key={t} className="chip tag">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      {current ? (
        <Card pad0 className="col" style={{ gap: 0 }}>
          <div className="row between" style={{ padding: 12, borderBottom: '1px solid var(--line)', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ border: 0, background: 'transparent', fontSize: 17, fontWeight: 700, maxWidth: 420, padding: '2px 4px' }}
              value={current.title}
              onChange={(e) => patch('notes', current.id, { title: e.target.value, updatedAt: new Date().toISOString() })}
            />
            <div className="row tight">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'edit', label: lang === 'fa' ? 'ویرایش' : 'Edit' },
                  { value: 'split', label: lang === 'fa' ? 'هر دو' : 'Split' },
                  { value: 'read', label: lang === 'fa' ? 'نمایش' : 'Read' },
                ]}
              />
              <button className={`icon-btn ${current.pinned ? 'on' : ''}`} title="Pin" onClick={() => patch('notes', current.id, { pinned: !current.pinned })}>
                <Icon name="pin" size={16} />
              </button>
              <button
                className="icon-btn"
                title={lang === 'fa' ? 'دربارهٔ این یادداشت بپرس' : 'Ask about this note'}
                onClick={() => openChat((lang === 'fa' ? `دربارهٔ یادداشت «${current.title}» خلاصه‌اش را بگو:\n` : `Summarise the note “${current.title}”:\n`) + current.body.slice(0, 1200))}
              >
                <Icon name="robot" size={16} />
              </button>
              <button
                className="icon-btn"
                title={lang === 'fa' ? 'خلاصه‌سازی خودکار' : 'Auto-summarise'}
                onClick={() => {
                  const { summary } = summarize(current.body, 3);
                  if (!summary.trim()) return push('متنی برای خلاصه کردن نیست', 'warn');
                  patch('notes', current.id, { body: `> خلاصهٔ دستیار:\n${summary.split('\n').join('\n> ')}\n\n${current.body}`, updatedAt: new Date().toISOString() });
                  push('📝 خلاصه به ابتدای یادداشت اضافه شد', 'success');
                }}
              >
                <Icon name="spark" size={16} />
              </button>
              <CopyButton text={current.body} />
              <button
                className="icon-btn"
                title={lang === 'fa' ? 'خروجی Markdown' : 'Download .md'}
                onClick={() => {
                  const blob = new Blob([`# ${current.title}\n\n${current.body}`], { type: 'text/markdown' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = current.title.replace(/[\\/:*?"<>|]/g, '') + '.md';
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Icon name="download" size={16} />
              </button>
              <Confirm
                text={lang === 'fa' ? 'حذف یادداشت؟' : 'Delete note?'}
                onYes={() => {
                  remove('notes', current.id, 'حذف یادداشت');
                  setSel(null);
                  push('🗑 حذف شد — Ctrl+Z برای بازگردانی', 'warn');
                }}
              >
                <Icon name="trash" size={16} />
              </Confirm>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: mode === 'split' ? '1fr 1fr' : '1fr', minHeight: 0, flex: 1 }} className="note-pane">
            {mode !== 'read' ? (
              <textarea
                ref={bodyRef}
                className="md-editor"
                style={{ padding: 14, borderInlineEnd: mode === 'split' ? '1px solid var(--line)' : 0 }}
                value={current.body}
                placeholder={lang === 'fa' ? 'بنویس… پشتیبانی از # سرفصل، - فهرست، **مهم**، `کد`، > نقل‌قول، - [ ] چک‌لیست' : 'Write… markdown supported'}
                onChange={(e) => patch('notes', current.id, { body: e.target.value, updatedAt: new Date().toISOString() })}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const s = el.selectionStart;
                    const body = current.body.slice(0, s) + '  ' + current.body.slice(el.selectionEnd);
                    patch('notes', current.id, { body, updatedAt: new Date().toISOString() });
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = s + 2;
                    });
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const sel2 = current.body.slice(el.selectionStart, el.selectionEnd);
                    const body = current.body.slice(0, el.selectionStart) + `**${sel2}**` + current.body.slice(el.selectionEnd);
                    patch('notes', current.id, { body, updatedAt: new Date().toISOString() });
                  }
                }}
              />
            ) : null}
            {mode !== 'edit' ? (
              <div style={{ padding: 14, overflow: 'auto' }}>
                <Markdown>{current.body}</Markdown>
              </div>
            ) : null}
          </div>

          <div className="row between tiny" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
            <div className="row tight">
              <Field label="">
                <div className="row tight">
                  {current.tags.map((t) => (
                    <span key={t} className="chip tag">
                      #{t}
                      <button className="icon-btn" style={{ width: 14, height: 14 }} onClick={() => patch('notes', current.id, { tags: current.tags.filter((x) => x !== t) })}>
                        <Icon name="close" size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="input"
                    style={{ width: 90, padding: '2px 6px', fontSize: 12 }}
                    placeholder="#برچسب"
                    onKeyDown={(e) => {
                      const el = e.currentTarget;
                      if (e.key === 'Enter' && el.value.trim()) {
                        patch('notes', current.id, { tags: [...new Set([...current.tags, normalizeText(el.value).replace(/^#/, '')])] });
                        el.value = '';
                      }
                    }}
                  />
                </div>
              </Field>
            </div>
            <div className="row tight">
              <span>
                {st ? `${localizeDigits(String(st.words), lang)} واژه · ${localizeDigits(String(st.chars), lang)} نویسه · ${localizeDigits(String(st.readingMinutes), lang)} دقیقه خواندن` : ''}
              </span>
              <span>· {formatJalaliShort(current.updatedAt)}</span>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const t = ['## امروز', '', '- [ ] ', '- [ ] ', '', '> نکته: '].join('\n');
                  patch('notes', current.id, { body: current.body ? current.body + '\n\n' + t : t, updatedAt: new Date().toISOString() });
                  openPalette();
                }}
              >
                + قالب
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <Empty
            icon="📝"
            title={lang === 'fa' ? 'یک یادداشت انتخاب کن یا بساز' : 'Pick a note or write a new one'}
            hint={lang === 'fa' ? 'یادداشت‌ها روی همین دستگاه ذخیره می‌شوند؛ هیچ‌جا ارسال نمی‌شوند.' : 'Notes stay on this device — nothing is sent anywhere.'}
            action={
              <button className="btn primary" onClick={() => create()}>
                {lang === 'fa' ? 'یادداشت جدید' : 'New note'}
              </button>
            }
          />
        </Card>
      )}
    </div>
  );
}
