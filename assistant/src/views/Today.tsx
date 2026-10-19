import { useMemo, useState } from 'react';
import { Bars, Card, Icon, Progress, Ring, useNow, useToast } from '../components/ui';
import { useApp, effectiveDone, eventsForDay, habitActive, isOverdue, streak, tasksForDay } from '../store/store';
import { addDays, formatJalali, hhmm, localizeDigits, relTime, toFaDigits, ymd } from '../lib/date';
import { briefing, planDay, quote, SUGGESTIONS_FA, SUGGESTIONS_EN } from '../lib/brain';
import { parse } from '../lib/nl';
import { applyAll } from '../lib/apply';
import { TaskRow } from '../components/TaskRow';
import { useActions } from '../components/actions';
import type { Task } from '../store/store';

/* =====================================================================
   Today — the assistant's own summary of your day, with actions.
   ===================================================================== */

export function Today({ onEditTask }: { onEditTask: (t: Task) => void }) {
  const { state, patch, add, dispatch } = useApp();
  const { go, openChat, ask, startTimer, openPalette, llmOn } = useActions();
  const push = useToast();
  const now = useNow(30_000);
  const lang = state.settings.lang;
  const [capture, setCapture] = useState('');

  const tasks = state.collections.tasks;
  const open = tasks.filter((t) => !effectiveDone(t));
  const todayTasks = tasksForDay(tasks, now).filter((t) => !effectiveDone(t));
  const overdue = open.filter((t) => isOverdue(t));
  const events = eventsForDay(state.collections.events, now);
  const nextEvent = events.find((e) => new Date(e.start) > now) ?? null;
  const habits = state.collections.habits.filter((h) => habitActive(h, now));
  const health = state.collections.health.find((h) => h.date === ymd(now));
  const txMonth = state.collections.transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const spent = txMonth.filter((t) => t.kind === 'out').reduce((a, b) => a + b.amount, 0);
  const journalToday = state.collections.journal.find((j) => j.date === ymd(now));
  const brief = useMemo(() => briefing(state), [state]);
  const plan = useMemo(() => planDay(state), [state]);
  const suggestions = lang === 'fa' ? SUGGESTIONS_FA : SUGGESTIONS_EN;

  const hours = now.getHours();
  const greet = hours < 12 ? (lang === 'fa' ? 'صبح بخیر' : 'Good morning') : hours < 18 ? (lang === 'fa' ? 'ظهر بخیر' : 'Good afternoon') : lang === 'fa' ? 'شب بخیر' : 'Good evening';

  const captureNow = (text: string) => {
    if (!text.trim()) return;
    const { intents, notes } = parse(text, { now: new Date() });
    const ctx = {
      add,
      patch,
      remove: (c: keyof typeof state.collections, id: string) => dispatch({ type: 'remove', coll: c, id }),
      state,
      go,
      startTimer,
    };
    const res = applyAll(intents, ctx);
    if (res.asks.length) {
      ask(res.asks.join('\n'));
      return;
    }
    const lines = res.lines.filter((l) => !l.startsWith('→'));
    if (lines.length) push(lines.join('\n'), 'success');
    else if (notes.length) push(notes.join('\n'), 'warn');
    setCapture('');
  };

  const focusStreak = habits.reduce((a, h) => Math.max(a, streak(h).current), 0);

  return (
    <div className="grid fade-in" style={{ gap: 'var(--pad)' }}>
      {/* ---------------------------------------------------------- hero */}
      <div className="hero">
        <div className="row between" style={{ alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              {formatJalali(now)} · {localizeDigits(now.toLocaleTimeString(lang === 'fa' ? 'en-GB' : 'en-US', { hour: '2-digit', minute: '2-digit' }), lang)}
            </div>
            <h1>
              {greet}
              {state.settings.name ? `، ${state.settings.name}` : ''} 👋
            </h1>
            <div style={{ marginTop: 6, maxWidth: 760, whiteSpace: 'pre-wrap', opacity: 0.94, fontSize: 13.6 }}>{brief}</div>
          </div>
          <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
            <button className="btn" style={{ background: 'rgb(255 255 255 / 18%)', borderColor: 'rgb(255 255 255 / 25%)', color: '#fff' }} onClick={() => openChat()}>
              <Icon name="robot" size={16} /> {lang === 'fa' ? 'با دستیار حرف بزن' : 'Talk to assistant'}
            </button>
            <button className="btn" style={{ background: 'rgb(255 255 255 / 18%)', borderColor: 'rgb(255 255 255 / 25%)', color: '#fff' }} onClick={() => startTimer(state.settings.lang === 'fa' ? 25 : 25, lang === 'fa' ? 'کار عمیق' : 'deep work')}>
              <Icon name="timer" size={16} /> {lang === 'fa' ? '۲۵ دقیقه تمرکز' : '25 min focus'}
            </button>
          </div>
        </div>

        <div className="hero-stats">
          <span className="stat-chip chip">✅ {lang === 'fa' ? 'امروز' : 'today'} {toFaDigits(todayTasks.length)}</span>
          <span className="stat-chip chip">⚠️ {lang === 'fa' ? 'عقب‌افتاده' : 'overdue'} {toFaDigits(overdue.length)}</span>
          <span className="stat-chip chip">🗓 {lang === 'fa' ? 'قرارها' : 'events'} {toFaDigits(events.length)}</span>
          <span className="stat-chip chip">🔥 {lang === 'fa' ? 'بهترین جریان' : 'best streak'} {toFaDigits(focusStreak)}</span>
          <span className="stat-chip chip">💧 {toFaDigits(health?.water ?? 0)}/{toFaDigits(state.settings.waterGoal)}</span>
        </div>

        {/* quick capture */}
        <div style={{ marginTop: 14, position: 'relative', zIndex: 1 }}>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ background: 'rgb(255 255 255 / 16%)', borderColor: 'rgb(255 255 255 / 24%)', color: '#fff' }}
              placeholder={lang === 'fa' ? 'هر کاری داری بنویس… مثلاً: فردا ساعت ۹ جلسه با تیم، خرج ناهار ۱۵۰ هزار، یادم باشه کتاب بخرم' : 'Type anything… e.g. tomorrow 9am team meeting, spent 150k on lunch, remind me to buy books'}
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') captureNow(capture);
              }}
            />
            <button className="btn" style={{ background: '#fff', color: '#123', borderColor: 'transparent' }} onClick={() => captureNow(capture)}>
              <Icon name="bolt" size={15} /> {lang === 'fa' ? 'ثبت' : 'Go'}
            </button>
            <button className="btn" style={{ background: 'rgb(255 255 255 / 16%)', borderColor: 'rgb(255 255 255 / 24%)', color: '#fff' }} onClick={() => openPalette(capture)}>
              <Icon name="search" size={15} />
            </button>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ opacity: 0.75, fontSize: 12 }}>{lang === 'fa' ? 'بپرس:' : 'Ask:'}</span>
            {suggestions.slice(0, 4).map((s) => (
              <button key={s} className="chip" style={{ background: 'rgb(255 255 255 / 14%)', borderColor: 'rgb(255 255 255 / 22%)', color: '#fff', cursor: 'pointer' }} onClick={() => openChat(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="split">
        <div className="col" style={{ minWidth: 0 }}>
          {/* ------------------------------------------------ today's tasks */}
          <Card
            pad0
            title={
              <>
                <Icon name="tasks" size={17} /> {lang === 'fa' ? 'کارهای امروز' : "Today's tasks"} <span className="badge">{localizeDigits(String(todayTasks.length + overdue.length), lang)}</span>
              </>
            }
            action={
              <div className="row tight">
                <button className="btn sm ghost" onClick={() => go('tasks')}>
                  {lang === 'fa' ? 'همه' : 'all'} <Icon name="chevronL" size={13} />
                </button>
                <button className="btn sm" onClick={() => openPalette('/task ')}>
                  <Icon name="plus" size={14} /> {lang === 'fa' ? 'افزودن' : 'Add'}
                </button>
              </div>
            }
          >
            <div className="list">
              {overdue.filter((t) => !todayTasks.includes(t)).map((t) => (
                <TaskRow key={t.id} task={t} onEdit={onEditTask} />
              ))}
              {todayTasks.map((t) => (
                <TaskRow key={t.id} task={t} onEdit={onEditTask} />
              ))}
              {!todayTasks.length && !overdue.length ? (
                <div className="empty">
                  <div className="big">🌤</div>
                  <b>{lang === 'fa' ? 'امروز چیزی برای انجام نداری' : 'Nothing due today'}</b>
                  <div className="tiny">{lang === 'fa' ? 'یک کار جدید اضافه کن یا یک ساعت عمیق برای خودت بگذار.' : 'Add a task or book one deep hour for yourself.'}</div>
                </div>
              ) : null}
            </div>
          </Card>

          {/* -------------------------------------------------------- agenda */}
          <Card
            title={
              <>
                <Icon name="calendar" size={17} /> {lang === 'fa' ? 'برنامهٔ امروز' : 'Today’s agenda'}
              </>
            }
            action={
              <button className="btn sm ghost" onClick={() => go('calendar')}>
                {lang === 'fa' ? 'تقویم' : 'calendar'}
              </button>
            }
          >
            {events.length ? (
              <div>
                {events.map((e) => {
                  const s = new Date(e.start);
                  const past = s < now;
                  return (
                    <div key={e.id} className="agenda-item" style={{ opacity: past ? 0.55 : 1 }}>
                      <div className="tm">
                        {hhmm(s)}
                        {e.end ? <div className="tiny">→ {hhmm(new Date(e.end))}</div> : null}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="title" style={{ textDecoration: past ? 'line-through' : undefined }}>
                          {e.title}
                        </div>
                        <div className="meta">
                          {e.location ? <span className="chip">📍 {e.location}</span> : null}
                          {!past ? <span className="chip {''}">{relTime(e.start, now, lang)}</span> : null}
                        </div>
                      </div>
                      <button className="icon-btn" title={lang === 'fa' ? 'شروع تمرکز' : 'start focus'} onClick={() => startTimer(25, e.title)}>
                        <Icon name="play" size={15} />
                      </button>
                    </div>
                  );
                })}
                {nextEvent ? <div className="tiny">⏳ {lang === 'fa' ? 'قرار بعدی' : 'next up'}: {relTime(nextEvent.start, now, lang)}</div> : null}
              </div>
            ) : (
              <div className="tiny">{lang === 'fa' ? 'تقویم امروز خالی است. یک «جلسه فردا ساعت ۱۰» بگو تا اضافه کنم.' : 'No events today. Say “meeting tomorrow 10am” and I’ll add it.'}</div>
            )}
          </Card>

          {/* --------------------------------------------------------- plan */}
          {plan.length ? (
            <Card
              title={
                <>
                  <Icon name="bolt" size={17} /> {lang === 'fa' ? 'پیشنهاد دستیار برای امروز' : 'Assistant’s plan for today'}
                </>
              }
              action={
                <button
                  className="btn sm"
                  onClick={() => {
                    let cursor = new Date();
                    const [wh, wm] = state.settings.wakeTime.split(':').map(Number);
                    cursor.setHours(wh || 8, wm || 0, 0, 0);
                    if (cursor < now) cursor = new Date(now.getTime() + 5 * 60000);
                    plan.forEach((p, idx) => {
                      const [h1, m1] = p.from.split(':').map(Number);
                      const [h2, m2] = p.to.split(':').map(Number);
                      const start = new Date(cursor);
                      start.setHours(h1, m1, 0, 0);
                      const end = new Date(cursor);
                      end.setHours(h2, m2, 0, 0);
                      add(
                        'events',
                        {
                          title: '🎯 ' + p.task.title,
                          start: start.toISOString(),
                          end: end.toISOString(),
                          tags: ['برنامه‌ریزی'],
                          createdAt: new Date().toISOString(),
                        } as never,
                        'برنامه‌ریزی',
                      );
                      if (idx === plan.length - 1) push('🗓 ' + (lang === 'fa' ? 'بلوک‌های زمانی امروز در تقویم ثبت شد' : 'Focus blocks added to your calendar'), 'success');
                    });
                  }}
                >
                  <Icon name="plus" size={14} /> {lang === 'fa' ? 'ثبت در تقویم' : 'Add to calendar'}
                </button>
              }
            >
              <div className="col" style={{ gap: 8 }}>
                {plan.map((p, i) => (
                  <div key={p.task.id} className="row" style={{ gap: 10 }}>
                    <span className="badge">{localizeDigits(String(i + 1), lang)}</span>
                    <span className="mono tiny nowrap">{p.from}–{p.to}</span>
                    <span className="title truncate" style={{ flex: 1 }}>
                      {p.task.title}
                    </span>
                    <button className="btn sm ghost" onClick={() => startTimer(50, p.task.title, p.task.id)}>
                      <Icon name="play" size={13} /> {lang === 'fa' ? 'شروع' : 'start'}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------- right rail */}
        <div className="col">
          <Card
            title={
              <>
                <Icon name="flame" size={17} /> {lang === 'fa' ? 'عادت‌های امروز' : 'Today’s habits'}
              </>
            }
            action={
              <button className="btn sm ghost" onClick={() => go('habits')}>
                {lang === 'fa' ? 'همه' : 'all'}
              </button>
            }
          >
            {habits.length ? (
              <div className="col" style={{ gap: 10 }}>
                {habits.map((h) => {
                  const v = h.log[ymd(now)] ?? 0;
                  const done = v >= h.target;
                  return (
                    <div key={h.id} className="row" style={{ gap: 8 }}>
                      <button
                        className={`tick ${done ? 'on' : ''}`}
                        onClick={() => {
                          const log = { ...h.log };
                          if (done) delete log[ymd(now)];
                          else log[ymd(now)] = h.target;
                          patch('habits', h.id, { log }, 'عادت');
                        }}
                        aria-label={h.name}
                      >
                        <Icon name="check" size={13} />
                      </button>
                      <span style={{ flex: 1, minWidth: 0 }} className="truncate">
                        {h.emoji} {h.name}
                      </span>
                      <div className="row tight">
                        <button
                          className="icon-btn"
                          onClick={() => patch('habits', h.id, { log: { ...h.log, [ymd(now)]: Math.max(0, v - 1) } }, 'عادت')}
                        >
                          <Icon name="minus" size={13} />
                        </button>
                        <span className="mono tiny">
                          {localizeDigits(String(v), lang)}/{localizeDigits(String(h.target), lang)}
                        </span>
                        <button className="icon-btn" onClick={() => patch('habits', h.id, { log: { ...h.log, [ymd(now)]: v + 1 } }, 'عادت')}>
                          <Icon name="plus" size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="tiny">{lang === 'fa' ? 'هنوز عادتی نداری — «عادت ۲۰ دقیقه مطالعه» را امتحان کن.' : 'No habits yet — try “habit: read 20 minutes”.'}</div>
            )}
          </Card>

          <Card
            title={
              <>
                <Icon name="heart" size={17} /> {lang === 'fa' ? 'بدن و حال' : 'Body check'}
              </>
            }
            action={
              <button className="btn sm ghost" onClick={() => go('health')}>
                {lang === 'fa' ? 'جزئیات' : 'detail'}
              </button>
            }
          >
            <div className="row" style={{ gap: 14, alignItems: 'center' }}>
              <Ring progress={(health?.water ?? 0) / Math.max(1, state.settings.waterGoal)} size={96} stroke={8}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{localizeDigits(String(health?.water ?? 0), lang)}</div>
                  <div className="tiny">💧</div>
                </div>
              </Ring>
              <div className="col" style={{ flex: 1, gap: 6 }}>
                <div className="row tight">
                  <button
                    className="btn sm"
                    onClick={() => {
                      const today = ymd(now);
                      const ex = state.collections.health.find((h) => h.date === today);
                      if (ex) patch('health', ex.date, { water: (ex.water ?? 0) + 1 }, 'آب');
                      else add('health', { date: today, water: 1 } as never, 'آب');
                    }}
                  >
                    <Icon name="plus" size={13} /> {lang === 'fa' ? 'لیوان' : 'glass'}
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      const today = ymd(now);
                      const ex = state.collections.health.find((h) => h.date === today);
                      if (ex) patch('health', ex.date, { water: Math.max(0, (ex.water ?? 0) - 1) }, 'آب');
                    }}
                  >
                    <Icon name="minus" size={13} />
                  </button>
                </div>
                <Progress
                  label={lang === 'fa' ? 'خواب شب گذشته' : 'Last night'}
                  value={health?.sleep ?? 0}
                  max={8}
                />
                <div className="row between tiny">
                  <span>{lang === 'fa' ? 'قدم' : 'Steps'}</span>
                  <b className="mono">{localizeDigits((health?.steps ?? 0).toLocaleString('en-US'), lang)}</b>
                </div>
              </div>
            </div>
          </Card>

          <Card
            title={
              <>
                <Icon name="wallet" size={17} /> {lang === 'fa' ? 'بودجهٔ ماه' : 'Month budget'}
              </>
            }
            action={
              <button className="btn sm ghost" onClick={() => go('money')}>
                {lang === 'fa' ? 'دفتر' : 'ledger'}
              </button>
            }
          >
            <div className="row between">
              <div className="stat">
                <span className="k">{lang === 'fa' ? 'خرج این ماه' : 'Spent'}</span>
                <span className="v">
                  {localizeDigits(spent.toLocaleString('en-US'), lang)} <small>{state.settings.currency}</small>
                </span>
              </div>
              {state.settings.monthBudget > 0 ? (
                <div className="stat" style={{ textAlign: 'end' }}>
                  <span className="k">{lang === 'fa' ? 'باقی‌مانده' : 'Left'}</span>
                  <span className="v" style={{ color: spent > state.settings.monthBudget ? 'var(--bad)' : 'var(--ok)' }}>
                    {localizeDigits(Math.max(0, state.settings.monthBudget - spent).toLocaleString('en-US'), lang)}
                  </span>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={spent} max={state.settings.monthBudget || Math.max(1, spent)} />
            </div>
            <div style={{ marginTop: 10 }}>
              <Bars
                values={Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(now, i - 6);
                  return state.collections.transactions
                    .filter((t) => t.kind === 'out' && t.date === ymd(d))
                    .reduce((a, b) => a + b.amount, 0);
                })}
                labels={Array.from({ length: 7 }, (_, i) => localizeDigits(String(addDays(now, i - 6).getDate()), lang))}
                height={70}
              />
            </div>
          </Card>

          <Card
            title={
              <>
                <Icon name="note" size={17} /> {lang === 'fa' ? 'حال امروز' : 'How today felt'}
              </>
            }
          >
            <div className="row between" style={{ gap: 6 }}>
              {[1, 2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  className={`btn sm ${journalToday?.mood === m ? 'primary' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 20, padding: '6px 0' }}
                  onClick={() => {
                    const day = ymd(now);
                    const ex = state.collections.journal.find((j) => j.date === day);
                    if (ex) patch('journal', ex.id, { mood: m }, 'حال');
                    else add('journal', { date: day, mood: m, energy: 3, text: '', gratitude: [], createdAt: new Date().toISOString() } as never, 'حال');
                    push(['😞', '😕', '😐', '🙂', '😄'][m - 1] + ' ' + (lang === 'fa' ? 'ثبت شد' : 'noted'), 'success');
                  }}
                >
                  {['😞', '😕', '😐', '🙂', '😄'][m - 1]}
                </button>
              ))}
            </div>
            <div className="tiny" style={{ marginTop: 8 }}>{quote(lang)}</div>
          </Card>

          {!llmOn ? (
            <Card flat>
              <div className="row" style={{ gap: 10 }}>
                <Icon name="bolt" size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{lang === 'fa' ? 'دستیار آفلاین فعال است' : 'Offline assistant active'}</b>
                  <div className="tiny">
                    {lang === 'fa' ? 'برای پاسخ به سؤالات عمومی، یک مدل زبانی وصل کن (کلید شما فقط در همین مرورگر می‌ماند).' : 'Connect a language model for open questions (your key stays in this browser).'}
                  </div>
                </div>
                <button className="btn sm" onClick={() => go('settings')}>
                  {lang === 'fa' ? 'تنظیمات' : 'Settings'}
                </button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
