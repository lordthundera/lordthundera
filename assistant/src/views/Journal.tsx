import { useMemo, useState } from 'react';
import { Card, Confirm, Empty, Icon, Spark, useToast } from '../components/ui';
import type { JournalEntry } from '../store/store';
import { useApp } from '../store/store';
import { addDays, formatJalali, formatJalaliShort, localizeDigits, normalizeText, startOfDay, ymd } from '../lib/date';
import { summarize, toBullets } from '../lib/text';
import { Markdown } from '../lib/md';
import { useActions } from '../components/actions';

/* =====================================================================
   Journal — mood, energy, gratitude, free writing. 100% local.
   ===================================================================== */

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const PROMPTS_FA = [
  'سه چیز که امروز برایت خوب پیش رفت؟',
  'امروز چه چیزی انرژی‌ات را گرفت؟',
  'اگر فردا فقط یک کار را بتوانی انجام دهی، کدام است؟',
  'به خودت امشب چه می‌گویی؟',
  'یک لحظه که لبخند زدی، چه بود؟',
  'چه کاری را امروز به تعویق انداختی و چرا؟',
];
const PROMPTS_EN = [
  'Three things that went well today?',
  'What drained your energy today?',
  'If you could finish only one thing tomorrow, what?',
  'What would you tell yourself tonight?',
  'One moment that made you smile?',
  'What did you procrastinate on — and why?',
];

export function Journal() {
  const { state, add, patch, remove } = useApp();
  const push = useToast();
  const { openChat } = useActions();
  const lang = state.settings.lang;
  const today = startOfDay(new Date());
  const [day, setDay] = useState<Date>(today);
  const entries = state.collections.journal;
  const entry = entries.find((e) => e.date === ymd(day));
  const [text, setText] = useState('');
  const [grat, setGrat] = useState<string[]>(['', '', '']);
  const prompts = lang === 'fa' ? PROMPTS_FA : PROMPTS_EN;
  const prompt = useMemo(() => prompts[Math.floor(day.getTime() / 86400000) % prompts.length], [day, prompts]);

  const moodSeries = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const d = addDays(today, -29 + i);
        const e = entries.find((x) => x.date === ymd(d));
        return e?.mood ?? 0;
      }).map((v) => (v === 0 ? 1 : v)),
    [entries, today],
  );

  const ensure = (data: Partial<JournalEntry>): JournalEntry => {
    const dayKey = ymd(day);
    const existing = entries.find((e) => e.date === dayKey);
    const base: JournalEntry = existing ?? {
      id: crypto.randomUUID(),
      date: dayKey,
      mood: 3,
      energy: 3,
      text: '',
      gratitude: [],
      createdAt: new Date().toISOString(),
    };
    const merged = { ...base, ...data };
    if (existing) {
      patch('journal', existing.id, merged, 'روزنگار');
      return merged;
    }
    add('journal', merged as never, 'روزنگار');
    return merged;
  };

  const list = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <div className="split">
        <Card
          title={
            <>
              <Icon name="book" size={17} /> {formatJalali(day)}
            </>
          }
          action={
            <div className="row tight">
              <button className="icon-btn" onClick={() => setDay(addDays(day, -1))}>
                <Icon name={lang === 'fa' ? 'chevronR' : 'chevronL'} size={16} />
              </button>
              <button className="btn sm" onClick={() => setDay(today)}>
                {lang === 'fa' ? 'امروز' : 'Today'}
              </button>
              <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} disabled={day >= today}>
                <Icon name={lang === 'fa' ? 'chevronL' : 'chevronR'} size={16} />
              </button>
            </div>
          }
        >
          <div className="col" style={{ gap: 14 }}>
            <div>
              <div className="tiny" style={{ marginBottom: 6 }}>
                {lang === 'fa' ? 'حال کلی روز' : 'Overall mood'}
              </div>
              <div className="row between" style={{ gap: 6 }}>
                {MOODS.map((m, i) => (
                  <button
                    key={m}
                    className={`btn ${entry?.mood === i + 1 ? 'primary' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 22, padding: '6px 0' }}
                    onClick={() => ensure({ mood: i + 1 })}
                    title={String(i + 1)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid cols-2">
              <div>
                <div className="tiny" style={{ marginBottom: 6 }}>
                  {lang === 'fa' ? 'انرژی' : 'Energy'}
                </div>
                <div className="row tight">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={`tick ${entry && n <= (entry.energy ?? 0) ? 'on' : ''}`} onClick={() => ensure({ energy: n })} style={{ borderRadius: 99, width: 20, height: 20 }} />
                  ))}
                  <span className="tiny">{localizeDigits(String(entry?.energy ?? 0), lang)}/۵</span>
                </div>
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 6 }}>
                  {lang === 'fa' ? 'سه چیز که برایش شکرگزارم' : 'Three things I’m grateful for'}
                </div>
                <div className="col" style={{ gap: 4 }}>
                  {grat.map((_g, i) => (
                    <input
                      key={i}
                      className="input"
                      style={{ padding: '5px 9px', fontSize: 13 }}
                      placeholder={i === 0 ? (lang === 'fa' ? 'مثلاً هوای خوب' : 'e.g. the weather') : ''}
                      defaultValue={entry?.gratitude[i] ?? ''}
                      onChange={(e) => {
                        const arr = [...(entry?.gratitude ?? grat)];
                        arr[i] = e.target.value;
                        if (!entry) setGrat(arr);
                      }}
                      onBlur={(e) => {
                        const arr = [...(entry?.gratitude ?? [])];
                        arr[i] = normalizeText(e.target.value);
                        ensure({ gratitude: arr.filter(Boolean) });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="tiny">✍️ {prompt}</span>
                <div className="row tight">
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      const seed = prompts[Math.floor(Math.random() * prompts.length)];
                      setText((t) => (t ? t + '\n\n' : '') + seed + '\n');
                    }}
                  >
                    🎲 {lang === 'fa' ? 'سؤال دیگر' : 'another prompt'}
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      const src = text || entry?.text || '';
                      if (src.trim().length < 40) return push(lang === 'fa' ? 'اول کمی بنویس' : 'write a bit more first', 'warn');
                      setText(toBullets(summarize(src, 3).summary, '· '));
                    }}
                  >
                    <Icon name="spark" size={13} /> {lang === 'fa' ? 'خلاصه در ۳ بند' : 'summarise in 3'}
                  </button>
                  <button className="btn sm ghost" onClick={() => openChat((lang === 'fa' ? 'از روی متن روزنگار من بگو امروز روزم چطور بود:\n' : 'Based on my journal, how was today:\n') + (text || entry?.text || '').slice(0, 1500))}>
                    <Icon name="robot" size={13} /> {lang === 'fa' ? 'تحلیل' : 'analyse'}
                  </button>
                </div>
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 190, fontFamily: 'inherit' }}
                placeholder={lang === 'fa' ? 'هرچه در سر داری بنویس. فقط مال خودت است — در همین مرورگر ذخیره می‌شود.' : 'Write freely. It stays in this browser.'}
                value={text || entry?.text || ''}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    ensure({ text: e.target.value });
                    setText('');
                    push('📔 ذخیره شد', 'success');
                  }
                }}
              />
            </div>
          </div>
        </Card>

        <div className="col">
          <Card title={lang === 'fa' ? 'موج ۳۰ روز' : '30-day wave'}>
            <Spark values={moodSeries} height={54} color="var(--brand-2)" />
            <div className="row between tiny" style={{ marginTop: 6 }}>
              <span>{lang === 'fa' ? 'میانگین' : 'avg'}: <b>{(moodSeries.reduce((a, b) => a + b, 0) / Math.max(1, moodSeries.length)).toFixed(1)}</b></span>
              <span>
                {lang === 'fa' ? 'روزهای ثبت‌شده' : 'days logged'}: <b>{localizeDigits(String(entries.length), lang)}</b>
              </span>
            </div>
          </Card>

          <Card title={lang === 'fa' ? 'آمار' : 'Streaks'} flat>
            <div className="col" style={{ gap: 6 }}>
              {(() => {
                let cur = 0;
                for (let i = 0; i < 400; i++) {
                  const d = ymd(addDays(today, -i));
                  if (entries.some((e) => e.date === d)) cur++;
                  else if (i > 0) break;
                }
                return (
                  <>
                    <div className="row between">
                      <span className="tiny">{lang === 'fa' ? 'جریان نوشتن' : 'writing streak'}</span>
                      <b>{localizeDigits(String(cur), lang)} {lang === 'fa' ? 'روز' : 'days'}</b>
                    </div>
                    <div className="row between">
                      <span className="tiny">{lang === 'fa' ? 'کل کلمات' : 'total words'}</span>
                      <b>{localizeDigits(entries.reduce((a, b) => a + (b.text || '').split(/\s+/).filter(Boolean).length, 0).toLocaleString('en-US'), lang)}</b>
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>
        </div>
      </div>

      <Card pad0 title={<><Icon name="star" size={16} /> {lang === 'fa' ? 'گوشه‌های گذشته' : 'Past entries'}</>}>
        {!list.length ? (
          <Empty icon="📔" title={lang === 'fa' ? 'هنوز چیزی ننوشته‌ای' : 'Nothing written yet'} />
        ) : (
          <div className="grid cols-3" style={{ padding: 12 }}>
            {list.map((e) => (
              <div key={e.id} className="note-tile" onClick={() => setDay(new Date(e.date))}>
                <div className="row between">
                  <b className="tiny">
                    {MOODS[(e.mood || 3) - 1]} {formatJalaliShort(e.date)}
                  </b>
                  <Confirm text="حذف؟" onYes={() => remove('journal', e.id, 'حذف روزنگار')}>
                    <Icon name="trash" size={13} />
                  </Confirm>
                </div>
                {e.gratitude.length ? <div className="tiny">🙏 {e.gratitude.join(' · ')}</div> : null}
                <div style={{ maxHeight: 120, overflow: 'hidden', marginTop: 4 }}>
                  <Markdown>{(e.text || '').slice(0, 320)}</Markdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
