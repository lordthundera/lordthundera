import { useEffect, useMemo, useState } from 'react';
import { Card, Chip, Icon, useToast } from '../components/ui';
import { effectiveDone, useApp } from '../store/store';
import { hhmm, localizeDigits, normalizeText, startOfDay, toFaDigits, ymd } from '../lib/date';
import { useActions } from '../components/actions';

/* =====================================================================
   Focus — pomodoro wired to your tasks, plus a distraction pad.
   ===================================================================== */

interface Session {
  ts: string;
  minutes: number;
  label?: string;
}

export function Focus() {
  const { state, add, patch } = useApp();
  const { timer, startTimer, pauseTimer, resumeTimer, resetTimer, skipTimer, timerSettings, setTimerSettings } = useActions();
  const push = useToast();
  const lang = state.settings.lang;
  const [log, setLog] = useState<Session[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pa:sessions') || '[]') as Session[];
    } catch {
      return [];
    }
  });
  const [note, setNote] = useState('');
  const [pick, setPick] = useState('');

  useEffect(() => {
    localStorage.setItem('pa:sessions', JSON.stringify(log.slice(-200)));
  }, [log]);

  // log completed focus minutes when the timer finishes
  const [prevLeft, setPrevLeft] = useState(timer.left);
  useEffect(() => {
    if (timer.total > 0 && timer.left === 0 && prevLeft > 0 && timer.mode === 'focus') {
      setLog((l) => [...l, { ts: new Date().toISOString(), minutes: Math.round(timer.total / 60), label: timer.label }]);
    }
    setPrevLeft(timer.left);
  }, [timer.left, timer.mode, timer.total, timer.label, prevLeft]);

  const todaySessions = useMemo(() => log.filter((s) => ymd(new Date(s.ts)) === ymd(new Date())), [log]);
  const todayMinutes = todaySessions.reduce((a, b) => a + b.minutes, 0);
  const openTasks = state.collections.tasks.filter((t) => !effectiveDone(t));
  const running = timer.running;
  const progress = timer.total > 0 ? 1 - timer.left / timer.total : 0;

  const mm = Math.floor(timer.left / 60);
  const ss = timer.left % 60;
  const timeStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  useEffect(() => {
    document.title = running ? `${timeStr} · ${timer.label ?? (lang === 'fa' ? 'تمرکز' : 'Focus')} — دستیار من` : (lang === 'fa' ? 'دستیار من' : 'My Assistant');
    return () => {
      document.title = lang === 'fa' ? 'دستیار من' : 'My Assistant';
    };
  }, [running, timeStr, timer.label, lang]);

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <div className="split">
        <Card className="col" style={{ alignItems: 'center', gap: 16 }}>
          <div className="seg">
            {[
              { v: 'focus', l: lang === 'fa' ? 'تمرکز' : 'Focus', m: timerSettings.focus },
              { v: 'short', l: lang === 'fa' ? 'استراحت کوتاه' : 'Short break', m: timerSettings.short },
              { v: 'long', l: lang === 'fa' ? 'استراحت بلند' : 'Long break', m: timerSettings.long },
            ].map((o) => (
              <button
                key={o.v}
                className={timer.mode === o.v || (timer.mode === 'focus' && o.v === 'focus') ? 'on' : ''}
                onClick={() => startTimer(o.m, o.v === 'focus' ? (lang === 'fa' ? 'کار عمیق' : 'deep work') : lang === 'fa' ? 'استراحت' : 'break')}
              >
                {o.l} · {toFaDigits(o.m)}
              </button>
            ))}
          </div>

          <div className="ring" style={{ width: 300, height: 300 }}>
            <svg width={300} height={300} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={150} cy={150} r={136} fill="none" stroke="var(--line)" strokeWidth={16} />
              <circle
                cx={150}
                cy={150}
                r={136}
                fill="none"
                stroke={timer.mode === 'focus' ? 'url(#fg1)' : 'url(#fg2)'}
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 136 * progress} ${2 * Math.PI * 136}`}
                style={{ transition: 'stroke-dasharray .5s linear' }}
              />
              <defs>
                <linearGradient id="fg1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" />
                  <stop offset="100%" stopColor="var(--brand-2)" />
                </linearGradient>
                <linearGradient id="fg2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#24b47e" />
                  <stop offset="100%" stopColor="#12b8c8" />
                </linearGradient>
              </defs>
            </svg>
            <div className="ring-label">
              <div className="time">{localizeDigits(timeStr, lang)}</div>
              <div className="tiny" style={{ maxWidth: 200 }}>{timer.label ?? (lang === 'fa' ? 'آماده' : 'ready')}</div>
              <div className="row tight" style={{ justifyContent: 'center', marginTop: 8 }}>
                <Chip className={todayMinutes ? 'ok' : ''}>🍅 {localizeDigits(String(todaySessions.length), lang)} · {localizeDigits(String(todayMinutes), lang)} {lang === 'fa' ? 'دقیقه' : 'min'}</Chip>
              </div>
            </div>
          </div>

          <div className="row">
            {!running ? (
              <button className="btn primary lg" onClick={timer.total ? resumeTimer : () => startTimer(timerSettings.focus, lang === 'fa' ? 'کار عمیق' : 'deep work')}>
                <Icon name="play" size={17} /> {timer.total ? (lang === 'fa' ? 'ادامه' : 'Resume') : lang === 'fa' ? 'شروع' : 'Start'}
              </button>
            ) : (
              <button className="btn lg" onClick={pauseTimer}>
                <Icon name="pause" size={17} /> {lang === 'fa' ? 'توقف' : 'Pause'}
              </button>
            )}
            <button className="btn lg" onClick={skipTimer} title={lang === 'fa' ? 'رد کردن' : 'skip'}>
              ⏭
            </button>
            <button className="btn lg ghost" onClick={resetTimer}>
              <Icon name="reset" size={16} /> {lang === 'fa' ? 'صفر' : 'Reset'}
            </button>
          </div>

          <div className="row tight" style={{ justifyContent: 'center' }}>
            {[15, 25, 45, 50, 90].map((m) => (
              <button key={m} className={`btn sm ${timer.total === m * 60 ? 'primary' : ''}`} onClick={() => startTimer(m, timer.label ?? (lang === 'fa' ? 'کار عمیق' : 'deep work'))}>
                {toFaDigits(m)}′
              </button>
            ))}
          </div>
        </Card>

        <div className="col">
          <Card title={<><Icon name="gear" size={16} /> {lang === 'fa' ? 'تنظیم تایمر' : 'Timer settings'}</>}>
            <div className="col" style={{ gap: 10 }}>
              {(
                [
                  { k: 'focus', l: lang === 'fa' ? 'طول تمرکز' : 'Focus length' },
                  { k: 'short', l: lang === 'fa' ? 'استراحت کوتاه' : 'Short break' },
                  { k: 'long', l: lang === 'fa' ? 'استراحت بلند' : 'Long break' },
                ] as const
              ).map((f) => (
                <div key={f.k} className="row between">
                  <span className="tiny">{f.l}</span>
                  <span className="pill-input">
                    <input
                      className="input mono"
                      style={{ width: 54, border: 0, background: 'transparent', padding: 2, textAlign: 'center' }}
                      value={timerSettings[f.k]}
                      onChange={(e) => setTimerSettings({ [f.k]: Math.max(1, Math.min(180, Number(e.target.value) || 1)) } as never)}
                    />
                    <span className="tiny">{lang === 'fa' ? 'دقیقه' : 'min'}</span>
                  </span>
                </div>
              ))}
              <label className="check">
                <input type="checkbox" checked={timerSettings.autoStart} onChange={(e) => setTimerSettings({ autoStart: e.target.checked })} /> {lang === 'fa' ? 'شروع خودکار استراحت بعدی' : 'Auto-start the next break'}
              </label>
              <label className="check">
                <input type="checkbox" checked={timerSettings.sound} onChange={(e) => setTimerSettings({ sound: e.target.checked })} /> {lang === 'fa' ? 'پایان با صدا' : 'Chime when finished'}
              </label>
            </div>
          </Card>

          <Card title={<><Icon name="tasks" size={16} /> {lang === 'fa' ? 'روی چه کاری؟' : 'What are you working on?'}</>}>
            <div className="col" style={{ gap: 6 }}>
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{lang === 'fa' ? 'بدون انتخاب' : 'Nothing selected'}</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              {pick ? (
                <div className="row tight">
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      const t = openTasks.find((x) => x.id === pick);
                      if (!t) return;
                      startTimer(timerSettings.focus, t.title, t.id);
                      push('🎯 ' + (lang === 'fa' ? 'تایمر روی این کار تنظیم شد' : 'Timer bound to this task'), 'success');
                    }}
                  >
                    <Icon name="play" size={13} /> {lang === 'fa' ? 'شروع با این کار' : 'Start with this'}
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => {
                      patch('tasks', pick, { done: true, completedAt: new Date().toISOString() }, 'انجام کار');
                      push('🎉 ' + (lang === 'fa' ? 'عالی! انجام شد' : 'Done!'), 'success');
                      setPick('');
                    }}
                  >
                    <Icon name="check" size={13} /> {lang === 'fa' ? 'تمام شد' : 'Mark done'}
                  </button>
                </div>
              ) : (
                <div className="tiny">{lang === 'fa' ? 'یک کار انتخاب کن تا تایمر به آن گره بخورد.' : 'Pick a task to bind the timer to.'}</div>
              )}
            </div>
          </Card>

          <Card title={<><Icon name="bolt" size={16} /> {lang === 'fa' ? 'دفترچهٔ حواس‌پرتی' : 'Distraction pad'}</>}>
            <div className="col" style={{ gap: 6 }}>
              <textarea
                className="textarea"
                style={{ minHeight: 74 }}
                placeholder={lang === 'fa' ? 'هر فکری که وسط کار آمد اینجا بنویس و برگرد سر کار…' : 'Dump every intrusive thought here and get back to work…'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="row tight">
                <button
                  className="btn sm"
                  disabled={!note.trim()}
                  onClick={() => {
                    const day = startOfDay(new Date());
                    const title = `${lang === 'fa' ? 'حواس‌پرتی‌های' : 'Distractions —'} ${ymd(day)}`;
                    add('notes', { title, body: normalizeText(note), tags: ['تمرکز'], pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never, 'دفترچه');
                    setNote('');
                    push('📝 ذخیره شد؛ حالا برگرد سر کارت', 'success');
                  }}
                >
                  🗒 {lang === 'fa' ? 'ثبت در یادداشت‌ها' : 'Save as note'}
                </button>
                <button className="btn sm ghost" onClick={() => setNote('')} disabled={!note}>
                  🗑
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title={<><Icon name="chart" size={16} /> {lang === 'fa' ? 'نشست‌های امروز' : 'Today’s sessions'}</>} action={<span className="tiny">{todayMinutes} {lang === 'fa' ? 'دقیقه متمرکز' : 'focused minutes'}</span>}>
        {!todaySessions.length ? (
          <div className="tiny">{lang === 'fa' ? 'هنوز نشستی ثبت نشده. یک تایمر ۲۵ دقیقه‌ای شروع کن.' : 'No sessions yet — start a 25 minute one.'}</div>
        ) : (
          <div className="row tight">
            {todaySessions.map((s, i) => (
              <span key={i} className="chip" title={s.label}>
                🍅 {hhmm(new Date(s.ts))} · {toFaDigits(s.minutes)}′
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
