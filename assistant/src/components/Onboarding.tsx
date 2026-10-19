import { useState } from 'react';
import { Icon, Segmented } from './ui';
import { useApp } from '../store/store';
import { ensureNotifyPermission } from '../lib/notify';

/* =====================================================================
   First-run setup: name, language, rhythm, and an optional model key.
   Skippable in one click, and never shown again once done.
   ===================================================================== */

const SKILLS = [
  { fa: 'کار و یادآوری می‌سازم', en: 'Tasks & reminders', eg: '«فردا ساعت ۹ جلسه با تیم #کار»', icon: 'tasks' },
  { fa: 'خرج و درآمد را ثبت می‌کنم', en: 'Money ledger', eg: '«خرج ناهار ۱۵۰ هزار تومان»', icon: 'wallet' },
  { fa: 'یادداشت مارک‌داونی می‌نویسم', en: 'Markdown notes', eg: '«یادداشت: ایدهٔ پادکست»', icon: 'note' },
  { fa: 'عادت و استریک می‌سازم', en: 'Habits & streaks', eg: '«عادت ۲۰ دقیقه مطالعه»', icon: 'flame' },
  { fa: 'آب، خواب و قدم پیاده می‌کنم', en: 'Water, sleep, steps', eg: '«۳ لیوان آب خوردم»', icon: 'heart' },
  { fa: 'روزت را برنامه‌ریزی می‌کنم', en: 'Plans your day', eg: '«برنامهٔ امروز»', icon: 'calendar' },
  { fa: 'تایمر تمرکز و نفس', en: 'Focus timer & breathing', eg: '«تایمر ۲۵ دقیقه»', icon: 'timer' },
  { fa: 'از داده‌های خودت گزارش می‌دهم', en: 'Reports on your data', eg: '«چند کار مونده؟»', icon: 'chart' },
];

export function Onboarding() {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<'fa' | 'en'>(state.settings.lang);
  const [name, setName] = useState(state.settings.name);
  const [theme, setTheme] = useState(state.settings.theme);
  const [cal, setCal] = useState(state.settings.calendar);
  const [wake, setWake] = useState(state.settings.wakeTime);
  const [budget, setBudget] = useState(state.settings.monthBudget);
  const [demo, setDemo] = useState(true);
  const [wantModel, setWantModel] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1/chat/completions');
  if (state.onboarded) return null;
  const t = (fa: string, en: string) => (lang === 'fa' ? fa : en);

  const finish = () => {
    dispatch({
      type: 'settings',
      patch: { name: name.trim(), lang, theme, calendar: cal, wakeTime: wake, monthBudget: budget },
    });
    if (wantModel && key.trim()) {
      dispatch({ type: 'llm', patch: { enabled: true, apiKey: key.trim(), model, endpoint } });
    }
    if (demo) dispatch({ type: 'seedDemo' });
    ensureNotifyPermission().catch(() => undefined);
    dispatch({ type: 'markOnboarded' });
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" style={{ width: 46, height: 46, borderRadius: 14 }}>
            <Icon name="spark" size={24} />
          </span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22 }}>{t('دستیار شخصی تو', 'Your personal assistant')}</h1>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
              {t('روی همین مرورگر کار می‌کند؛ بدون سرور، بدون اکانت. بگو چه کاری داری، انجام می‌دهم.', 'Runs in this browser — no server, no account. Tell me what you need; I’ll do it.')}
            </div>
          </div>
          <Segmented
            size="sm"
            value={lang}
            onChange={(v) => setLang(v)}
            options={[
              { value: 'fa', label: 'فارسی' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>

        <div className="row tight" style={{ margin: '14px 0' }}>
          {[0, 1, 2].map((i) => (
            <i key={i} style={{ height: 4, flex: 1, borderRadius: 9, background: i <= step ? 'var(--brand)' : 'var(--line)' }} />
          ))}
        </div>

        {step === 0 ? (
          <div className="grid cols-2" style={{ gap: 12, alignItems: 'start' }}>
            <div className="col" style={{ gap: 12 }}>
              <div className="field">
                <label>{t('صدام کنند…', 'Call me…')}</label>
                <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('سارا', 'Sara')} />
              </div>
              <div className="field">
                <label>{t('پوسته', 'Theme')}</label>
                <Segmented
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: '☀️ ' + t('روشن', 'Light') },
                    { value: 'dark', label: '🌙 ' + t('تیره', 'Dark') },
                    { value: 'auto', label: t('خودکار', 'Auto') },
                  ]}
                />
              </div>
              <div className="field">
                <label>{t('تقویم', 'Calendar')}</label>
                <Segmented
                  value={cal}
                  onChange={setCal}
                  options={[
                    { value: 'jalali', label: t('جلالی', 'Jalali') },
                    { value: 'gregorian', label: t('میلادی', 'Gregorian') },
                  ]}
                />
              </div>
            </div>
            <div className="col" style={{ gap: 12 }}>
              <div className="field">
                <label>{t('ساعت بیدار شدن', 'I usually wake at')}</label>
                <input className="input mono" type="time" value={wake} onChange={(e) => setWake(e.target.value)} style={{ maxWidth: 130 }} />
              </div>
              <div className="field">
                <label>{t('بودجهٔ ماه (اختیاری)', 'Monthly budget (optional)')}</label>
                <input className="input mono" type="number" min={0} value={budget || ''} onChange={(e) => setBudget(Math.max(0, +e.target.value))} placeholder="0" style={{ maxWidth: 180 }} />
              </div>
              <label className="check">
                <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> {t('با دادهٔ نمونه شروع کن تا همه‌چیز را پر ببینم', 'Start with demo data so nothing looks empty')}
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="col" style={{ gap: 10 }}>
            <div className="tiny">{t('این‌ها را از همان اول بلدم:', 'These work right away:')}</div>
            <div className="grid cols-2" style={{ gap: 8 }}>
              {SKILLS.map((k) => (
                <div key={k.fa} className="skill on" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name={k.icon} size={16} style={{ marginTop: 3, color: 'var(--ok)' }} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{t(k.fa, k.en)}</b>
                    <div className="tiny">{k.eg}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card flat" style={{ padding: 12 }}>
              <b style={{ fontSize: 13 }}>🔒 {t('حریم خصوصی', 'Privacy')}</b>
              <div className="tiny" style={{ marginTop: 3 }}>
                {t(
                  'همه‌چیز در localStorage همین مرورگر می‌ماند. همین‌جا می‌توانی خروجی JSON بگیری و هر وقت خواستی پاک کنی. هیچ درخواست شبکه‌ای به سرور ما نمی‌رود چون سروری وجود ندارد.',
                  'Everything stays in this browser’s localStorage. Export JSON whenever you like, wipe it whenever you like. There is no server to phone home to.',
                )}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="col" style={{ gap: 10 }}>
            <div className="card flat" style={{ padding: 12 }}>
              <b style={{ fontSize: 13 }}>{t('مغز آفلاین کافی است؟', 'Is the offline brain enough?')}</b>
              <div className="tiny" style={{ marginTop: 3 }}>
                {t(
                  'برای سؤال‌های عمومی («چطور یک قرارداد ساده بنویسم؟») اتصال به یک مدل زبانی کمک می‌کند. اگر الان وصلش کنی، کلیدت فقط در همین مرورگر ذخیره می‌شود و مستقیم به همان نشانی می‌رود.',
                  'For open questions (“how do I draft a simple contract?”) connecting a language model helps. If you connect one, the key is stored in this browser only and sent straight to that endpoint.',
                )}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={wantModel} onChange={(e) => setWantModel(e.target.checked)} /> {t('الان وصل می‌کنم', 'Connect a model now')}
            </label>
            {wantModel ? (
              <div className="grid cols-2" style={{ gap: 8 }}>
                <div className="field">
                  <label>endpoint</label>
                  <input className="input mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
                </div>
                <div className="field">
                  <label>model</label>
                  <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>API key</label>
                  <input className="input mono" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="row between" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={finish}>
            {step === 2 ? '' : t('بعداً', 'skip setup')}
          </button>
          <div className="row tight">
            {step > 0 ? (
              <button className="btn" onClick={() => setStep(step - 1)}>
                <Icon name={lang === 'fa' ? 'chevronR' : 'chevronL'} size={15} /> {t('قبلی', 'back')}
              </button>
            ) : null}
            {step < 2 ? (
              <button className="btn primary" onClick={() => setStep(step + 1)}>
                {t('ادامه', 'continue')} <Icon name={lang === 'fa' ? 'chevronL' : 'chevronR'} size={15} />
              </button>
            ) : (
              <button className="btn primary lg" onClick={finish}>
                ✨ {t('بزن بریم', 'Let’s go')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
