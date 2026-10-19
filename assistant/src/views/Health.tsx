import { useEffect, useState } from 'react';
import { Bars, Card, Field, Icon, Progress, Ring, Spark, useToast } from '../components/ui';
import type { HealthLog } from '../store/store';
import { useApp } from '../store/store';
import {addDays, formatJalaliShort, localizeDigits, startOfDay, ymd, toFaDigits } from '../lib/date';
import { useActions } from '../components/actions';

/* =====================================================================
   Health — water, sleep, steps, weight, breathing reset.
   ===================================================================== */

export function Health() {
  const { state, add, patch } = useApp();
  const push = useToast();
  const { startTimer } = useActions();
  const lang = state.settings.lang;
  const today = startOfDay(new Date());
  const day = ymd(today);
  const log: HealthLog = state.collections.health.find((h) => h.date === day) ?? { date: day, water: 0 };
  const set = (p: Partial<HealthLog>) => {
    if (state.collections.health.some((h) => h.date === day)) patch('health', day, p, 'سلامت');
    else add('health', { id: day, date: day, water: 0, ...p } as never, 'سلامت');
  };

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, -13 + i);
    return state.collections.health.find((h) => h.date === ymd(d)) ?? { date: ymd(d), water: 0 };
  });
  const weights = last14.map((h) => h.weight).filter((w): w is number => typeof w === 'number');
  const [height, setHeight] = useState<number>(() => Number(localStorage.getItem('pa:height') || 175));
  useEffect(() => localStorage.setItem('pa:height', String(height)), [height]);
  const bmi = log.weight ? log.weight / Math.pow(height / 100, 2) : weights.length ? weights[weights.length - 1] / Math.pow(height / 100, 2) : 0;
  const bmiLabel = (v: number) => (v < 18.5 ? [lang === 'fa' ? 'کمبود وزن' : 'under', 'var(--info)'] : v < 25 ? [lang === 'fa' ? 'سالم' : 'healthy', 'var(--ok)'] : v < 30 ? [lang === 'fa' ? 'اضافه‌وزن' : 'over', 'var(--warn)'] : [lang === 'fa' ? 'نیاز به توجه' : 'attention', 'var(--bad)']);

  /* hydration nudge while the app is open */
  const [nudge, setNudge] = useState(() => localStorage.getItem('pa:waterNudge') === '1');
  useEffect(() => {
    localStorage.setItem('pa:waterNudge', nudge ? '1' : '0');
    if (!nudge) return;
    const t = setInterval(() => {
      const water = state.collections.health.find((h) => h.date === ymd(new Date()))?.water ?? 0;
      if (water >= state.settings.waterGoal) return;
      push('💧 یک لیوان آب یادت نره', 'warn');
    }, 2 * 3600_000);
    return () => clearInterval(t);
  }, [nudge, push, state.collections.health, state.settings.waterGoal]);

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <div className="grid cols-4">
        <Card title={<><Icon name="water" size={16} /> {lang === 'fa' ? 'آب' : 'Water'}</>}>
          <div className="col" style={{ alignItems: 'center', gap: 10 }}>
            <Ring progress={(log.water ?? 0) / Math.max(1, state.settings.waterGoal)} size={128} stroke={10}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{localizeDigits(String(log.water ?? 0), lang)}</div>
                <div className="tiny">/ {localizeDigits(String(state.settings.waterGoal), lang)}</div>
              </div>
            </Ring>
            <div className="row tight">
              <button className={`chip ${nudge ? 'ok' : ''}`} style={{cursor:'pointer'}} onClick={() => setNudge(!nudge)} title={lang === 'fa' ? 'یادآوری هر ۲ ساعت' : 'nudge every 2h'}>
                🔔 {lang === 'fa' ? 'یادآوری' : 'nudge'}
              </button>
            </div>
            <div className="row tight">
              {[1, 2].map((n) => (
                <button key={n} className="btn sm" onClick={() => { set({ water: (log.water ?? 0) + n }); push(`💧 +${lang === 'fa' ? toFaDigits(n) : n}`, 'success'); }}>
                  +{lang === 'fa' ? toFaDigits(n) : n}
                </button>
              ))}
              <button className="icon-btn" onClick={() => set({ water: Math.max(0, (log.water ?? 0) - 1) })}>
                <Icon name="minus" size={15} />
              </button>
            </div>
            <div className="row tight" style={{ justifyContent: 'center' }}>
              {Array.from({ length: state.settings.waterGoal }, (_, i) => (
                <i key={i} style={{ width: 8, height: 16, borderRadius: 3, background: i < (log.water ?? 0) ? 'var(--info)' : 'var(--line)' }} />
              ))}
            </div>
          </div>
        </Card>

        <Card title={<><Icon name="moon" size={16} /> {lang === 'fa' ? 'خواب' : 'Sleep'}</>}>
          <div className="stat">
            <span className="v">{localizeDigits(String(log.sleep ?? 0), lang)}<small> h</small></span>
            <span className="k">{lang === 'fa' ? 'هدف ۷ تا ۹ ساعت' : 'target 7–9 h'}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Progress value={log.sleep ?? 0} max={9} />
          </div>
          <div className="row tight" style={{ marginTop: 10 }}>
            <input
              className="input mono"
              style={{ width: 78 }}
              defaultValue={log.sleep ?? ''}
              placeholder="7.5"
              onBlur={(e) => set({ sleep: Number(e.target.value.replace(/[^\d.]/g, '')) || undefined })}
            />
            <span className="tiny">{lang === 'fa' ? 'ساعت' : 'hours'}</span>
          </div>
          <div className="tiny" style={{ marginTop: 8 }}>
            {lang === 'fa' ? 'زمان خواب' : 'bedtime'}: <b>{localizeDigits(state.settings.sleepTime, lang)}</b> · {lang === 'fa' ? 'بیدار' : 'wake'}: <b>{localizeDigits(state.settings.wakeTime, lang)}</b>
          </div>
        </Card>

        <Card title={<><Icon name="target" size={16} /> {lang === 'fa' ? 'قدم' : 'Steps'}</>}>
          <div className="stat">
            <span className="v">{localizeDigits((log.steps ?? 0).toLocaleString('en-US'), lang)}</span>
            <span className="k">{lang === 'fa' ? 'هدف ۸٬۰۰۰' : 'target 8,000'}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Progress value={log.steps ?? 0} max={8000} />
          </div>
          <div className="row tight" style={{ marginTop: 10 }}>
            <input className="input mono" style={{ width: 96 }} defaultValue={log.steps ?? ''} placeholder="8000" onBlur={(e) => set({ steps: Number(e.target.value.replace(/[^\d]/g, '')) || undefined })} />
            <button className="btn sm" onClick={() => set({ steps: (log.steps ?? 0) + 1000 })}>
              +۱۰۰۰
            </button>
          </div>
        </Card>

        <Card title={<><Icon name="heart" size={16} /> {lang === 'fa' ? 'وزن و BMI' : 'Weight & BMI'}</>}>
          <div className="row between">
            <div className="stat">
              <span className="v">{localizeDigits(String(log.weight ?? weights.at(-1) ?? '—'), lang)}<small> kg</small></span>
              <span className="k">{lang === 'fa' ? 'آخرین ثبت' : 'latest'}</span>
            </div>
            {bmi ? (
              <div className="stat" style={{ textAlign: 'end' }}>
                <span className="v" style={{ color: bmiLabel(bmi)[1] as string }}>
                  {localizeDigits(bmi.toFixed(1), lang)}
                </span>
                <span className="k">{bmiLabel(bmi)[0]}</span>
              </div>
            ) : null}
          </div>
          {weights.length > 1 ? <Spark values={weights} height={44} color="var(--brand)" /> : <div className="tiny">{lang === 'fa' ? 'چند روز وزن را ثبت کن تا نمودار ببینی.' : 'Log weight a few days for a trend.'}</div>}
          <div className="row tight" style={{ marginTop: 8 }}>
            <input className="input mono" style={{ width: 74 }} defaultValue={log.weight ?? ''} placeholder="74.2" onBlur={(e) => set({ weight: Number(e.target.value.replace(/[^\d.]/g, '')) || undefined })} />
            <Field label="">
              <input className="input mono" style={{ width: 66 }} value={height} onChange={(e) => setHeight(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} title={lang === 'fa' ? 'قد (سانتی‌متر)' : 'height (cm)'} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="split">
        <Card title={<><Icon name="chart" size={16} /> {lang === 'fa' ? '۱۴ روز اخیر' : 'Last 14 days'}</>}>
          <div className="tiny" style={{ marginBottom: 4 }}>{lang === 'fa' ? 'لیوان آب' : 'glasses of water'}</div>
          <Bars values={last14.map((h) => h.water ?? 0)} labels={last14.map((h) => localizeDigits(String(new Date(h.date).getDate()), lang))} height={82} />
          <div className="tiny" style={{ margin: '14px 0 4px' }}>{lang === 'fa' ? 'ساعت خواب' : 'hours of sleep'}</div>
          <Bars values={last14.map((h) => h.sleep ?? 0)} labels={last14.map((h) => formatJalaliShort(h.date).slice(-2))} height={82} />
          <div className="row between tiny" style={{ marginTop: 8 }}>
            <span>
              {lang === 'fa' ? 'میانگین آب' : 'avg water'}: <b>{(last14.reduce((a, b) => a + (b.water ?? 0), 0) / 14).toFixed(1)}</b>
            </span>
            <span>
              {lang === 'fa' ? 'میانگین خواب' : 'avg sleep'}: <b>{((last14.reduce((a, b) => a + (b.sleep ?? 0), 0) / Math.max(1, last14.filter((h) => h.sleep).length)) || 0).toFixed(1)} h</b>
            </span>
          </div>
        </Card>

        <BreathCard onReset={() => startTimer(5, lang === 'fa' ? 'استراحت کوتاه' : 'short reset')} />
      </div>
    </div>
  );
}

function BreathCard({ onReset }: { onReset: () => void }) {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [phase, setPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale'>('idle');
  const [count, setCount] = useState(0);
  const [rounds, setRounds] = useState(0);

  useEffect(() => {
    if (phase === 'idle') return;
    const dur = phase === 'inhale' ? 4000 : phase === 'hold' ? 7000 : 8000;
    const t = setTimeout(() => {
      setPhase((p) => (p === 'inhale' ? 'hold' : p === 'hold' ? 'exhale' : 'idle'));
      setCount((c) => c + 1);
      if (phase === 'exhale') setRounds((r) => r + 1);
    }, dur);
    return () => clearTimeout(t);
  }, [phase, count]);

  const label = phase === 'inhale' ? (lang === 'fa' ? 'دم' : 'inhale') : phase === 'hold' ? (lang === 'fa' ? 'نگه دار' : 'hold') : phase === 'exhale' ? (lang === 'fa' ? 'بازدم' : 'exhale') : '4-7-8';

  return (
    <Card title={<><Icon name="spark" size={16} /> {lang === 'fa' ? 'نفس کشیدن ۴-۷-۸' : '4-7-8 breathing'}</>}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <div className={`breath ${phase}`} onClick={() => setPhase(phase === 'idle' ? 'inhale' : 'idle')}>
          <div className="center">
            <div style={{ fontWeight: 800, fontSize: 18 }}>{label}</div>
            <div className="tiny">{phase === 'idle' ? (lang === 'fa' ? 'برای شروع لمس کن' : 'tap to start') : rounds + ' ' + (lang === 'fa' ? 'دور' : 'rounds')}</div>
          </div>
        </div>
        <div className="row tight">
          <button className="btn sm" onClick={() => setPhase(phase === 'idle' ? 'inhale' : 'idle')}>
            {phase === 'idle' ? (lang === 'fa' ? 'شروع' : 'start') : lang === 'fa' ? 'توقف' : 'stop'}
          </button>
          <button className="btn sm ghost" onClick={onReset}>
            {lang === 'fa' ? '۵ دقیقه استراحت' : '5 min break'}
          </button>
        </div>
        <div className="tiny center">
          {lang === 'fa' ? 'سه دور نفس، بعد ادامه بده. برای روزهای پرتنش.' : 'Three rounds before you continue. Good for tense days.'}
        </div>
      </div>
    </Card>
  );
}
