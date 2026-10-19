import { useEffect, useMemo, useState } from 'react';
import { Card, Chip, Confirm, Empty, Field, Icon, Modal, useToast } from '../components/ui';
import type { CalendarEvent, ID } from '../store/store';
import { effectiveDone, eventsForDay, tasksForDay, useApp } from '../store/store';
import { addDays, dateFromJalali, formatJalali, formatJalaliShort, hhmm, jalaliMonthGrid, jdOf, localizeDigits, monthMatrix, relTime, setTime, startOfDay, ymd } from '../lib/date';
import { WEEKDAYS_FA_SHORT, WEEKDAYS_EN } from '../lib/jalali';
import { TaskRow } from '../components/TaskRow';
import { useActions } from '../components/actions';

/* =====================================================================
   Calendar — Jalali/Gregorian month grid, day agenda, event editing,
   habit dots, birthdays, and "plan this day" from the assistant.
   ===================================================================== */

export function Calendar({ payload }: { payload?: { day?: string } }) {
  const { state, add, patch, remove } = useApp();
  const push = useToast();
  const { openPalette, go } = useActions();
  const lang = state.settings.lang;
  const [sys, setSys] = useState(state.settings.calendar);
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(() => (payload?.day ? startOfDay(new Date(payload.day)) : new Date()));
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);

  useEffect(() => {
    if (payload?.day) {
      const d = startOfDay(new Date(payload.day));
      setAnchor(d);
      setSelected(d);
    }
  }, [payload]);

  const j = jdOf(anchor);
  const weeks = useMemo(() => {
    if (sys === 'jalali') {
      const grid = jalaliMonthGrid(j.jy, j.jm);
      return grid.map((row) => row.map((cell) => (cell ? dateFromJalali(cell.jy, cell.jm, cell.jd) : null)));
    }
    return monthMatrix(anchor);
  }, [anchor, j.jm, j.jy, sys]);

  const move = (dir: number) => {
    const d = sys === 'jalali' ? dateFromJalali(j.jy, j.jm + dir, 1) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    setAnchor(d);
  };

  const monthLabel =
    sys === 'jalali'
      ? (lang === 'fa' ? `${['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][j.jm]} ${j.jy}` : `${j.jm}/${j.jy}`)
      : anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dayTasks = tasksForDay(state.collections.tasks, selected).filter((t) => !effectiveDone(t));
  const dayEvents = eventsForDay(state.collections.events, selected);
  const anchors = state.collections.anchors.filter((a) => {
    const ad = new Date(a.date);
    return a.yearly ? ad.getMonth() === selected.getMonth() && ad.getDate() === selected.getDate() : a.date === ymd(selected);
  });

  const cellInfo = (d: Date) => {
    const events = eventsForDay(state.collections.events, d);
    const tasks = tasksForDay(state.collections.tasks, d).filter((t) => !effectiveDone(t));
    const doneTasks = tasksForDay(state.collections.tasks, d).filter((t) => effectiveDone(t));
    const habitsDone = state.collections.habits.filter((h) => (h.log[ymd(d)] ?? 0) >= h.target).length;
    const birthday = state.collections.anchors.filter((a) => (a.yearly ? new Date(a.date).getMonth() === d.getMonth() && new Date(a.date).getDate() === d.getDate() : a.date === ymd(d)));
    return { events, tasks, doneTasks, habitsDone, birthday };
  };

  const title = `${formatJalali(selected, { year: false })}`;

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <Card>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="row tight">
            <button className="icon-btn" onClick={() => move(-1)} aria-label="ماه قبل">
              <Icon name={lang === 'fa' ? 'chevronR' : 'chevronL'} size={18} />
            </button>
            <b style={{ fontSize: 17, minWidth: 150, textAlign: 'center' }}>{monthLabel}</b>
            <button className="icon-btn" onClick={() => move(1)} aria-label="ماه بعد">
              <Icon name={lang === 'fa' ? 'chevronL' : 'chevronR'} size={18} />
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setAnchor(new Date());
                setSelected(new Date());
              }}
            >
              {lang === 'fa' ? 'امروز' : 'Today'}
            </button>
          </div>
          <div className="row tight">
            <div className="seg">
              <button className={sys === 'jalali' ? 'on' : ''} onClick={() => setSys('jalali')}>
                جلالی
              </button>
              <button className={sys === 'gregorian' ? 'on' : ''} onClick={() => setSys('gregorian')}>
                Gregorian
              </button>
            </div>
            <button className="btn sm primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> {lang === 'fa' ? 'رویداد' : 'Event'}
            </button>
          </div>
        </div>

        <div className="cal-grid" style={{ marginTop: 12 }}>
          {(lang === 'fa' ? WEEKDAYS_FA_SHORT : WEEKDAYS_EN).map((w, i) => (
            <div key={i} className="cal-dow">
              {w}
            </div>
          ))}
          {weeks.flat().map((d, i) => {
            if (!d) return <div key={'e' + i} />;
            const info = cellInfo(d);
            const inMonth = sys === 'jalali' ? jdOf(d).jm === j.jm : d.getMonth() === anchor.getMonth();
            const isToday = ymd(d) === ymd(new Date());
            const isSel = ymd(d) === ymd(selected);
            const jday = jdOf(d);
            return (
              <div
                key={ymd(d)}
                className={`cal-cell ${inMonth ? '' : 'other'} ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''}`}
                onClick={() => setSelected(d)}
                onDoubleClick={() => {
                  setEditing('new');
                  setSelected(d);
                }}
                title={lang === 'fa' ? 'کلیک: انتخاب · دابل‌کلیک: رویداد جدید' : 'Click: select · Double-click: new event'}
              >
                <div className="row between">
                  <span className="dnum">{localizeDigits(String(sys === 'jalali' ? jday.jd : d.getDate()), lang)}</span>
                  {info.birthday.length ? <span title={info.birthday.map((b) => b.title).join('، ')}>🎂</span> : null}
                </div>
                {sys === 'jalali' ? <span className="jd">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span> : <span className="jd">{formatJalaliShort(d)}</span>}
                {(info.events.length || info.tasks.length || info.habitsDone) > 0 ? (
                  <div className="dots">
                    {info.events.slice(0, 4).map((e) => (
                      <i key={e.id} className="evt" />
                    ))}
                    {info.tasks.slice(0, 4).map((t) => (
                      <i key={t.id} />
                    ))}
                    {info.habitsDone ? <i className="habit" /> : null}
                  </div>
                ) : null}
                {info.events.length ? <div className="mini truncate">{info.events[0].title}</div> : null}
                {!info.events.length && info.tasks.length ? <div className="mini truncate">✓ {info.tasks[0].title}</div> : null}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="split">
        <Card
          pad0
          title={
            <>
              <Icon name="calendar" size={17} /> {title}
              <span className="badge soft">{localizeDigits(String(dayEvents.length + dayTasks.length), lang)}</span>
            </>
          }
          action={
            <div className="row tight">
              <button className="btn sm" onClick={() => openPalette(`/event ${lang === 'fa' ? 'جلسه ' : 'meeting '}${formatJalaliShort(selected)} ساعت 10`)}>
                <Icon name="bolt" size={13} /> {lang === 'fa' ? 'ثبت سریع' : 'Quick add'}
              </button>
              <button
                className="btn sm"
                onClick={() => {
                  const open = dayTasks.slice(0, 3);
                  if (!open.length) return push(lang === 'fa' ? 'کاری برای این روز نداری' : 'No tasks for that day', 'warn');
                  let cur = setTime(selected, +(state.settings.wakeTime.split(':')[0] || 9), 0);
                  open.forEach((t) => {
                    const start = new Date(cur);
                    const end = new Date(cur.getTime() + 60 * 60000);
                    add(
                      'events',
                      { title: '🎯 ' + t.title, start: start.toISOString(), end: end.toISOString(), tags: ['برنامه‌ریزی'], createdAt: new Date().toISOString() } as never,
                      'برنامه‌ریزی روز',
                    );
                    cur = new Date(end.getTime() + 15 * 60000);
                  });
                  push('🗓 ' + (lang === 'fa' ? 'سه بلوک زمانی برای این روز ساخته شد' : 'Three focus blocks created for this day'), 'success');
                }}
              >
                🧠 {lang === 'fa' ? 'برنامه‌ریزی این روز' : 'Plan this day'}
              </button>
            </div>
          }
        >
          {dayEvents.length === 0 && dayTasks.length === 0 && anchors.length === 0 ? (
            <Empty
              icon="🌿"
              title={lang === 'fa' ? 'این روز خالی است' : 'This day is clear'}
              hint={lang === 'fa' ? 'دابل‌کلیک روی تاریخ، رویداد می‌سازد.' : 'Double-click a date to add an event.'}
            />
          ) : (
            <div style={{ padding: '4px 14px 14px' }}>
              {anchors.map((a) => (
                <div key={a.id} className="agenda-item" style={{ background: 'color-mix(in oklab, var(--warn) 10%, transparent)', borderRadius: 10 }}>
                  <div className="tm">🎂</div>
                  <div>
                    <b>{a.title}</b>
                    {a.note ? <div className="tiny">{a.note}</div> : null}
                  </div>
                </div>
              ))}
              {dayEvents.map((e) => (
                <div key={e.id} className="agenda-item">
                  <div className="tm">
                    {hhmm(new Date(e.start))}
                    {e.end ? <div className="tiny">→ {hhmm(new Date(e.end))}</div> : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <b>{e.title}</b>
                    <div className="meta">
                      {e.location ? <span className="chip">📍 {e.location}</span> : null}
                      {new Date(e.start) > new Date() ? <span className="chip">{relTime(e.start, new Date(), lang)}</span> : null}
                      {e.notes ? <span className="chip">{e.notes.slice(0, 40)}</span> : null}
                    </div>
                  </div>
                  <div className="row tight">
                    <button className="icon-btn" title={lang === 'fa' ? 'ویرایش' : 'Edit'} onClick={() => setEditing(e)}>
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title={lang === 'fa' ? '۱ ساعت عقب' : 'Push 1h'}
                      onClick={() => {
                        patch('events', e.id, { start: new Date(new Date(e.start).getTime() + 3600_000).toISOString(), ...(e.end ? { end: new Date(new Date(e.end).getTime() + 3600_000).toISOString() } : {}) }, 'تغییر زمان');
                      }}
                    >
                      ⏭
                    </button>
                    <button
                      className="icon-btn danger"
                      title={lang === 'fa' ? 'حذف' : 'Delete'}
                      onClick={() => {
                        remove('events', e.id, 'حذف رویداد');
                        push('🗑 رویداد حذف شد', 'warn');
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {dayTasks.length ? <div className="res-group" style={{ paddingInline: 0 }}>{lang === 'fa' ? 'کارهای این روز' : 'Tasks for this day'}</div> : null}
              <div className="list">
                {dayTasks.map((t) => (
                  <TaskRow key={t.id} task={t} showProject />
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="col">
          <Card title={lang === 'fa' ? 'هفتهٔ پیش رو' : 'Next 7 days'} flat>
            <div className="col" style={{ gap: 8 }}>
              {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map((d) => {
                const info = cellInfo(d);
                if (!info.events.length && !info.tasks.length) return null;
                return (
                  <button key={ymd(d)} className="nav-item" style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => { setSelected(d); setAnchor(d); }}>
                    <span className="tiny nowrap" style={{ width: 62 }}>
                      {formatJalali(d, { weekday: true, year: false })}
                    </span>
                    <span className="truncate" style={{ flex: 1, textAlign: 'start', fontSize: 12.5 }}>
                      {[...info.events.map((e) => '🗓 ' + e.title), ...info.tasks.slice(0, 2).map((t) => '✓ ' + t.title)].join(' · ')}
                    </span>
                    <span className="badge soft">{localizeDigits(String(info.events.length + info.tasks.length), lang)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title={lang === 'fa' ? 'مناسبت‌ها' : 'Anniversaries'} action={<AddAnchor />}>
            {state.collections.anchors.length === 0 ? (
              <div className="tiny">{lang === 'fa' ? 'تولد و سالگرد‌ها را اضافه کن تا زمان‌بندی کنم.' : 'Add birthdays to get countdowns & reminders.'}</div>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {state.collections.anchors
                  .map((a) => {
                    const base = new Date(a.date);
                    const thisYear = new Date();
                    let next = new Date(thisYear.getFullYear(), base.getMonth(), base.getDate());
                    if (next < startOfDay(new Date())) next = new Date(thisYear.getFullYear() + 1, base.getMonth(), base.getDate());
                    const days = Math.round((next.getTime() - startOfDay(new Date()).getTime()) / 86400000);
                    return { a, next, days };
                  })
                  .sort((x, y) => x.days - y.days)
                  .map(({ a, next, days }) => (
                    <div key={a.id} className="row between">
                      <div style={{ minWidth: 0 }}>
                        <b>{a.yearly ? '🎂' : '📌'} {a.title}</b>
                        <div className="tiny">
                          {formatJalali(next)} {a.note ? '· ' + a.note : ''}
                        </div>
                      </div>
                      <Chip className={days <= 7 ? 'warn' : ''}>{localizeDigits(String(days), lang)} {lang === 'fa' ? 'روز' : 'd'}</Chip>
                      <button className="icon-btn danger" onClick={() => remove('anchors', a.id, 'حذف مناسبت')}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <Card title={lang === 'fa' ? 'راهنما' : 'Legend'} flat>
            <div className="col" style={{ gap: 6 }}>
              <span className="row tight"><i style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--info)' }} /> <span className="tiny">{lang === 'fa' ? 'رویداد' : 'Event'}</span></span>
              <span className="row tight"><i style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--brand)' }} /> <span className="tiny">{lang === 'fa' ? 'کار' : 'Task'}</span></span>
              <span className="row tight"><i style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--ok)' }} /> <span className="tiny">{lang === 'fa' ? 'عادت انجام‌شده' : 'Habits done'}</span></span>
              <button className="btn sm ghost" onClick={() => go('tasks')}>
                {lang === 'fa' ? 'به صفحهٔ کارها' : 'Open tasks'}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {editing ? <EventEditor day={selected} event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function AddAnchor() {
  const { add } = useApp();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(ymd(new Date()));
  const [yearly, setYearly] = useState(true);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={<b>مناسبت جدید</b>}
        footer={
          <>
            <span className="spacer" />
            <button
              className="btn primary"
              onClick={() => {
                if (!title.trim()) return;
                add('anchors', { title: normalize(title), date, yearly } as never, 'مناسبت');
                setOpen(false);
                setTitle('');
              }}
            >
              ثبت
            </button>
          </>
        }
      >
        <div className="col">
          <Field label="عنوان">
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="تولد علی" />
          </Field>
          <Field label="تاریخ">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} /> هر سال تکرار شود
          </label>
        </div>
      </Modal>
    </>
  );
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

function EventEditor({ day, event, onClose }: { day: Date; event: CalendarEvent | null; onClose: () => void }) {
  const { add, patch, remove } = useApp();
  const push = useToast();
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [draft, setDraft] = useState({
    title: event?.title ?? '',
    start: event?.start ? toLocal(new Date(event.start)) : toLocal(setTime(day, 10, 0)),
    end: event?.end ? toLocal(new Date(event.end)) : toLocal(setTime(day, 11, 0)),
    location: event?.location ?? '',
    notes: event?.notes ?? '',
    tags: event?.tags ?? (['تقویم'] as string[]),
  });
  const set = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={<b>{event ? 'ویرایش رویداد' : 'رویداد جدید'}</b>}
      footer={
        <>
          {event ? (
            <Confirm
              text="حذف شود؟"
              onYes={() => {
                remove('events', event.id, 'حذف رویداد');
                onClose();
              }}
            >
              <span className="row tight" style={{ color: 'var(--bad)' }}>
                <Icon name="trash" size={15} /> حذف
              </span>
            </Confirm>
          ) : null}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            انصراف
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (!draft.title.trim()) return push('عنوان را بنویس', 'warn');
              const payload = {
                title: normalize(draft.title),
                start: new Date(draft.start).toISOString(),
                end: new Date(draft.end).toISOString(),
                location: draft.location ? normalize(draft.location) : undefined,
                notes: draft.notes || undefined,
                tags: draft.tags,
                createdAt: event?.createdAt ?? new Date().toISOString(),
              } as CalendarEvent & { id?: ID };
              if (event) patch('events', event.id, payload as unknown as Record<string, unknown>, 'ویرایش رویداد');
              else add('events', payload, 'ثبت رویداد');
              push('🗓 ذخیره شد', 'success');
              onClose();
            }}
          >
            ذخیره
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <Field label="عنوان">
          <input className="input" autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="جلسه با تیم محصول" />
        </Field>
        <div className="grid cols-2">
          <Field label="شروع">
            <input className="input" type="datetime-local" value={draft.start} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field label="پایان">
            <input className="input" type="datetime-local" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
          </Field>
          <Field label="محل">
            <input className="input" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="آنلاین / دفتر" />
          </Field>
          <Field label="برچسب‌ها (با کاما)">
            <input className="input" value={draft.tags.join('، ')} onChange={(e) => set({ tags: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean) })} />
          </Field>
        </div>
        <Field label="یادداشت">
          <textarea className="textarea" style={{ minHeight: 70 }} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
