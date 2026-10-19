import { useMemo, useState } from 'react';
import { Card, Confirm, Empty, Field, Icon, Modal, Progress, Segmented, useToast } from '../components/ui';
import type { Habit } from '../store/store';
import { habitActive, streak, useApp } from '../store/store';
import { addDays, localizeDigits, normalizeText, startOfDay, toFaDigits, ymd } from '../lib/date';
import { WEEKDAYS_FA_SHORT } from '../lib/jalali';
import { useActions } from '../components/actions';

/* =====================================================================
   Habits — streaks, heatmap, weekly targets.
   ===================================================================== */

const EMOJIS = ['📚', '🏃', '🧘', '💧', '✍️', '🌱', '🎸', '🧠', '🦷', '🛏', '🥗', '💪', '🎧', '🧴', '☀️', '🚭'];

export function Habits() {
  const { state, add, patch, remove } = useApp();
  const push = useToast();
  const { openChat } = useActions();
  const lang = state.settings.lang;
  const habits = state.collections.habits;
  const [adding, setAdding] = useState(false);
  const [range, setRange] = useState<'12w' | '30d' | '90d'>('12w');
  const today = startOfDay(new Date());

  const weekRate = useMemo(() => {
    let done = 0;
    let expected = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, -i);
      for (const h of habits) {
        if (!habitActive(h, d)) continue;
        expected++;
        if ((h.log[ymd(d)] ?? 0) >= h.target) done++;
      }
    }
    return { done, expected, pct: expected ? Math.round((done / expected) * 100) : 0 };
  }, [habits, today]);

  const toggle = (h: Habit, day: Date, value?: number) => {
    const key = ymd(day);
    const log = { ...h.log };
    const v = value ?? (log[key] ?? 0) >= h.target ? 0 : h.target;
    if (v === 0) delete log[key];
    else log[key] = v;
    patch('habits', h.id, { log }, 'عادت');
  };

  const heatCells = (h: Habit): { day: Date; v: number }[] => {
    const days = range === '12w' ? 84 : range === '30d' ? 30 : 90;
    const start = new Date(today.getTime() - (days - 1) * 86400000);
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(start, i);
      return { day: d, v: h.log[ymd(d)] ?? 0 };
    });
  };

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <Card>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row tight" style={{ gap: 22 }}>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'عادت‌ها' : 'Habits'}</span>
              <span className="v">{toFaDigits(String(habits.length))}</span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'هفتهٔ جاری' : 'This week'}</span>
              <span className="v" style={{ color: weekRate.pct >= 70 ? 'var(--ok)' : undefined }}>
                {localizeDigits(String(weekRate.pct), lang)}٪
              </span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'بهترین جریان' : 'Best streak'}</span>
              <span className="v">🔥 {toFaDigits(String(Math.max(0, ...habits.map((h) => streak(h).best))))}</span>
            </div>
          </div>
          <div className="row tight">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: '12w', label: '۱۲ هفته' },
                { value: '90d', label: '۹۰ روز' },
                { value: '30d', label: '۳۰ روز' },
              ]}
            />
            <button className="btn sm primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> {lang === 'fa' ? 'عادت جدید' : 'New habit'}
            </button>
          </div>
        </div>
        {habits.length ? (
          <div style={{ marginTop: 10 }}>
            <Progress value={weekRate.done} max={Math.max(1, weekRate.expected)} label={`${lang === 'fa' ? 'پیشرفت هفته' : 'Weekly progress'} — ${weekRate.done}/${weekRate.expected}`} />
          </div>
        ) : null}
      </Card>

      {!habits.length ? (
        <Card>
          <Empty
            icon="🌱"
            title={lang === 'fa' ? 'هنوز عادتی نساخته‌ای' : 'No habits yet'}
            hint={lang === 'fa' ? 'یک عادت کوچک انتخاب کن؛ ۲ دقیقه‌ای هم کافی است.' : 'Pick one tiny habit — two minutes is enough.'}
            action={
              <div className="row">
                <button className="btn primary" onClick={() => setAdding(true)}>
                  {lang === 'fa' ? 'ساخت عادت' : 'Create habit'}
                </button>
                <button className="btn" onClick={() => openChat(lang === 'fa' ? 'چطور یک عادت را پایدار نگه دارم؟' : 'how do I keep a habit going?')}>
                  {lang === 'fa' ? 'از دستیار بپرس' : 'Ask the assistant'}
                </button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid cols-2">
          {habits.map((h) => {
            const s = streak(h);
            const todayV = h.log[ymd(today)] ?? 0;
            const activeToday = habitActive(h, today);
            const cells = heatCells(h);
            return (
              <Card key={h.id} className="col" style={{ gap: 10 }}>
                <div className="row between">
                  <div className="row tight" style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 22 }}>{h.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <b>{h.name}</b>
                      <div className="tiny">
                        {toFaDigits(String(h.target))} {h.unit} ·{' '}
                        {h.days === 'daily' ? (lang === 'fa' ? 'هر روز' : 'daily') : h.days === 'weekdays' ? (lang === 'fa' ? 'روزهای کار' : 'weekdays') : Array.isArray(h.days) ? h.days.map((d) => WEEKDAYS_FA_SHORT[d]).join('، ') : (lang === 'fa' ? 'آخر هفته' : 'weekend')}
                      </div>
                    </div>
                  </div>
                  <div className="row tight">
                    <span className="chip" title={lang === 'fa' ? 'بهترین رکورد' : 'best'}>
                      🔥 {toFaDigits(String(s.current))}
                    </span>
                    <HabitEditor habit={h} />
                    <Confirm text={lang === 'fa' ? 'حذف عادت و همهٔ سوابق؟' : 'Delete habit + history?'} onYes={() => remove('habits', h.id, 'حذف عادت')}>
                      <Icon name="trash" size={15} />
                    </Confirm>
                  </div>
                </div>

                <div className="row between">
                  <Progress value={todayV} max={h.target} label={activeToday ? (lang === 'fa' ? 'امروز' : 'today') : lang === 'fa' ? 'امروز روز عادت نیست' : 'not scheduled today'} color={h.color} />
                  <div className="row tight" style={{ flex: '0 0 auto' }}>
                    <button className="icon-btn" onClick={() => patch('habits', h.id, { log: { ...h.log, [ymd(today)]: Math.max(0, todayV - 1) } }, 'عادت')}>
                      <Icon name="minus" size={14} />
                    </button>
                    <button
                      className={`tick ${todayV >= h.target ? 'on' : ''}`}
                      style={{ background: todayV >= h.target ? h.color : undefined, borderColor: todayV >= h.target ? h.color : undefined }}
                      onClick={() => toggle(h, today)}
                    >
                      <Icon name="check" size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => patch('habits', h.id, { log: { ...h.log, [ymd(today)]: todayV + 1 } }, 'عادت')}>
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>

                <div className="heat" role="grid" aria-label={h.name}>
                  {cells.map(({ day, v }, i) => {
                    const level = v <= 0 ? '' : v >= h.target ? 'l3' : v >= h.target * 0.66 ? 'l2' : 'l1';
                    const isToday = ymd(day) === ymd(today);
                    return (
                      <i
                        key={i}
                        className={`${level} ${isToday ? 'today' : ''}`}
                        title={`${ymd(day)} · ${v}`}
                        style={v >= h.target ? { background: h.color, borderColor: 'transparent' } : undefined}
                        onClick={() => toggle(h, day, v >= h.target ? 0 : h.target)}
                      />
                    );
                  })}
                </div>
                <div className="row between tiny">
                  <span>{lang === 'fa' ? '۷ روز اخیر' : 'last 7 days'}</span>
                  <span>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(today, -6 + i);
                      return localizeDigits(String((h.log[ymd(d)] ?? 0) >= h.target ? 1 : 0), lang) + (i < 6 ? ' ' : '');
                    }).join('')}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={<b>{lang === 'fa' ? 'عادت جدید' : 'New habit'}</b>} width={520}>
        <HabitForm
          onDone={(v) => {
            add('habits', v as never, 'عادت جدید');
            setAdding(false);
            push('🌱 ' + (lang === 'fa' ? 'عادت ساخته شد. امروز شروع کن.' : 'Habit created. Start today.'), 'success');
          }}
        />
      </Modal>
    </div>
  );
}

function HabitForm({ onDone, initial }: { onDone: (v: Omit<Habit, 'id'>) => void; initial?: Habit }) {
  const [d, setD] = useState({
    name: initial?.name ?? '',
    emoji: initial?.emoji ?? '🌱',
    target: initial?.target ?? 20,
    unit: initial?.unit ?? 'دقیقه',
    days: initial?.days ?? ('daily' as Habit['days']),
    color: initial?.color ?? '#24b47e',
  });
  return (
    <div className="col" style={{ gap: 12 }}>
      <Field label="نام عادت">
        <input className="input" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="مثلاً ۲۰ دقیقه مطالعه" />
      </Field>
      <Field label="ایموجی">
        <div className="row tight" style={{ flexWrap: 'wrap' }}>
          {EMOJIS.map((e) => (
            <button key={e} className={`skill ${d.emoji === e ? 'on' : ''}`} style={{ padding: '4px 8px', fontSize: 18 }} onClick={() => setD({ ...d, emoji: e })}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid cols-2">
        <Field label="هدف روزانه">
          <input className="input" type="number" min={1} value={d.target} onChange={(e) => setD({ ...d, target: Math.max(1, +e.target.value) })} />
        </Field>
        <Field label="واحد">
          <select className="select" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })}>
            {['دقیقه', 'بار', 'صفحه', 'کیلومتر', 'تعداد', 'ریال'].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="روزها">
        <div className="row tight">
          {[
            { v: 'daily', l: 'هر روز' },
            { v: 'weekdays', l: 'روزهای کار' },
            { v: 'weekend', l: 'آخر هفته' },
          ].map((o) => (
            <button key={o.v} className={`btn sm ${d.days === o.v ? 'primary' : ''}`} onClick={() => setD({ ...d, days: o.v as Habit['days'] })}>
              {o.l}
            </button>
          ))}
          <span className="tiny">|</span>
          {WEEKDAYS_FA_SHORT.map((w, i) => {
            const arr = Array.isArray(d.days) ? d.days : [];
            const on = arr.includes(i);
            return (
              <button
                key={w}
                className={`btn sm ${on ? 'primary' : ''}`}
                style={{ width: 32, justifyContent: 'center', padding: 0 }}
                onClick={() => setD({ ...d, days: on ? arr.filter((x) => x !== i) : [...arr, i] })}
                title={w}
              >
                {w}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="row tight">
        {['#24b47e', '#5b8cff', '#f2a516', '#ef5b6b', '#9b5cff'].map((c) => (
          <button key={c} onClick={() => setD({ ...d, color: c })} style={{ width: 24, height: 24, borderRadius: 8, background: c, border: d.color === c ? '2px solid var(--text)' : '1px solid var(--line)', cursor: 'pointer' }} />
        ))}
        <span className="spacer" />
        <button
          className="btn primary"
          disabled={!d.name.trim()}
          onClick={() =>
            onDone({
              name: normalizeText(d.name),
              emoji: d.emoji,
              target: d.target,
              unit: d.unit,
              days: Array.isArray(d.days) && d.days.length === 7 ? 'daily' : d.days,
              color: d.color,
              log: initial?.log ?? {},
              createdAt: initial?.createdAt ?? new Date().toISOString(),
            })
          }
        >
          {initial ? 'ذخیره' : 'ساخت عادت'}
        </button>
      </div>
    </div>
  );
}

function HabitEditor({ habit }: { habit: Habit }) {
  const { patch } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="ویرایش">
        <Icon name="pencil" size={15} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={<b>ویرایش عادت</b>} width={520}>
        <HabitForm
          initial={habit}
          onDone={(v) => {
            patch('habits', habit.id, v, 'ویرایش عادت');
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
