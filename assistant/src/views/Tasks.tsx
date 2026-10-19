import { useEffect, useMemo, useState } from 'react';
import { Card, Confirm, Empty, Field, Icon, Modal, Segmented, TagInput, useToast } from '../components/ui';
import type { Coll, ID, Priority, Task } from '../store/store';
import { effectiveDone, isOverdue, useApp } from '../store/store';
import { formatJalaliShort, localizeDigits, normalizeText, relTime, ymd } from '../lib/date';
import { TaskRow, PRIORITY_COLOR } from '../components/TaskRow';
import { useActions } from '../components/actions';
import { parse } from '../lib/nl';
import { applyAll } from '../lib/apply';

/* =====================================================================
   Tasks — capture, triage, plan. Filters, grouping, subtasks, projects.
   ===================================================================== */

type Filter = 'all' | 'today' | 'upcoming' | 'someday' | 'done';
type Group = 'none' | 'priority' | 'project' | 'due' | 'tag';

export function Tasks({ payload }: { payload?: { id?: string } }) {
  const { state, add, patch, remove, dispatch } = useApp();
  const { go, openPalette, startTimer, openChat } = useActions();
  const push = useToast();
  const lang = state.settings.lang;
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState<Group>('priority');
  const [q, setQ] = useState('');
  const [project, setProject] = useState<ID | ''>('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState('');

  useEffect(() => {
    if (payload?.id) {
      const t = state.collections.tasks.find((x) => x.id === payload.id);
      if (t) setEditing(t);
    }
  }, [payload?.id]);

  const t0 = state.collections.tasks;
  const list = useMemo(() => {
    const now = new Date();
    let arr = [...t0];
    if (project) arr = arr.filter((t) => t.projectId === project);
    if (q.trim()) {
      const needle = normalizeText(q).toLowerCase();
      arr = arr.filter((t) => (t.title + ' ' + t.tags.join(' ') + ' ' + (t.notes ?? '')).toLowerCase().includes(needle));
    }
    switch (filter) {
      case 'today':
        arr = arr.filter((t) => !effectiveDone(t) && t.due && (ymd(new Date(t.due)) === ymd(now) || new Date(t.due) < now));
        break;
      case 'upcoming':
        arr = arr.filter((t) => !effectiveDone(t) && t.due && ymd(new Date(t.due)) > ymd(now));
        break;
      case 'someday':
        arr = arr.filter((t) => !effectiveDone(t) && !t.due);
        break;
      case 'done':
        arr = arr.filter((t) => effectiveDone(t));
        break;
      default:
        if (!showDone) arr = arr.filter((t) => !effectiveDone(t));
    }
    const cmp: Record<Group, (a: Task, b: Task) => number> = {
      none: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      priority: (a, b) => b.priority - a.priority || (a.due ? +new Date(a.due) : Infinity) - (b.due ? +new Date(b.due) : Infinity),
      project: (a, b) => (a.projectId ?? 'zzz').localeCompare(b.projectId ?? 'zzz'),
      due: (a, b) => (a.due ? +new Date(a.due) : Infinity) - (b.due ? +new Date(b.due) : Infinity),
      tag: (a, b) => (a.tags[0] ?? 'zzz').localeCompare(b.tags[0] ?? 'zzz'),
    };
    return arr.sort(cmp[group]);
  }, [t0, filter, group, q, project, showDone, now()]);

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: '', items: list }];
    const map = new Map<string, Task[]>();
    for (const t of list) {
      let key: string;
      if (group === 'priority') key = ['', 'کم‌اهمیت', 'معمولی', 'فوری'][t.priority] ?? '—';
      else if (group === 'project') key = state.collections.projects.find((p) => p.id === t.projectId)?.name ?? (lang === 'fa' ? 'بدون پروژه' : 'No project');
      else if (group === 'due') key = t.due ? (new Date(t.due) < new Date() && !effectiveDone(t) ? (lang === 'fa' ? 'عقب‌افتده' : 'Overdue') : formatJalaliShort(t.due)) : lang === 'fa' ? 'بدون تاریخ' : 'No date';
      else key = t.tags[0] ?? (lang === 'fa' ? 'بدون برچسب' : 'Untagged');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [list, group, state.collections.projects, lang]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      open: t0.filter((t) => !effectiveDone(t)).length,
      today: t0.filter((t) => !effectiveDone(t) && t.due && (ymd(new Date(t.due)) === ymd(now) || new Date(t.due) < now)).length,
      overdue: t0.filter(isOverdue).length,
      done: t0.filter((t) => effectiveDone(t)).length,
    };
  }, [t0]);

  const addQuick = () => {
    if (!quick.trim()) return;
    const { intents } = parse(quick, { now: new Date() });
    const res = applyAll(intents, {
      add,
      patch,
      remove: (c: Coll, id: string) => dispatch({ type: 'remove', coll: c, id }),
      state,
      go,
      startTimer,
    });
    if (res.asks.length) openChat(res.asks.join('\n'));
    else push(res.lines.filter((l) => !l.startsWith('→')).join('\n') || '—', 'success');
    setQuick('');
  };

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <Card>
        <div className="row between" style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div className="row tight" style={{ gap: 14 }}>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'باز' : 'Open'}</span>
              <span className="v">{localizeDigits(String(counts.open), lang)}</span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'امروز' : 'Due today'}</span>
              <span className="v" style={{ color: counts.today ? 'var(--warn)' : undefined }}>
                {localizeDigits(String(counts.today), lang)}
              </span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'عقب‌افتاده' : 'Overdue'}</span>
              <span className="v" style={{ color: counts.overdue ? 'var(--bad)' : undefined }}>
                {localizeDigits(String(counts.overdue), lang)}
              </span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'انجام‌شده' : 'Done'}</span>
              <span className="v" style={{ color: 'var(--ok)' }}>{localizeDigits(String(counts.done), lang)}</span>
            </div>
          </div>
          <div className="row tight">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: lang === 'fa' ? 'همه' : 'All' },
                { value: 'today', label: lang === 'fa' ? 'امروز' : 'Today' },
                { value: 'upcoming', label: lang === 'fa' ? 'بعدی' : 'Upcoming' },
                { value: 'someday', label: lang === 'fa' ? 'بی‌تاریخ' : 'Someday' },
                { value: 'done', label: lang === 'fa' ? 'انجام‌شده' : 'Done' },
              ]}
            />
            <button className="btn sm" onClick={() => openPalette('/task ')}>
              <Icon name="plus" size={14} /> {lang === 'fa' ? 'کار جدید' : 'New task'}
            </button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <div className="row tight" style={{ flex: 1, minWidth: 220 }}>
            <span className="tiny">⚡</span>
            <input
              className="input"
              placeholder={lang === 'fa' ? 'سریع بنویس: «فردا ساعت ۱۰ ارائه بدهم #کار»' : 'Quick capture: “give the demo tomorrow 10am #work”'}
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuick()}
            />
          </div>
          <input className="input" style={{ maxWidth: 190 }} placeholder={lang === 'fa' ? 'جست‌وجو' : 'Search'} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ maxWidth: 170 }} value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            <option value="priority">{lang === 'fa' ? 'گروه: اولویت' : 'Group: priority'}</option>
            <option value="due">{lang === 'fa' ? 'گروه: تاریخ' : 'Group: date'}</option>
            <option value="project">{lang === 'fa' ? 'گروه: پروژه' : 'Group: project'}</option>
            <option value="tag">{lang === 'fa' ? 'گروه: برچسب' : 'Group: tag'}</option>
            <option value="none">{lang === 'fa' ? 'بدون گروه' : 'No grouping'}</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} disabled={filter !== 'all'} /> {lang === 'fa' ? 'نمایش انجام‌شده' : 'Show done'}
          </label>
        </div>
      </Card>

      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 250px' }}>
        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          {groups.length === 0 || (groups.length === 1 && !groups[0].items.length) ? (
            <Card>
              <Empty
                icon="🗒"
                title={lang === 'fa' ? 'اینجا خالی است' : 'Nothing here'}
                hint={lang === 'fa' ? 'یک کار بنویس یا از نوار فرمان استفاده کن (Ctrl/⌘ + K).' : 'Write a task or use the command bar (Ctrl/⌘ + K).'}
                action={
                  <button className="btn primary" onClick={() => openPalette('/task ')}>
                    <Icon name="plus" size={15} /> {lang === 'fa' ? 'افزودن کار' : 'Add task'}
                  </button>
                }
              />
            </Card>
          ) : (
            groups.map((g) => (
              <Card key={g.key || 'all'} pad0>
                {g.key ? (
                  <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <b style={{ fontSize: 13.5 }}>{g.key}</b>
                    <span className="badge soft">{localizeDigits(String(g.items.length), lang)}</span>
                  </div>
                ) : null}
                <div className="list">
                  {g.items.map((t) => (
                    <TaskRow key={t.id} task={t} onEdit={setEditing} />
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="col">
          <Card
            title={
              <>
                <Icon name="flag" size={16} /> {lang === 'fa' ? 'پروژه‌ها' : 'Projects'}
              </>
            }
            action={<ProjectEditor />}
          >
            <div className="col" style={{ gap: 4 }}>
              <button className={`nav-item ${project === '' ? 'active' : ''}`} style={{ padding: '6px 8px' }} onClick={() => setProject('')}>
                <Icon name="tasks" size={15} /> {lang === 'fa' ? 'همهٔ کارها' : 'All tasks'}
                <span className="badge">{localizeDigits(String(t0.length), lang)}</span>
              </button>
              {state.collections.projects.map((p) => (
                <div key={p.id} className={`nav-item ${project === p.id ? 'active' : ''}`} style={{ padding: '6px 8px' }}>
                  <button
                    style={{ display: 'contents', cursor: 'pointer', background: 'none', border: 0, color: 'inherit', textAlign: 'start' }}
                    onClick={() => setProject(p.id)}
                  >
                    <i style={{ width: 9, height: 9, borderRadius: 9, background: p.color, display: 'inline-block' }} />
                    <span style={{ marginInlineStart: 6 }}>{p.name}</span>
                  </button>
                  <span className="badge">{localizeDigits(String(t0.filter((t) => t.projectId === p.id && !effectiveDone(t)).length), lang)}</span>
                  <Confirm
                    text={lang === 'fa' ? 'حذف پروژه؟' : 'Delete project?'}
                    onYes={() => {
                      remove('projects', p.id, 'حذف پروژه');
                      t0.filter((t) => t.projectId === p.id).forEach((t) => patch('tasks', t.id, { projectId: undefined }));
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </Confirm>
                </div>
              ))}
            </div>
          </Card>

          <Card title={lang === 'fa' ? 'راهنمای دستور' : 'Command hints'} flat>
            <div className="col" style={{ gap: 6 }}>
              {(lang === 'fa'
                ? ['فردا ساعت ۹ جلسه با تیم', 'یادم باشه جمعه گزارش بفرستم', 'هر روز ۲۰ دقیقه مطالعه', 'گزارش هفتگی !!! #کار', 'خرج ناهار ۱۵۰ هزار تومان']
                : ['tomorrow 9am team meeting', 'remind me to send the report friday', 'read 20 minutes every day', 'weekly report !!! #work', 'spent 150 on lunch']
              ).map((s) => (
                <button
                  key={s}
                  className="chip clickable"
                  onClick={() => {
                    setQuick(s);
                    push(lang === 'fa' ? 'آماده شد — Enter بزن' : 'Loaded — press Enter');
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {editing ? <TaskEditor task={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

/* needed so the memo above recomputes when the day changes */
function now(): number {
  return Math.floor(Date.now() / 30000);
}

function ProjectEditor() {
  const { add } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b8cff');
  const COLORS = ['#5b8cff', '#24b47e', '#f2a516', '#ef5b6b', '#9b5cff', '#12b8c8'];
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="پروژهٔ جدید">
        <Icon name="plus" size={15} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={<b>پروژهٔ جدید</b>}
        footer={
          <>
            <span className="spacer" />
            <button
              className="btn primary"
              onClick={() => {
                if (!name.trim()) return;
                add('projects', { name: normalizeText(name), color, archived: false } as never, 'پروژه');
                setName('');
                setOpen(false);
              }}
            >
              ساخت
            </button>
          </>
        }
      >
        <div className="col">
          <Field label="نام">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: راه‌اندازی کسب‌وکار" />
          </Field>
          <div className="row tight">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 8, background: c, border: color === c ? '2px solid var(--text)' : '1px solid var(--line)', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ editor */

export function TaskEditor({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { state, add, patch, remove } = useApp();
  const push = useToast();
  const lang = state.settings.lang;
  const isNew = !task;
  const [draft, setDraft] = useState<Task>(
    () =>
      task ?? ({
        title: '',
        done: false,
        priority: 2,
        tags: [],
        subtasks: [],
        kind: 'task',
        repeat: 'none',
        createdAt: new Date().toISOString(),
      } as unknown as Task),
  );
  const [newSub, setNewSub] = useState('');
  const set = (p: Partial<Task>) => setDraft((d) => ({ ...d, ...p }));
  const dtLocal = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

  const save = () => {
    if (!normalizeText(draft.title)) {
      push('عنوان را بنویس', 'warn');
      return;
    }
    const payload = { ...draft, title: normalizeText(draft.title) };
    if (isNew) add('tasks', payload as never, 'ثبت کار');
    else patch('tasks', draft.id, payload, 'ویرایش کار');
    push(isNew ? '✅ ذخیره شد' : '✏️ به‌روز شد', 'success');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <b>
          {isNew ? (lang === 'fa' ? 'کار جدید' : 'New task') : lang === 'fa' ? 'ویرایش کار' : 'Edit task'}
        </b>
      }
      width={620}
      footer={
        <>
          {!isNew ? (
            <Confirm
              text={lang === 'fa' ? 'حذف شود؟' : 'Delete?'}
              onYes={() => {
                remove('tasks', draft.id, 'حذف کار');
                onClose();
              }}
            >
              <span className="row tight" style={{ color: 'var(--bad)' }}>
                <Icon name="trash" size={15} /> {lang === 'fa' ? 'حذف' : 'Delete'}
              </span>
            </Confirm>
          ) : null}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {lang === 'fa' ? 'انصراف' : 'Cancel'}
          </button>
          <button className="btn primary" onClick={save}>
            {lang === 'fa' ? 'ذخیره' : 'Save'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <input className="input" style={{ fontSize: 16, fontWeight: 650 }} autoFocus placeholder={lang === 'fa' ? 'عنوان کار' : 'What needs doing?'} value={draft.title} onChange={(e) => set({ title: e.target.value })} />

        <div className="grid cols-2">
          <Field label={lang === 'fa' ? 'ددلاین / یادآوری' : 'Due / reminder'}>
            <input className="input" type="datetime-local" value={dtLocal(draft.due ?? draft.remindAt)} onChange={(e) => set({ due: fromLocal(e.target.value), remindAt: fromLocal(e.target.value), notified: false })} />
          </Field>
          <Field label={lang === 'fa' ? 'پروژه' : 'Project'}>
            <select className="select" value={draft.projectId ?? ''} onChange={(e) => set({ projectId: (e.target.value || undefined) as ID | undefined })}>
              <option value="">—</option>
              {state.collections.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={lang === 'fa' ? 'اولویت' : 'Priority'}>
            <div className="row tight">
              {([1, 2, 3] as Priority[]).map((p) => (
                <button key={p} className={`btn sm ${draft.priority === p ? 'primary' : ''}`} onClick={() => set({ priority: p })} style={draft.priority === p ? { background: PRIORITY_COLOR[p], borderColor: 'transparent' } : undefined}>
                  {['', 'کم', 'معمولی', 'فوری'][p]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={lang === 'fa' ? 'تکرار' : 'Repeat'}>
            <select className="select" value={draft.repeat ?? 'none'} onChange={(e) => set({ repeat: e.target.value as Task['repeat'] })}>
              <option value="none">{lang === 'fa' ? 'بدون تکرار' : 'No repeat'}</option>
              <option value="daily">{lang === 'fa' ? 'هر روز' : 'Daily'}</option>
              <option value="weekdays">{lang === 'fa' ? 'روزهای کار' : 'Weekdays'}</option>
              <option value="weekly">{lang === 'fa' ? 'هر هفته' : 'Weekly'}</option>
              <option value="monthly">{lang === 'fa' ? 'هر ماه' : 'Monthly'}</option>
            </select>
          </Field>
        </div>

        <Field label={lang === 'fa' ? 'برچسب‌ها' : 'Tags'}>
          <TagInput value={draft.tags} onChange={(tags) => set({ tags })} />
        </Field>

        <Field label={lang === 'fa' ? 'زیرکارها' : 'Subtasks'}>
          <div className="col" style={{ gap: 4 }}>
            {draft.subtasks.map((s) => (
              <div key={s.id} className="row tight">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => set({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
                />
                <input className="input" style={{ padding: '4px 8px' }} value={s.title} onChange={(e) => set({ subtasks: draft.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
                <button className="icon-btn danger" onClick={() => set({ subtasks: draft.subtasks.filter((x) => x.id !== s.id) })}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <div className="row tight">
              <input
                className="input"
                style={{ padding: '5px 8px' }}
                placeholder={lang === 'fa' ? 'زیرکار جدید و Enter' : 'Subtask, then Enter'}
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSub.trim()) {
                    set({ subtasks: [...draft.subtasks, { id: crypto.randomUUID(), title: normalizeText(newSub), done: false }] });
                    setNewSub('');
                  }
                }}
              />
            </div>
          </div>
        </Field>

        <Field label={lang === 'fa' ? 'یادداشت' : 'Notes'}>
          <textarea className="textarea" style={{ minHeight: 74 }} value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {draft.due ? <div className="tiny">⏰ {relTime(draft.due, new Date(), lang)} · {formatJalaliShort(draft.due)}</div> : null}
      </div>
    </Modal>
  );
}
