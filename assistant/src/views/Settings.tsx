import { useMemo, useRef, useState } from 'react';
import { Card, Confirm, Field, Icon, Segmented, useToast } from '../components/ui';
import { defaultSettings, exportBlob, parseImport, useApp } from '../store/store';
import { ensureNotifyPermission, notify } from '../lib/notify';
import { testConnection } from '../lib/llm';
import { useActions } from '../components/actions';
import { VIEW_LIST } from '../lib/search';

/* =====================================================================
   Settings — identity, calendar, reminders, model connection, data.
   ===================================================================== */

export function Settings() {
  const { state, dispatch, add, undo, canUndo } = useApp();
  const push = useToast();
  const { theme, toggleTheme, notifyEnabled, enableNotifications } = useActions();
  const s = state.settings;
  const lang = s.lang;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [showKey, setShowKey] = useState(false);

  const storage = useMemo(() => {
    const bytes = new Blob([JSON.stringify(state)]).size;
    return bytes > 1024 * 1024 ? (bytes / 1048576).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }, [state]);

  const counts = state.collections;
  const total = Object.values(counts).reduce((a, b) => a + b.length, 0);

  const set = (patch: Partial<typeof s>) => dispatch({ type: 'settings', patch });

  return (
    <div className="grid cols-2 fade-in" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 14 }}>
        <Card title={<><Icon name="spark" size={17} /> {lang === 'fa' ? 'تو کیستی؟' : 'About you'}</>}>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'نام' : 'Name'}</b>
              <span className="tiny">{lang === 'fa' ? 'برای سلام‌کردن و سلامتی‌ها' : 'Used in greetings'}</span>
            </div>
            <input className="input" style={{ maxWidth: 240 }} value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={lang === 'fa' ? 'سارا' : 'Sara'} />
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'زبان' : 'Language'}</b>
              <span className="tiny">{lang === 'fa' ? 'زبان رابط برنامه' : 'Interface language'}</span>
            </div>
            <Segmented
              value={lang}
              onChange={(v) => set({ lang: v })}
              options={[
                { value: 'fa', label: 'فارسی' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'پوسته' : 'Theme'}</b>
              <span className="tiny">{lang === 'fa' ? 'روشن، تیره یا خودکار' : 'light, dark or auto'}</span>
            </div>
            <Segmented
              value={s.theme}
              onChange={(v) => set({ theme: v })}
              options={[
                { value: 'light', label: '☀️' },
                { value: 'dark', label: '🌙' },
                { value: 'auto', label: lang === 'fa' ? 'خودکار' : 'Auto' },
              ]}
            />
            <button className="btn sm ghost" onClick={toggleTheme}>
              {lang === 'fa' ? `الان: ${theme === 'dark' ? 'تیره' : 'روشن'}` : `now: ${theme}`}
            </button>
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'تقویم' : 'Calendar'}</b>
            </div>
            <Segmented
              value={s.calendar}
              onChange={(v) => set({ calendar: v })}
              options={[
                { value: 'jalali', label: lang === 'fa' ? 'جلالی' : 'Jalali' },
                { value: 'gregorian', label: 'میلادی' },
              ]}
            />
          </div>
        </Card>

        <Card title={<><Icon name="clock" size={17} /> {lang === 'fa' ? 'ریتم روز' : 'Daily rhythm'}</>}>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'بیدار شدن' : 'Wake'}</b>
              <span className="tiny">{lang === 'fa' ? 'شروع بلوک‌های تمرکز' : 'Start of planned blocks'}</span>
            </div>
            <input className="input mono" style={{ maxWidth: 110 }} type="time" value={s.wakeTime} onChange={(e) => set({ wakeTime: e.target.value })} />
            <span className="tiny">→</span>
            <input className="input mono" style={{ maxWidth: 110 }} type="time" value={s.sleepTime} onChange={(e) => set({ sleepTime: e.target.value })} />
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'مرور شبانه' : 'Evening review'}</b>
              <span className="tiny">{lang === 'fa' ? 'خلاصهٔ روز + کارهای باقی‌مانده' : 'Recap + leftovers'}</span>
            </div>
            <input className="input mono" style={{ maxWidth: 110 }} type="time" value={s.dailyReview} onChange={(e) => set({ dailyReview: e.target.value })} />
            <button
              className="btn sm"
              onClick={async () => {
                const p = await ensureNotifyPermission();
                if (p === 'granted') {
                  enableNotifications();
                  push('🔔 اعلان‌ها روشن است', 'success');
                } else push(lang === 'fa' ? 'مرورگر اجازهٔ اعلان نداد — به‌جای آن پیام داخل برنامه می‌آید' : 'Browser blocked notifications — in-app toasts will be used', 'warn');
              }}
            >
              <Icon name="bell" size={14} /> {notifyEnabled ? (lang === 'fa' ? 'اعلان‌ها فعال' : 'notifications on') : lang === 'fa' ? 'اجازهٔ اعلان' : 'allow notifications'}
            </button>
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'هدف آب' : 'Water goal'}</b>
            </div>
            <input className="input mono" style={{ maxWidth: 90 }} type="number" min={1} max={20} value={s.waterGoal} onChange={(e) => set({ waterGoal: Math.max(1, +e.target.value) })} />
            <span className="tiny">{lang === 'fa' ? 'لیوان در روز' : 'cups/day'}</span>
          </div>
          <div className="set-row">
            <div className="lbl">
              <b>{lang === 'fa' ? 'واحد پول و بودجه' : 'Currency & budget'}</b>
            </div>
            <input className="input" style={{ maxWidth: 120 }} value={s.currency} onChange={(e) => set({ currency: e.target.value })} />
            <input className="input mono" style={{ maxWidth: 160 }} type="number" min={0} value={s.monthBudget} onChange={(e) => set({ monthBudget: Math.max(0, +e.target.value) })} />
            <span className="tiny">{lang === 'fa' ? 'در ماه' : 'per month'}</span>
          </div>
        </Card>

        <Card title={<><Icon name="robot" size={17} /> {lang === 'fa' ? 'مغز برنامه' : 'Assistant brain'}</>}>
          <div className="col" style={{ gap: 10 }}>
            <div className="card flat" style={{ padding: 12 }}>
              <b style={{ fontSize: 13.5 }}>🅰 {lang === 'fa' ? 'مغز آفلاین (همیشه فعال)' : 'Offline brain (always on)'}</b>
              <div className="tiny" style={{ marginTop: 3 }}>
                {lang === 'fa'
                  ? 'برنامهٔ امروز، مرور کارها، تحلیل خرج، استریک عادت‌ها، چیدمان روز و دستورات متنی را بدون اینترنت انجام می‌دهد.'
                  : 'Agenda, workload, spend analysis, streaks, day planning and text commands — all with no internet.'}
              </div>
            </div>
            <div className="card flat" style={{ padding: 12 }}>
              <div className="row between">
                <b style={{ fontSize: 13.5 }}>🅱 {lang === 'fa' ? 'مدل زبانی دلخواه (اختیاری)' : 'Your model (optional)'}</b>
                <label className="check">
                  <input type="checkbox" checked={s.llm.enabled} onChange={(e) => dispatch({ type: 'llm', patch: { enabled: e.target.checked } })} /> {lang === 'fa' ? 'فعال' : 'enabled'}
                </label>
              </div>
              <div className="tiny" style={{ margin: '4px 0 8px' }}>
                {lang === 'fa'
                  ? 'با هر سرویس سازگار با OpenAI کار می‌کند (OpenAI، OpenRouter، Ollama، LM Studio، Groq…). کلید فقط در همین مرورگر ذخیره و فقط به همان نشانی تو ارسال می‌شود.'
                  : 'Works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, LM Studio, Groq…). The key is stored in this browser only and sent only to the URL you type.'}
              </div>
              <div className="grid cols-2" style={{ gap: 8 }}>
                <Field label="endpoint">
                  <input className="input mono" value={s.llm.endpoint} onChange={(e) => dispatch({ type: 'llm', patch: { endpoint: e.target.value } })} placeholder="https://api.openai.com/v1/chat/completions" />
                </Field>
                <Field label="model">
                  <input className="input mono" value={s.llm.model} onChange={(e) => dispatch({ type: 'llm', patch: { model: e.target.value } })} placeholder="gpt-4o-mini" />
                </Field>
                <Field label="API key">
                  <div className="row tight">
                    <input
                      className="input mono"
                      style={{ flex: 1 }}
                      type={showKey ? 'text' : 'password'}
                      value={s.llm.apiKey}
                      onChange={(e) => dispatch({ type: 'llm', patch: { apiKey: e.target.value.trim() } })}
                      placeholder="sk-…"
                    />
                    <button className="icon-btn" onClick={() => setShowKey((v) => !v)} title="show/hide">
                      <Icon name="eye" size={15} />
                    </button>
                  </div>
                </Field>
                <Field label={lang === 'fa' ? 'خلاقیت (temperature)' : 'temperature'}>
                  <input type="range" min={0} max={1.4} step={0.1} value={s.llm.temperature} onChange={(e) => dispatch({ type: 'llm', patch: { temperature: +e.target.value } })} />
                </Field>
              </div>
              <Field label={lang === 'fa' ? 'دستور همیشگی برای مدل (System prompt)' : 'Custom system prompt'}>
                <textarea
                  className="textarea"
                  style={{ minHeight: 60 }}
                  value={s.llm.systemPrompt}
                  placeholder={lang === 'fa' ? 'مثلاً: همیشه کوتاه و خودمانی جواب بده، به من «مهندس» نگویید.' : 'e.g. always answer in short bullet points.'}
                  onChange={(e) => dispatch({ type: 'llm', patch: { systemPrompt: e.target.value } })}
                />
              </Field>
              <div className="row tight">
                <button
                  className="btn sm"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    setTestMsg('');
                    try {
                      const r = await testConnection(s.llm);
                      setTestMsg('✓ ' + r.slice(0, 120));
                      push('✓ اتصال برقرار شد', 'success');
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      setTestMsg('⚠ ' + msg);
                      push(lang === 'fa' ? 'اتصال نشد — پیام را ببین' : 'Connection failed', 'error');
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  {testing ? '…' : '🔌'} {lang === 'fa' ? 'آزمایش اتصال' : 'test connection'}
                </button>
                <span className="tiny mono" style={{ color: testMsg.startsWith('✓') ? 'var(--ok)' : 'var(--bad)' }}>
                  {testMsg}
                </span>
              </div>
              {/^https?:/i.test(s.llm.endpoint) && !s.llm.endpoint.startsWith('https://') ? (
                <div className="chip bad">⚠ {lang === 'fa' ? 'نشانی امن نیست (http) — کلیدت با پروتکل محافظت‌نشده می‌رود.' : 'Not an https endpoint — your key would travel unencrypted.'}</div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <div className="col" style={{ gap: 14 }}>
        <Card title={<><Icon name="download" size={17} /> {lang === 'fa' ? 'داده‌های تو' : 'Your data'}</>}>
          <div className="col" style={{ gap: 8 }}>
            <div className="row between tiny">
              <span>{lang === 'fa' ? 'اندازه در این مرورگر' : 'Stored in this browser'}</span>
              <b className="mono">{storage}</b>
            </div>
            <div className="row between tiny">
              <span>{lang === 'fa' ? 'تعداد رکورد' : 'records'}</span>
              <b className="mono">{total}</b>
            </div>
            <div className="row tight">
              <button
                className="btn sm"
                onClick={() => {
                  const blob = new Blob([exportBlob(state)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  push('💾 فایل پشتیبان دانلود شد', 'success');
                }}
              >
                <Icon name="download" size={14} /> {lang === 'fa' ? 'خروجی JSON' : 'Export JSON'}
              </button>
              <button className="btn sm" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} /> {lang === 'fa' ? 'بازگردانی' : 'Import'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const text = await f.text();
                    dispatch({ type: 'state', state: parseImport(text) });
                    push('✅ بازگردانی شد', 'success');
                  } catch (err) {
                    push('⚠ ' + (err instanceof Error ? err.message : 'نامعتبر'), 'error');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
              <button className="btn sm ghost" disabled={!canUndo} onClick={() => { undo(); push('↩︎ بازگشت به عقب', 'info'); }}>
                ↩︎ {lang === 'fa' ? 'برگشت' : 'Undo'}
              </button>
            </div>
            <div className="row tight" style={{ borderTop: '1px dashed var(--line)', paddingTop: 8, marginTop: 4 }}>
              <button
                className="btn sm"
                onClick={() => {
                  dispatch({ type: 'seedDemo' });
                  push('🎁 دادهٔ نمونه اضافه شد', 'success');
                }}
              >
                🎁 {lang === 'fa' ? 'دادهٔ نمونه' : 'Demo data'}
              </button>
              <Confirm
                text={lang === 'fa' ? 'همه پاک شود؟' : 'Erase everything?'}
                onYes={() => {
                  dispatch({ type: 'clearData' });
                  push('🧹 پاک شد (با Undo یا برگشت بالا)' + '', 'warn');
                }}
              >
                <span className="row tight" style={{ color: 'var(--bad)' }}>
                  <Icon name="trash" size={14} /> {lang === 'fa' ? 'پاک‌کردن همه' : 'Erase all'}
                </span>
              </Confirm>
              <button
                className="btn sm ghost"
                onClick={() => {
                  dispatch({ type: 'settings', patch: { ...defaultSettings, name: s.name } });
                  push('⚙️ تنظیمات به حالت اول برگشت', 'info');
                }}
              >
                {lang === 'fa' ? 'بازنشانی تنظیمات' : 'Reset settings'}
              </button>
            </div>
            <div className="tiny">
              {lang === 'fa'
                ? 'همه‌چیز همین‌جا می‌ماند: بدون سرور، بدون اکانت، بدون ردیابی. برای انتقال به دستگاه دیگر، خروجی JSON را بگیری و در دستگاه تازه «بازگردانی» کنی کافی است.'
                : 'Everything stays here: no server, no account, no tracking. To move devices, export JSON and import it on the new one.'}
            </div>
          </div>
        </Card>

        <Card title={<><Icon name="bolt" size={17} /> {lang === 'fa' ? 'میان‌بُرها و میان‌بُرنمایه' : 'Shortcuts'}</>} flat>
          <div className="col" style={{ gap: 5 }}>
            {[
              ['Ctrl / ⌘ + K', lang === 'fa' ? 'نوار فرمان (همه‌کاره)' : 'command bar (do anything)'],
              ['Ctrl / ⌘ + Enter', lang === 'fa' ? 'ثبت سریع از هر جا' : 'quick capture'],
              ['Ctrl / ⌘ + Z', lang === 'fa' ? 'برگشت آخرین تغییر' : 'undo last change'],
              ['Ctrl / ⌘ + J', lang === 'fa' ? 'گفت‌وگو با دستیار' : 'open chat'],
              ['Ctrl / ⌘ + B', lang === 'fa' ? 'پر/کم کردن نوار کنار' : 'toggle sidebar'],
              ['?', lang === 'fa' ? 'فهرست میان‌بُرها' : 'shortcut list'],
            ].map(([k, l]) => (
              <div key={k} className="row between tiny">
                <kbd>{k}</kbd>
                <span className="muted">{l}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={<><Icon name="tools" size={17} /> {lang === 'fa' ? 'میان‌بُرهای بخش‌ها' : 'Jump to'}</>} flat>
          <div className="row tight" style={{ flexWrap: 'wrap' }}>
            {VIEW_LIST.map((v) => (
              <button key={v.id} className="chip clickable" onClick={() => (window.location.hash = v.id)}>
                <Icon name={v.icon} size={13} /> {lang === 'fa' ? v.label : v.labelEn}
              </button>
            ))}
          </div>
          <div className="tiny" style={{ marginTop: 8 }}>
            {lang === 'fa'
              ? 'برای امتحانکردن فرمان‌های متنی، Ctrl/⌘+K را بزن و بنویس: «فردا ساعت ۱۰ جلسه با تیم #کار» یا «خرج شام ۴۵۰ هزار».'
              : 'Try the command bar (Ctrl/⌘+K): “meeting with the team tomorrow 10am #work” or “spent 450 on dinner”.'}
          </div>
          <div className="row tight" style={{ marginTop: 8 }}>
            <button
              className="btn sm ghost"
              onClick={() => {
                notify('دستیار من', lang === 'fa' ? 'اگر این را دیدی، اعلان‌ها کار می‌کنند 🎉' : 'If you see this, notifications work 🎉', 'test');
                push('🔔 آزمون ارسال شد', 'success');
              }}
            >
              <Icon name="bell" size={14} /> {lang === 'fa' ? 'آزمون اعلان' : 'test notification'}
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                add('snippets', { label: lang === 'fa' ? 'الگوی نشست' : 'meeting notes', text: '## تصمیمات\n- \n\n## پیگیری‌ها\n- [ ] ', createdAt: new Date().toISOString() } as never, 'الگو');
                push('📋 قالب «یادداشت نشست» ساخته شد', 'success');
              }}
            >
              📋 {lang === 'fa' ? 'افزودن قالب یادداشت نشست' : 'add meeting template'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
