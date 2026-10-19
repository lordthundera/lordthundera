import { useEffect, useMemo, useState } from 'react';
import { Card, CopyButton, Field, Icon, Segmented, useToast } from '../components/ui';
import { useApp } from '../store/store';
import {
  b64,
  caseConvert,
  convertUnit,
  keywords,
  password,
  passphrase,
  polishFa,
  prettyJson,
  sha256,
  slugify,
  stats,
  summarize,
  tempConvert,
  toBullets,
  UNIT_GROUPS,
  uuid,
} from '../lib/text';
import { dateFromJalali, formatGregorian, formatJalali, jdOf, toFaDigits, ymd, addDays, diffDays } from '../lib/date';
import { toGregorian, toJalali, JALALI_MONTHS_FA } from '../lib/jalali';


/* =====================================================================
   Tools — a small lab of everyday utilities, all offline.
   ===================================================================== */

type Tab = 'text' | 'convert' | 'data' | 'units' | 'dates' | 'calc' | 'gen';

export function Tools() {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [tab, setTab] = useState<Tab>('text');

  const TABS: { v: Tab; l: string; icon: string }[] = [
    { v: 'text', l: lang === 'fa' ? 'دست‌کاری متن' : 'Text', icon: 'note' },
    { v: 'convert', l: lang === 'fa' ? 'تبدیل و فرمت' : 'Format', icon: 'tools' },
    { v: 'data', l: lang === 'fa' ? 'هش و رمز' : 'Hash', icon: 'bolt' },
    { v: 'units', l: lang === 'fa' ? 'تبدیل واحد' : 'Units', icon: 'target' },
    { v: 'dates', l: lang === 'fa' ? 'تاریخ و تقویم' : 'Dates', icon: 'calendar' },
    { v: 'calc', l: lang === 'fa' ? 'محاسبات' : 'Math', icon: 'chart' },
    { v: 'gen', l: lang === 'fa' ? 'تولیدکننده' : 'Generate', icon: 'spark' },
  ];

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <Card>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="row tight" style={{ flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button key={t.v} className={`chip ${tab === t.v ? 'ok' : 'clickable'}`} onClick={() => setTab(t.v)} style={{ cursor: 'pointer' }}>
                <Icon name={t.icon} size={13} /> {t.l}
              </button>
            ))}
          </div>
          <span className="tiny">{lang === 'fa' ? 'هیچ‌کدام از این ابزارها داده را به بیرون نمی‌فرستند.' : 'Nothing here leaves your browser.'}</span>
        </div>
      </Card>
      {tab === 'text' ? <TextLab /> : null}
      {tab === 'convert' ? <FormatLab /> : null}
      {tab === 'data' ? <HashLab /> : null}
      {tab === 'units' ? <UnitLab /> : null}
      {tab === 'dates' ? <DateLab /> : null}
      {tab === 'calc' ? <CalcLab /> : null}
      {tab === 'gen' ? <GenLab /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ text */

function TextLab() {
  const { state, add } = useApp();
  const push = useToast();
  const lang = state.settings.lang;
  const [t, setT] = useState(localStorage.getItem('pa:tool:text') ?? '');
  const [n, setN] = useState(3);
  useEffect(() => localStorage.setItem('pa:tool:text', t), [t]);
  const s = useMemo(() => stats(t), [t]);
  const kw = useMemo(() => keywords(t, 14), [t]);
  const sum = useMemo(() => summarize(t, n), [t, n]);

  const act = (label: string, out: string) => {
    setT(out);
    push('✓ ' + label, 'success');
  };

  return (
    <div className="split">
      <Card title={lang === 'fa' ? 'متن' : 'Text'} action={<CopyButton text={t} />}>
        <textarea className="textarea md-editor" style={{ minHeight: 320 }} value={t} onChange={(e) => setT(e.target.value)} placeholder={lang === 'fa' ? 'متن را اینجا بینداز…' : 'Drop text here…'} />
        <div className="row tight" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => act(lang === 'fa' ? 'پاک‌سازی فارسی' : 'polish', polishFa(t))}>
            🧹 {lang === 'fa' ? 'پاک‌سازی فارسی' : 'Polish Persian'}
          </button>
          <button className="btn sm" onClick={() => act(lang === 'fa' ? 'بولت‌دار' : 'bullets', toBullets(t))}>
            • {lang === 'fa' ? 'بولت‌دار کردن' : 'Bulletize'}
          </button>
          <button className="btn sm" onClick={() => act(lang === 'fa' ? 'خطوط تکراری حذف' : 'dedupe lines', [...new Set(t.split('\n'))].join('\n'))}>
            ⧉ {lang === 'fa' ? 'حذف تکراری' : 'Dedupe'}
          </button>
          <button className="btn sm" onClick={() => act(lang === 'fa' ? 'بدون فاصله‌های اضافی' : 'trim spaces', t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n'))}>
            ⎵ {lang === 'fa' ? 'تمیزکردن فاصله' : 'Clean spaces'}
          </button>
          <span className="spacer" />
          <button
            className="btn sm primary"
            disabled={!t.trim()}
            onClick={() => {
              add('notes', { title: t.split('\n')[0].slice(0, 50) || 'متن', body: t, tags: ['ابزار'], pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never, 'یادداشت');
              push('📝 به یادداشت‌ها منتقل شد', 'success');
            }}
          >
            📝 {lang === 'fa' ? 'برو به یادداشت‌ها' : 'Save as note'}
          </button>
        </div>
      </Card>

      <div className="col">
        <Card title={lang === 'fa' ? 'آمار' : 'Stats'} flat>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {[
              [lang === 'fa' ? 'واژه' : 'Words', s.words],
              [lang === 'fa' ? 'نویسه' : 'Chars', s.chars],
              [lang === 'fa' ? 'بی‌فاصله' : 'No spaces', s.charsNoSpace],
              [lang === 'fa' ? 'جمله' : 'Sentences', s.sentences],
              [lang === 'fa' ? 'خواندن (دقیقه)' : 'Read (min)', s.readingMinutes],
              [lang === 'fa' ? 'گفتن (دقیقه)' : 'Speak (min)', s.speakingMinutes],
            ].map(([k, v]) => (
              <div key={String(k)} className="stat">
                <span className="k">{k}</span>
                <span className="v" style={{ fontSize: 17 }}>
                  {toFaDigits(String(v))}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={lang === 'fa' ? 'خلاصهٔ خودکار' : 'Auto summary'}>
          <div className="row tight" style={{ marginBottom: 8 }}>
            <span className="tiny">{lang === 'fa' ? 'تعداد جمله' : 'sentences'}</span>
            <input className="input mono" style={{ width: 54 }} type="number" min={1} max={8} value={n} onChange={(e) => setN(Math.max(1, Math.min(8, +e.target.value)))} />
          </div>
          <div className="muted" style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{sum.summary || (lang === 'fa' ? 'متن longer از ۳ جمله باشد تا خلاصه بسازم.' : 'Write a bit more to summarise.')}</div>
          <div className="tiny" style={{ marginTop: 6 }}>
            {lang === 'fa' ? 'فشرده‌سازی' : 'compression'}: {toFaDigits(Math.round((1 - sum.ratio) * 100))}٪
          </div>
          <div className="row tight" style={{ marginTop: 8 }}>
            <CopyButton text={sum.summary} label={lang === 'fa' ? 'کپی خلاصه' : 'Copy'} />
            <button className="btn sm" disabled={!sum.summary} onClick={() => setT(sum.summary)}>
              ↧ {lang === 'fa' ? 'جایگزین کن' : 'replace'}
            </button>
          </div>
        </Card>

        <Card title={lang === 'fa' ? 'کلیدواژه‌ها' : 'Keywords'} flat>
          <div className="row tight" style={{ flexWrap: 'wrap' }}>
            {kw.length ? (
              kw.map((k) => (
                <span key={k.word} className="chip" style={{ fontSize: 11 + Math.min(6, k.count) }}>
                  {k.word} <b className="tiny">{toFaDigits(k.count)}</b>
                </span>
              ))
            ) : (
              <span className="tiny">—</span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- format lab */

function FormatLab() {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<'json' | 'case' | 'url' | 'list'>('json');

  const run = (fn: () => string) => {
    try {
      setErr('');
      setOut(fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setOut('');
    }
  };

  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card
        title={
          <div className="row tight">
            {lang === 'fa' ? 'ابزار فرمت' : 'Format lab'}
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'json', label: 'JSON' },
                { value: 'case', label: lang === 'fa' ? 'حروف' : 'Case' },
                { value: 'url', label: 'URL/B64' },
                { value: 'list', label: lang === 'fa' ? 'فهرست' : 'List' },
              ]}
            />
          </div>
        }
        action={<CopyButton text={out} />}
      >
        <div className="grid cols-2" style={{ gap: 12 }}>
          <textarea className="textarea" style={{ minHeight: 180, fontFamily: 'var(--mono)', fontSize: 12.5 }} value={src} onChange={(e) => setSrc(e.target.value)} placeholder='{"ready": true}' />
          <div className="col" style={{ gap: 8 }}>
            <div className="row tight" style={{ flexWrap: 'wrap' }}>
              {kind === 'json' && (
                <>
                  <button className="btn sm" onClick={() => run(() => prettyJson(src, 2))}>
                    {lang === 'fa' ? 'قشنگ' : 'Pretty'}
                  </button>
                  <button className="btn sm" onClick={() => run(() => JSON.stringify(JSON.parse(src)))}>
                    {lang === 'fa' ? 'فشرده' : 'Minify'}
                  </button>
                  <button className="btn sm" onClick={() => run(() => JSON.stringify(JSON.parse(src), null, 2).replace(/\\n/g, '\n'))}>
                    {lang === 'fa' ? 'جداکردن خطوط \\n' : 'Unescape \\n'}
                  </button>
                  <button className="btn sm ghost" onClick={() => run(() => JSON.stringify({ valid: true }, null, 0) + ' ✓ ' + (lang === 'fa' ? 'ساختار درست است' : 'structure is valid'))}>
                    {lang === 'fa' ? 'اعتبارسنجی' : 'Validate'}
                  </button>
                </>
              )}
              {kind === 'case' &&
                (['upper', 'lower', 'title', 'sentence', 'camel', 'snake', 'kebab', 'constant'] as const).map((c) => (
                  <button key={c} className="btn sm" onClick={() => run(() => caseConvert(src, c))}>
                    {c}
                  </button>
                ))}
              {kind === 'url' && (
                <>
                  <button className="btn sm" onClick={() => run(() => encodeURIComponent(src))}>
                    URL-encode
                  </button>
                  <button className="btn sm" onClick={() => run(() => decodeURIComponent(src))}>
                    URL-decode
                  </button>
                  <button className="btn sm" onClick={() => run(() => b64(src))}>
                    Base64 →
                  </button>
                  <button className="btn sm" onClick={() => run(() => b64(src, true))}>
                    ← Base64
                  </button>
                </>
              )}
              {kind === 'list' && (
                <>
                  <button className="btn sm" onClick={() => run(() => [...new Set(lines)].sort((a, b) => a.localeCompare(b, 'fa')).join('\n'))}>
                    {lang === 'fa' ? 'مرتب + حذف تکراری' : 'Sort + unique'}
                </button>
                  <button className="btn sm" onClick={() => run(() => lines.map((l, i) => `${i + 1}. ${l}`).join('\n'))}>
                    {lang === 'fa' ? 'شماره‌گذاری' : 'Number'}
                  </button>
                  <button className="btn sm" onClick={() => run(() => lines.map((l) => `- [ ] ${l}`).join('\n'))}>
                    ☑ {lang === 'fa' ? 'چک‌لیست' : 'Checklist'}
                  </button>
                  <button className="btn sm" onClick={() => run(() => lines.map((l) => l.replace(/\s+(\d)/g, ' $1')).join(','))}>
                    {lang === 'fa' ? 'کاما' : 'Comma-join'}
                  </button>
                  <button className="btn sm" onClick={() => run(() => lines.map(slugify).join('\n'))}>
                    slug
                  </button>
                </>
              )}
            </div>
            {err ? <div className="chip bad">⚠ {err}</div> : null}
            <textarea className="textarea" style={{ minHeight: 180, fontFamily: 'var(--mono)', fontSize: 12.5 }} value={out} onChange={(e) => setOut(e.target.value)} placeholder={lang === 'fa' ? 'خروجی اینجا' : 'output'} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- hash lab */

function HashLab() {
  const [src, setSrc] = useState('');
  const [hash, setHash] = useState('');
  const { state } = useApp();
  useEffect(() => {
    let alive = true;
    sha256(src).then((h) => alive && setHash(h));
    return () => {
      alive = false;
    };
  }, [src]);
  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title={state.settings.lang === 'fa' ? 'هش SHA-256' : 'SHA-256 hash'}>
        <div className="col">
          <textarea className="textarea" value={src} onChange={(e) => setSrc(e.target.value)} placeholder={state.settings.lang === 'fa' ? 'هر متنی…' : 'any text…'} />
          <div className="field">
            <label>digest</label>
            <div className="row tight">
              <input className="input mono" readOnly value={hash} style={{ flex: 1 }} />
              <CopyButton text={hash} label="" />
            </div>
          </div>
        </div>
      </Card>
      <Card title={state.settings.lang === 'fa' ? 'یادداشت امنیتی' : 'Privacy note'} flat>
        <div className="col" style={{ gap: 8 }}>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {state.settings.lang === 'fa'
              ? 'همهٔ محاسبات در همین مرورگر انجام می‌شود. کلید API هم در localStorage همین مرورگر می‌ماند و فقط به نشانی‌ای که خودت نوشته‌ای ارسال می‌شود.'
              : 'Everything computes in this browser. Your API key also stays in localStorage and is only sent to the endpoint you typed.'}
          </p>
          <div className="tiny">🔒 IndexedDB/localStorage · no server · <kbd>Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>F</kbd> {state.settings.lang === 'fa' ? 'برای این صفحه' : 'opens tools'}</div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- unit lab */

function UnitLab() {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [group, setGroup] = useState<keyof typeof UNIT_GROUPS>('length');
  const [value, setValue] = useState(1);
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');
  const [temp, setTemp] = useState({ v: 25, from: 'C' as 'C' | 'F' | 'K', to: 'F' as 'C' | 'F' | 'K' });
  const units = UNIT_GROUPS[group] ?? [];

  useEffect(() => {
    if (group === 'length') {
      setFrom('m');
      setTo('ft');
    } else if (group === 'mass') {
      setFrom('kg');
      setTo('lb');
    } else if (group === 'time') {
      setFrom('h');
      setTo('min');
    } else if (group === 'data') {
      setFrom('MB');
      setTo('GB');
    } else {
      setFrom('deg');
      setTo('rad');
    }
  }, [group]);

  const result = convertUnit(group, value, from, to);

  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title={lang === 'fa' ? 'تبدیل واحد' : 'Unit converter'}>
        <div className="col" style={{ gap: 12 }}>
          <div className="row tight">
            {(Object.keys(UNIT_GROUPS) as (keyof typeof UNIT_GROUPS)[]).map((g) => (
              <button key={g} className={`chip ${group === g ? 'ok' : 'clickable'}`} style={{ cursor: 'pointer' }} onClick={() => setGroup(g)}>
                {g === 'length' ? 'طول' : g === 'mass' ? 'جرم' : g === 'time' ? 'زمان' : g === 'data' ? 'داده' : 'زاویه'}
              </button>
            ))}
          </div>
          <div className="grid cols-3">
            <Field label={lang === 'fa' ? 'مقدار' : 'Value'}>
              <input className="input mono" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
            </Field>
            <Field label={lang === 'fa' ? 'از' : 'From'}>
              <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
                {units.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={lang === 'fa' ? 'به' : 'To'}>
              <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                {units.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="card flat" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800 }} className="mono">
              {toFaDigits(result.toLocaleString('en-US', { maximumFractionDigits: 6 }))}
            </div>
            <div className="tiny">
              {units.find((u) => u.unit === to)?.label} · {toFaDigits(value.toLocaleString('en-US'))} {units.find((u) => u.unit === from)?.label}
            </div>
          </div>
        </div>
      </Card>

      <Card title={lang === 'fa' ? 'دما' : 'Temperature'}>
        <div className="grid cols-3">
          <Field label={lang === 'fa' ? 'مقدار' : 'Value'}>
            <input className="input mono" type="number" value={temp.v} onChange={(e) => setTemp({ ...temp, v: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="from">
            <select className="select" value={temp.from} onChange={(e) => setTemp({ ...temp, from: e.target.value as 'C' })}>
              {(['C', 'F', 'K'] as const).map((u) => (
                <option key={u} value={u}>
                  °{u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="to">
            <select className="select" value={temp.to} onChange={(e) => setTemp({ ...temp, to: e.target.value as 'C' })}>
              {(['C', 'F', 'K'] as const).map((u) => (
                <option key={u} value={u}>
                  °{u}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="card flat" style={{ padding: 12, textAlign: 'center', marginTop: 10, fontSize: 24, fontWeight: 800 }} role="status">
          {toFaDigits(tempConvert(temp.v, temp.from, temp.to).toFixed(2))} °{temp.to}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- date lab */

function DateLab() {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [g, setG] = useState(ymd(new Date()));
  const [days, setDays] = useState(30);
  const [a, setA] = useState(ymd(new Date()));
  const [b, setB] = useState(ymd(addDays(new Date(), 30)));
  const jd = useMemo(() => jdOf(new Date(g)), [g]);
  const [jj, setJj] = useState({ y: jd.jy, m: jd.jm, d: jd.jd });

  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title={lang === 'fa' ? 'تاریخ میلادی ← جلالی' : 'Gregorian → Jalali'}>
        <div className="col" style={{ gap: 10 }}>
          <Field label="gregorian">
            <input className="input" type="date" value={g} onChange={(e) => { setG(e.target.value); const x = jdOf(new Date(e.target.value)); setJj({ y: x.jy, m: x.jm, d: x.jd }); }} />
          </Field>
          <div className="card flat" style={{ padding: 12 }}>
            <b style={{ fontSize: 20 }}>{formatJalali(g)}</b>
            <div className="tiny">{formatGregorian(g)}</div>
          </div>
          <Field label="jalali (yyyy-mm-dd)">
            <div className="row tight">
              <input className="input mono" style={{ width: 80 }} type="number" value={jj.y} onChange={(e) => setJj({ ...jj, y: +e.target.value })} />
              <input className="input mono" style={{ width: 60 }} type="number" min={1} max={12} value={jj.m} onChange={(e) => setJj({ ...jj, m: Math.min(12, Math.max(1, +e.target.value)) })} />
              <input className="input mono" style={{ width: 60 }} type="number" min={1} max={31} value={jj.d} onChange={(e) => setJj({ ...jj, d: Math.min(31, Math.max(1, +e.target.value)) })} />
            </div>
          </Field>
          <div className="card flat" style={{ padding: 12 }}>
            <b style={{ fontSize: 18 }}>{(() => { const gd = toGregorian(jj.y, jj.m, jj.d); return `${gd.gy}-${String(gd.gm).padStart(2, '0')}-${String(gd.gd).padStart(2, '0')}`; })()}</b>
            <div className="tiny">
              {JALALI_MONTHS_FA[jj.m - 1]} {jj.d}, {jj.y}
            </div>
          </div>
        </div>
      </Card>

      <Card title={lang === 'fa' ? 'فاصله و اضافه‌کردن روز' : 'Difference & offsets'}>
        <div className="col" style={{ gap: 10 }}>
          <div className="grid cols-2">
            <Field label={lang === 'fa' ? 'از' : 'from'}>
              <input className="input" type="date" value={a} onChange={(e) => setA(e.target.value)} />
            </Field>
            <Field label={lang === 'fa' ? 'تا' : 'to'}>
              <input className="input" type="date" value={b} onChange={(e) => setB(e.target.value)} />
            </Field>
          </div>
          <div className="card flat" style={{ padding: 12 }}>
            <div className="row between">
              <span className="tiny">{lang === 'fa' ? 'روز' : 'days'}</span>
              <b style={{ fontSize: 22 }}>{toFaDigits(String(Math.abs(diffDays(a, b))))}</b>
            </div>
            <div className="row between tiny">
              <span>{lang === 'fa' ? 'هفته' : 'weeks'}</span>
              <span>{toFaDigits((Math.abs(diffDays(a, b)) / 7).toFixed(1))}</span>
              <span>{lang === 'fa' ? 'ماه' : 'months'}</span>
              <span>{toFaDigits((Math.abs(diffDays(a, b)) / 30.44).toFixed(1))}</span>
            </div>
            <div className="tiny" style={{ marginTop: 4 }}>
              {formatJalali(a)} ← {formatJalali(b)}
            </div>
          </div>
          <div className="row tight">
            <input className="input mono" style={{ width: 80 }} type="number" value={days} onChange={(e) => setDays(+e.target.value)} />
            <span className="tiny">{lang === 'fa' ? 'روز بعد از' : 'days after'}</span>
            <b className="mono">{formatJalali(addDays(new Date(g), days))}</b>
          </div>
          <div className="row tight">
            <button className="btn sm" onClick={() => { const n = toJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()); setJj({ y: n.jy, m: n.jm, d: n.jd }); }}>
              {lang === 'fa' ? 'امروز را بگذار' : 'Use today'}
            </button>
            <button className="btn sm" onClick={() => { setB(ymd(dateFromJalali(jj.y, jj.m, jj.d))); }}>
              {lang === 'fa' ? 'تاریخ جلالی را به «تا» منتقل کن' : 'Send jalali → to'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- calc lab */

export function calc(expr: string): number {
  const tokens = expr.replace(/\s+/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/,/g, '').match(/\d+\.?\d*|[+\-*/^()%]/g);
  if (!tokens) throw new Error('—');
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (t?: string) => {
    if (t && peek() !== t) throw new Error('near ' + (peek() ?? 'end'));
    return tokens[pos++];
  };
  const primary = (): number => {
    if (peek() === '(') {
      eat('(');
      const v = expr4();
      eat(')');
      return v;
    }
    if (peek() === '-') {
      eat('-');
      return -primary();
    }
    const t = eat();
    if (t === undefined) throw new Error('unexpected end');
    const v = parseFloat(t);
    if (Number.isNaN(v)) throw new Error('bad token ' + t);
    return v;
  };
  const expr3 = (): number => {
    let v = primary();
    while (peek() === '%') {
      eat('%');
      v = v / 100;
    }
    while (peek() === '^') {
      eat('^');
      v = Math.pow(v, expr3());
    }
    return v;
  };
  const expr2 = (): number => {
    let v = expr3();
    while (peek() === '*' || peek() === '/') {
      const op = eat();
      const r = expr3();
      v = op === '*' ? v * r : v / r;
    }
    while (peek() === '%') {
      eat('%');
      v = v % expr3();
    }
    return v;
  };
  const expr4 = (): number => {
    let v = expr2();
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      const r = expr2();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const out = expr4();
  if (pos < tokens.length) throw new Error('extra: ' + tokens.slice(pos).join(''));
  return out;
}

function CalcLab() {
  const { state, add } = useApp();
  const lang = state.settings.lang;
  const push = useToast();
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useState<{ e: string; v: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pa:calc') ?? '[]');
    } catch {
      return [];
    }
  });
  const [tip, setTip] = useState({ bill: 0, pct: 10, people: 1 });
  const [pct, setPct] = useState({ a: 0, b: 0 });
  const value = useMemo(() => {
    try {
      return calc(expr);
    } catch {
      return null;
    }
  }, [expr]);

  useEffect(() => localStorage.setItem('pa:calc', JSON.stringify(history.slice(0, 20))), [history]);

  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title={lang === 'fa' ? 'ماشین‌حساب' : 'Calculator'}>
        <input
          className="input mono"
          style={{ fontSize: 20, textAlign: 'center' }}
          value={expr}
          placeholder="۲+۲ × ۳"
          onChange={(e) => setExpr(e.target.value.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value != null) {
              setHistory((h) => [{ e: expr, v: String(value) }, ...h]);
              push('= ' + toFaDigits(String(value)), 'success');
            }
          }}
        />
        <div className="card flat" style={{ padding: 10, textAlign: 'center', marginTop: 10, fontSize: 26, fontWeight: 800 }}>
          {value == null ? <span className="tiny">—</span> : toFaDigits(value.toLocaleString('en-US', { maximumFractionDigits: 6 }))}
        </div>
        <div className="row tight" style={{ justifyContent: 'center', marginTop: 10 }}>
          {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')'].map((k) => (
            <button key={k} className="btn" style={{ minWidth: 40 }} onClick={() => setExpr((x) => x + k)}>
              {k}
            </button>
          ))}
        </div>
        <div className="row tight" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn" onClick={() => setExpr((x) => x.slice(0, -1))}>⌫</button>
          <button className="btn" onClick={() => setExpr('')}>C</button>
          <button className="btn primary" onClick={() => value != null && setExpr(String(value))}>=</button>
          <button
            className="btn ghost"
            disabled={value == null}
            onClick={() => {
              add('snippets', { label: expr, text: `${expr} = ${value}`, createdAt: new Date().toISOString() } as never, 'محاسبه');
              push('📌 ذخیره شد', 'success');
            }}
          >
            📌
          </button>
        </div>
        {history.length ? (
          <div className="col" style={{ gap: 3, marginTop: 10 }}>
            {history.slice(0, 6).map((h, i) => (
              <button key={i} className="row between tiny" style={{ background: 'none', border: 0, cursor: 'pointer', padding: '2px 4px' }} onClick={() => setExpr(h.e)}>
                <span className="mono truncate">{h.e}</span>
                <b className="mono">{toFaDigits(h.v)}</b>
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="col">
        <Card title={lang === 'fa' ? 'پیش‌محاسبهٔ سبد' : 'Quick splits'} flat>
          <div className="grid cols-3">
            <Field label={lang === 'fa' ? 'مبلغ' : 'Bill'}>
              <input className="input mono" type="number" value={tip.bill} onChange={(e) => setTip({ ...tip, bill: +e.target.value })} />
            </Field>
            <Field label={lang === 'fa' ? '٪ سرویس' : 'Tip %'}>
              <input className="input mono" type="number" value={tip.pct} onChange={(e) => setTip({ ...tip, pct: +e.target.value })} />
            </Field>
            <Field label={lang === 'fa' ? 'نفر' : 'People'}>
              <input className="input mono" type="number" min={1} value={tip.people} onChange={(e) => setTip({ ...tip, people: Math.max(1, +e.target.value) })} />
            </Field>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="tiny">{lang === 'fa' ? 'سهم هر نفر' : 'per person'}</span>
            <b className="mono">{toFaDigits(((tip.bill * (1 + tip.pct / 100)) / tip.people).toLocaleString('en-US', { maximumFractionDigits: 0 }))}</b>
          </div>
        </Card>
        <Card title={lang === 'fa' ? 'درصد' : 'Percent'} flat>
          <div className="row tight">
            <input className="input mono" style={{ width: 90 }} type="number" value={pct.a} onChange={(e) => setPct({ ...pct, a: +e.target.value })} />
            <span className="tiny">% of</span>
            <input className="input mono" style={{ width: 90 }} type="number" value={pct.b} onChange={(e) => setPct({ ...pct, b: +e.target.value })} />
            <span className="spacer" />
            <b className="mono">{toFaDigits(((pct.a / Math.max(1e-9, pct.b)) * 100).toFixed(1))}٪</b>
          </div>
          <div className="row between tiny" style={{ marginTop: 8 }}>
            <span>{lang === 'fa' ? 'افزایش از ' : 'change from '}{toFaDigits(String(pct.b))} → {toFaDigits(String(pct.a))}</span>
            <b>{toFaDigits((((pct.a - pct.b) / Math.max(1e-9, pct.b)) * 100).toFixed(1))}٪</b>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- gen lab */

function GenLab() {
  const { state } = useApp();
  const lang = state.settings.lang;
  const [len, setLen] = useState(18);
  const [opts, setOpts] = useState({ upper: true, digits: true, symbols: true, fa: false });
  const [pw, setPw] = useState(() => password(18, { upper: true, digits: true, symbols: true }));
  const [words, setWords] = useState(4);
  const [pp, setPp] = useState(() => passphrase(4));
  const strength = Math.min(4, Math.floor((len * (Object.values(opts).filter(Boolean).length + 1)) / 14));

  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title={lang === 'fa' ? 'ساز رمز عبور' : 'Password generator'} action={<CopyButton text={pw} label="" />}>
        <div className="col" style={{ gap: 10 }}>
          <input className="input mono" readOnly value={pw} style={{ fontSize: 17, letterSpacing: '0.04em', textAlign: 'center' }} />
          <div className="row tight">
            <span className="chip {['','bad','warn','','ok'][strength]}">
              {'●'.repeat(strength + 1)}
              <span className="tiny"> {lang === 'fa' ? 'قدرت' : 'strength'}</span>
            </span>
          </div>
          <div className="row between">
            <span className="tiny">{lang === 'fa' ? 'طول' : 'Length'}</span>
            <input style={{ width: 200 }} type="range" min={8} max={48} value={len} onChange={(e) => setLen(+e.target.value)} />
            <b className="mono">{toFaDigits(len)}</b>
          </div>
          <div className="row tight">
            {(
              [
                ['upper', 'ABCDEFG'],
                ['digits', '0123456789'],
                ['symbols', '!@#$%'],
                ['fa', 'ابپتث'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {l}
              </label>
            ))}
            <span className="spacer" />
            <button className="btn sm primary" onClick={() => setPw(password(len, opts))}>
              🎲 {lang === 'fa' ? 'بساز' : 'make'}
            </button>
          </div>
        </div>
      </Card>

      <div className="col">
        <Card title={lang === 'fa' ? 'عبارت قابل‌حفظ' : 'Passphrase'} action={<CopyButton text={pp} label="" />}>
          <div className="col" style={{ gap: 8 }}>
            <input className="input mono" readOnly value={pp} style={{ textAlign: 'center', fontSize: 16 }} />
            <div className="row between">
              <span className="tiny">{lang === 'fa' ? 'تعداد واژه' : 'words'}</span>
              <input style={{ width: 200 }} type="range" min={3} max={8} value={words} onChange={(e) => setWords(+e.target.value)} />
              <b className="mono">{toFaDigits(words)}</b>
            </div>
            <button className="btn sm" onClick={() => setPp(passphrase(words))}>
              🎲 {lang === 'fa' ? 'عبارت دیگر' : 'new phrase'}
            </button>
          </div>
        </Card>
        <Card title={lang === 'fa' ? 'شناسه و نمونه' : 'IDs & samples'} flat>
          <div className="col" style={{ gap: 6 }}>
            <div className="row tight">
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(uuid())}>
                uuid
              </button>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(slugify(state.settings.name || 'نمونه'))}>
                slug
              </button>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'))}>
                {lang === 'fa' ? 'کد ۶ رقمی' : '6-digit code'}
              </button>
            </div>
            <div className="tiny">{lang === 'fa' ? 'روی کلیپ‌بورد کپی می‌شود.' : 'Copied to clipboard.'}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

