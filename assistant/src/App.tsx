import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppProvider, useApp, type Task } from './store/store';
import { ActionsCtx, type Actions, type TimerState } from './components/actions';
import { CommandSheet } from './components/CommandSheet';
import { ChatDock } from './components/ChatDock';
import { Onboarding } from './components/Onboarding';
import { Icon, Modal, ToastHost, useToast } from './components/ui';
import { Today } from './views/Today';
import { TaskEditor, Tasks } from './views/Tasks';
import { Notes } from './views/Notes';
import { Calendar } from './views/Calendar';
import { Habits } from './views/Habits';
import { Money } from './views/Money';
import { Journal } from './views/Journal';
import { Health } from './views/Health';
import { Focus } from './views/Focus';
import { Tools } from './views/Tools';
import { Settings } from './views/Settings';
import { VIEW_LIST } from './lib/search';
import { formatJalali, formatGregorian, localizeDigits, ymd } from './lib/date';
import { chime, ensureNotifyPermission, notify } from './lib/notify';
import { briefing } from './lib/brain';
import { effectiveDone } from './store/store';

/* =====================================================================
   Shell: routing, reminders, the focus timer and global shortcuts.
   ===================================================================== */

const TIMER_PREFS = 'pa:timer-prefs';

function Shell() {
  const { state, patch, dispatch, canUndo, undo } = useApp();
  const push = useToast();
  const s = state.settings;
  const lang = s.lang;
  const [view, setView] = useState<string>(() => (location.hash.slice(1) || 'today').split('/')[0]);
  const [payload, setPayload] = useState<unknown>(undefined);
  const [palette, setPalette] = useState<{ open: boolean; prefill?: string }>({ open: false });
  const [chat, setChat] = useState<{ open: boolean; seed?: string }>({ open: false });
  const [navOpen, setNavOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* --------------------------------------------------------- theme / dir */
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'fa' ? 'rtl' : 'ltr';
    root.dataset.theme = s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.theme;
  }, [lang, s.theme]);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => {
      if (s.theme === 'auto') document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [s.theme]);

  /* ------------------------------------------------------------- routing */
  const go = useCallback((next: string, p?: unknown) => {
    const v = VIEW_LIST.some((x) => x.id === next) ? next : 'today';
    setView(v);
    setPayload(p);
    location.hash = v;
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const v = location.hash.slice(1).split('/')[0];
      if (v && VIEW_LIST.some((x) => x.id === v)) setView(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /* --------------------------------------------------------------- timer */
  const [timerSettings, setTimerSettingsRaw] = useState(() => {
    const fallback = { focus: 25, short: 5, long: 15, autoStart: true, sound: true };
    try {
      return { ...fallback, ...(JSON.parse(localStorage.getItem(TIMER_PREFS) || '{}') as typeof fallback) };
    } catch {
      return fallback;
    }
  });
  const setTimerSettings = useCallback((p: Partial<typeof timerSettings>) => {
    setTimerSettingsRaw((prev) => {
      const next = { ...prev, ...p };
      localStorage.setItem(TIMER_PREFS, JSON.stringify(next));
      return next;
    });
  }, []);

  const [timer, setTimer] = useState<TimerState>({ mode: 'idle', running: false, left: 0, total: 0, doneToday: 0 });
  const timerRef = useRef(timer);
  timerRef.current = timer;

  const startTimer = useCallback((minutes: number, label?: string, taskId?: string) => {
    setTimer((t) => ({ ...t, mode: 'focus', running: true, total: Math.round(minutes * 60), left: Math.round(minutes * 60), label, taskId }));
    if (taskId) patch('tasks', taskId, { source: 'focus:' + new Date().toISOString() }, 'تمرکز');
    push('⏱ ' + (lang === 'fa' ? `تایمر ${Math.round(minutes)} دقیقه‌ای شروع شد` : `${Math.round(minutes)}-minute timer started`), 'success');
  }, [lang, patch, push]);

  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => {
      setTimer((t) => {
        if (!t.running) return t;
        const left = t.left - 1;
        if (left > 0) return { ...t, left };
        // finished
        const finished = t.mode;
        if (timerSettings.sound) chime(finished === 'focus' ? 'timer' : 'done');
        notify(
          finished === 'focus' ? (lang === 'fa' ? 'یک دور تمرکز تمام شد 🍅' : 'Focus block finished 🍅') : lang === 'fa' ? 'استراحت تمام شد' : 'Break over',
          finished === 'focus' ? (lang === 'fa' ? '۵ دقیقه استراحت یا شروع کار بعدی؟' : 'Take 5 minutes or start the next block?') : lang === 'fa' ? 'برگرد سر کار' : 'back to it',
          'timer',
        );
        const nextMinutes = finished === 'focus' ? timerSettings.short : timerSettings.focus;
        return {
          ...t,
          mode: finished === 'focus' ? 'break' : 'focus',
          running: timerSettings.autoStart,
          total: nextMinutes * 60,
          left: nextMinutes * 60,
          doneToday: t.doneToday + (finished === 'focus' ? 1 : 0),
          label: finished === 'focus' ? (lang === 'fa' ? 'استراحت' : 'break') : lang === 'fa' ? 'کار عمیق' : 'deep work',
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer.running, timerSettings, lang]);

  /* ----------------------------------------------------------- reminders */
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  useEffect(() => {
    if ('Notification' in window) setNotifyEnabled(Notification.permission === 'granted');
  }, []);
  const enableNotifications = useCallback(() => {
    ensureNotifyPermission().then((p) => setNotifyEnabled(p === 'granted'));
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const st = stateRef.current;
      for (const t of st.collections.tasks) {
        if (!t.remindAt || t.notified || effectiveDone(t)) continue;
        const when = new Date(t.remindAt).getTime();
        if (when <= now.getTime() && now.getTime() - when < 12 * 3600_000) {
          patch('tasks', t.id, { notified: true }, 'یادآوری');
          notify('🔔 ' + t.title, t.due ? (lang === 'fa' ? 'ددلاین: ' : 'due: ') + new Date(t.due).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB') : undefined, t.id);
          chime('nudge');
        }
      }
      // evening review
      if (st.settings.dailyReview) {
        const [h, m] = st.settings.dailyReview.split(':').map(Number);
        const due = new Date(now);
        due.setHours(h, m, 0, 0);
        const key = 'pa:review:' + ymd(now);
        if (Math.abs(now.getTime() - due.getTime()) < 60_000 && localStorage.getItem(key) !== 'done') {
          localStorage.setItem(key, 'done');
          notify(lang === 'fa' ? '🌙 مرور شبانه' : '🌙 Evening review', briefing(st).split('\n').slice(1, 4).join(' · '), 'review');
        }
      }
    };
    const id = setInterval(tick, 25_000);
    const t0 = setTimeout(tick, 3_000);
    return () => {
      clearInterval(id);
      clearTimeout(t0);
    };
  }, [lang, patch, stateRef]);

  /* ---------------------------------------------------------- shortcuts */
  const ask = useCallback((q: string) => setChat({ open: true, seed: q }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '');
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette({ open: true });
      } else if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setChat((c) => ({ open: !c.open }));
      } else if (meta && e.key === 'Enter') {
        e.preventDefault();
        setPalette({ open: true, prefill: (lang === 'fa' ? '/task ' : '/task ') });
      } else if (meta && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        undo();
        push('↩︎ ' + (lang === 'fa' ? 'برگشت' : 'undo'), 'info');
      } else if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setNavOpen((v) => !v);
      } else if (e.key === '?' && !typing) {
        setHelp(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setPalette({ open: true });
      } else if (e.key === 'Escape') {
        setPalette({ open: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lang, push, undo]);

  const theme = (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';

  const actions: Actions = useMemo(
    () => ({
      view,
      payload,
      go,
      openPalette: (prefill?: string) => setPalette({ open: true, prefill }),
      chatOpen: chat.open,
      openChat: (seed?: string) => setChat({ open: true, seed }),
      ask,
      timer,
      startTimer,
      pauseTimer: () => setTimer((t) => ({ ...t, running: false })),
      resumeTimer: () => setTimer((t) => (t.left > 0 ? { ...t, running: true } : t)),
      resetTimer: () => setTimer((t) => ({ ...t, running: false, left: t.total })),
      skipTimer: () =>
        setTimer((t) => {
          const next = t.mode === 'focus' ? timerSettings.short : timerSettings.focus;
          return { ...t, mode: t.mode === 'focus' ? 'break' : 'focus', left: next * 60, total: next * 60, running: t.running };
        }),
      timerSettings,
      setTimerSettings,
      theme,
      toggleTheme: () => dispatch({ type: 'settings', patch: { theme: theme === 'dark' ? 'light' : 'dark' } }),
      notifyEnabled,
      enableNotifications,
      llmOn: s.llm.enabled && !!s.llm.apiKey,
    }),
    [view, payload, go, chat.open, ask, timer, startTimer, timerSettings, setTimerSettings, theme, dispatch, notifyEnabled, enableNotifications, s.llm.enabled, s.llm.apiKey],
  );

  const openTasksCount = state.collections.tasks.filter((t) => !effectiveDone(t)).length;
  const overdueCount = state.collections.tasks.filter((t) => !effectiveDone(t) && t.due && new Date(t.due) < new Date()).length;
  const titleOf = VIEW_LIST.find((v) => v.id === view);

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="app">
        {navOpen ? <div className="scrim-nav" onClick={() => setNavOpen(false)} /> : null}
        <aside className={`side ${navOpen ? 'open' : ''}`}>
          <div className="brand">
            <span className="brand-mark">
              <Icon name="spark" size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="brand-name truncate">{lang === 'fa' ? 'دستیار من' : 'My Assistant'}</div>
              <div className="brand-sub truncate">
                {s.name ? s.name + ' · ' : ''}
                {lang === 'fa' ? 'همه‌چیز، روی این دستگاه' : 'everything, on this device'}
              </div>
            </div>
          </div>

          <nav className="nav" aria-label="main">
            {VIEW_LIST.map((v) => (
              <button key={v.id} className={`nav-item ${view === v.id ? 'active' : ''}`} onClick={() => go(v.id)}>
                <Icon name={v.icon} size={17} />
                <span style={{ flex: 1, textAlign: 'start' }}>{lang === 'fa' ? v.label : v.labelEn}</span>
                {v.id === 'tasks' && openTasksCount ? <span className={`badge ${overdueCount ? 'urgent' : ''}`}>{localizeDigits(String(openTasksCount), lang)}</span> : null}
                {v.id === 'focus' && timer.running ? <span className="badge">{Math.ceil(timer.left / 60)}′</span> : null}
              </button>
            ))}
          </nav>

          <div className="side-foot">
            {timer.running ? (
              <div className="card flat" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="timer" size={16} />
                <span className="mono" style={{ fontSize: 13 }}>
                  {String(Math.floor(timer.left / 60)).padStart(2, '0')}:{String(timer.left % 60).padStart(2, '0')}
                </span>
                <span className="spacer" />
                <button className="icon-btn" onClick={() => setChat({ open: true })} title={lang === 'fa' ? 'بازگشت به تایمر' : 'back to timer'}>
                  <Icon name="chevronL" size={15} />
                </button>
              </div>
            ) : null}
            <div className="row tight">
              <button
                className="btn sm ghost"
                onClick={() => dispatch({ type: 'settings', patch: { theme: theme === 'dark' ? 'light' : 'dark' } })}
                title={lang === 'fa' ? 'تغییر پوسته' : 'toggle theme'}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
              </button>
              <button className="btn sm ghost" onClick={() => dispatch({ type: 'settings', patch: { lang: lang === 'fa' ? 'en' : 'fa' } })} title="فارسی / English">
                <span style={{ fontSize: 12, fontWeight: 700 }}>{lang === 'fa' ? 'EN' : 'فا'}</span>
              </button>
              <span className="spacer" />
              <button className="btn sm ghost" disabled={!canUndo} onClick={undo} title={lang === 'fa' ? 'برگشت (Ctrl+Z)' : 'undo (Ctrl+Z)'}>
                <Icon name="reset" size={15} />
              </button>
              <button className="btn sm ghost" onClick={() => setHelp(true)} title={lang === 'fa' ? 'میان‌بُرها' : 'shortcuts'}>
                ?
              </button>
            </div>
            <button className="btn primary block" onClick={() => setPalette({ open: true })}>
              <Icon name="bolt" size={15} /> {lang === 'fa' ? 'یک کار به دستیار بگو' : 'Tell the assistant to do something'}
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="top">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen((v) => !v)} aria-label="menu">
              <Icon name="menu" size={18} />
            </button>
            <div className="crumbs">
              <h1 className="truncate">{titleOf ? (lang === 'fa' ? titleOf.label : titleOf.labelEn) : ''}</h1>
              <span className="tiny nowrap" style={{ display: 'none' }} id="dual-date" />
            </div>
            <DualDate />
            <span className="spacer" />
            <button className="cmd-pill" onClick={() => setPalette({ open: true })}>
              <Icon name="search" size={15} />
              <span className="truncate">{lang === 'fa' ? 'به دستیار بگو…' : 'Tell the assistant…'}</span>
              <span className="spacer" />
              <kbd>⌘K</kbd>
            </button>
            <button className={`icon-btn ${chat.open ? 'on' : ''}`} onClick={() => setChat((c) => ({ open: !c.open }))} title={lang === 'fa' ? 'گفت‌وگو (⌘J)' : 'chat (⌘J)'}>
              <Icon name="robot" size={18} />
            </button>
            <button className={`icon-btn ${notifyEnabled ? 'on' : ''}`} onClick={enableNotifications} title={lang === 'fa' ? 'یادآوری‌ها' : 'reminders'}>
              <Icon name="bell" size={18} />
            </button>
          </header>

          <main className="view" key={view}>
            {view === 'today' ? <Today onEditTask={setEditTask} /> : null}
            {view === 'tasks' ? <Tasks payload={payload as { id?: string }} /> : null}
            {view === 'notes' ? <Notes /> : null}
            {view === 'calendar' ? <Calendar payload={payload as { day?: string }} /> : null}
            {view === 'habits' ? <Habits /> : null}
            {view === 'money' ? <Money /> : null}
            {view === 'journal' ? <Journal /> : null}
            {view === 'health' ? <Health /> : null}
            {view === 'focus' ? <Focus /> : null}
            {view === 'tools' ? <Tools /> : null}
            {view === 'settings' ? <Settings /> : null}
          </main>
        </div>
      </div>

      <button className="fab" onClick={() => setChat({ open: true })} aria-label={lang === 'fa' ? 'دستیار' : 'assistant'} style={{ display: chat.open ? 'none' : undefined }}>
        <Icon name="robot" size={24} />
      </button>

      <CommandSheet open={palette.open} prefill={palette.prefill} onClose={() => setPalette({ open: false })} />
      <ChatDock open={chat.open} seed={chat.seed} onClose={() => setChat((c) => ({ ...c, open: false }))} />
      {editTask ? <TaskEditorHost task={editTask} onClose={() => setEditTask(null)} /> : null}

      <Modal open={help} onClose={() => setHelp(false)} title={<b>{lang === 'fa' ? 'میان‌بُرها و توانایی‌ها' : 'Shortcuts & powers'}</b>} width={680}>
        <div className="grid cols-2" style={{ gap: 14 }}>
          <div className="col" style={{ gap: 5 }}>
            {[
              ['Ctrl / ⌘ K', lang === 'fa' ? 'نوار فرمان' : 'command bar'],
              ['Ctrl / ⌘ ⏎', lang === 'fa' ? 'ثبت سریع کار' : 'quick capture task'],
              ['Ctrl / ⌘ J', lang === 'fa' ? 'گفت‌وگو' : 'chat'],
              ['Ctrl / ⌘ B', lang === 'fa' ? 'نوار کناری' : 'sidebar'],
              ['Ctrl / ⌘ Z', lang === 'fa' ? 'برگشت' : 'undo'],
              ['/', lang === 'fa' ? 'جست‌وجو' : 'search'],
              ['?', lang === 'fa' ? 'همین پنجره' : 'this panel'],
            ].map(([k, l]) => (
              <div key={k} className="row between">
                <kbd>{k}</kbd> <span className="tiny">{l}</span>
              </div>
            ))}
          </div>
          <div className="col" style={{ gap: 6 }}>
            {(lang === 'fa'
              ? ['«فردا ساعت ۹ جلسه با تیم» → کار + یادآوری', '«خرج ناهار ۱۵۰ هزار» → دفتر مالی', '«یادداشت: ایدهٔ جدید» → یادداشت مارک‌داون', '«تایمر ۲۵ دقیقه» → پومودورو', '«عادت ۲۰ دقیقه مطالعه» → ردیاب عادت', '«برنامهٔ امروز من چیه؟» → پاسخ مغز آفلاین', '«۳ لیوان آب خوردم» → سلامت']
              : ['“meeting with team tomorrow 9am” → task + reminder', '“spent 150 on lunch” → ledger', '“note: new idea” → markdown note', '“timer 25 minutes” → pomodoro', '“habit: read 20 minutes” → tracker', '“what’s on today?” → offline brain', '“3 glasses of water” → health']
            ).map((x) => (
              <div key={x} className="tiny">
                · {x}
              </div>
            ))}
            <div className="tiny" style={{ marginTop: 6 }}>
              {lang === 'fa'
                ? 'هیچ داده‌ای از این مرورگر بیرون نمی‌رود مگر اینکه خودت کلید مدل وصل کنی.'
                : 'Nothing leaves this browser unless you connect a model key yourself.'}
            </div>
          </div>
        </div>
      </Modal>

      <Onboarding />
    </ActionsCtx.Provider>
  );
}

function DualDate() {
  const { state } = useApp();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const fa = state.settings.lang === 'fa';
  return (
    <span className="row tight nowrap" style={{ gap: 6 }}>
      <span className="chip">{fa ? formatJalali(now, { year: false }) : formatGregorian(now, false)}</span>
      <span className="tiny mono" style={{ letterSpacing: '0.02em' }}>
        {localizeDigits(now.toLocaleTimeString(fa ? 'en-GB' : 'en-US', { hour: '2-digit', minute: '2-digit' }), state.settings.lang)}
      </span>
    </span>
  );
}

function TaskEditorHost({ task, onClose }: { task: Task; onClose: () => void }) {
  return <TaskEditor task={task} onClose={onClose} />;
}

export function App() {
  return (
    <ToastHost>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ToastHost>
  );
}

export default App;
