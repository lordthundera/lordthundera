#!/usr/bin/env node
/**
 * Render smoke test: mounts every view in React's server renderer with a
 * seeded store, so a crash, an empty screen, a `NaN`, an `Invalid Date` or a
 * leaked `undefined` in any view fails `npm test` — long before a human has to
 * notice it in the browser.
 *
 * Browser globals are stubbed (localStorage, matchMedia, AudioContext,
 * Notification, speechSynthesis, clipboard); effects never run under
 * `renderToString`, which is exactly what we want for a render-only check.
 *
 *   npm run test:render
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules', '.cache', 'rendercheck');
mkdirSync(out, { recursive: true });

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'tsc',
    'src/App.tsx',
    '--outDir',
    out,
    '--rootDir',
    'src',
    '--module',
    'commonjs',
    '--jsx',
    'react-jsx',
    '--target',
    'es2022',
    '--skipLibCheck',
    '--esModuleInterop',
    '--ignoreConfig',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' } },
);

const ymdOf = (d) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
const TODAY = new Date(2026, 9, 19, 14, 5, 0);
const today = ymdOf(TODAY);
const tomorrowD = new Date(TODAY.getTime() + 86400000);
const tomorrow = ymdOf(tomorrowD);
const iso = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();

const seed = (lang, { onboarded = true } = {}) => ({
  onboarded,
  past: [],
  settings: {
    lang,
    name: lang === 'fa' ? 'نیما' : 'Nima',
    theme: 'auto',
    calendar: 'jalali',
    wakeTime: '07:30',
    sleepTime: '23:30',
    dailyReview: '21:00',
    currency: 'تومان',
    monthBudget: 25000000,
    waterGoal: 8,
    showDemoData: false,
    llm: { enabled: false, baseUrl: '', model: '', apiKey: '' },
  },
  collections: {
    tasks: [
      {
        id: 't1',
        title: lang === 'fa' ? 'پرداخت بیمه ماشین' : 'car insurance',
        notes: 'مبلغ: 4,500,000',
        done: false,
        priority: 3,
        due: iso(TODAY, 18),
        remindAt: iso(TODAY, 17),
        tags: [lang === 'fa' ? 'کار' : 'work'],
        projectId: 'p1',
        subtasks: [{ id: 's1', title: lang === 'fa' ? 'تسویه' : 'settle', done: false }],
        repeat: 'none',
        kind: 'task',
        createdAt: TODAY.toISOString(),
      },
      {
        id: 't2',
        title: lang === 'fa' ? 'تمرین پیانو' : 'piano practice',
        done: false,
        priority: 1,
        due: iso(tomorrowD, 20),
        tags: [],
        subtasks: [],
        repeat: 'daily',
        kind: 'task',
        createdAt: TODAY.toISOString(),
      },
      {
        id: 't3',
        title: lang === 'fa' ? 'تمیزکاری آشپزخانه' : 'kitchen reset',
        done: true,
        completedAt: TODAY.toISOString(),
        priority: 2,
        due: iso(TODAY, 9),
        tags: [],
        subtasks: [],
        repeat: 'none',
        kind: 'task',
        createdAt: TODAY.toISOString(),
      },
    ],
    projects: [{ id: 'p1', name: lang === 'fa' ? 'اسباب‌کشی' : 'moving', color: '#5b52ff' }],
    notes: [
      {
        id: 'n1',
        title: lang === 'fa' ? 'ایدهٔ اپ موبایل' : 'mobile app idea',
        body: '# ایده\n\n- ردیابی آب\n- [x] تقویم جلالی\n\n```js\nconst a = 1;\n```',
        tags: ['ایده'],
        pinned: true,
        createdAt: TODAY.toISOString(),
        updatedAt: TODAY.toISOString(),
      },
    ],
    events: [
      {
        id: 'e1',
        title: lang === 'fa' ? 'جلسه تیم محصول' : 'product sync',
        start: iso(TODAY, 9),
        end: iso(TODAY, 10),
        location: lang === 'fa' ? 'اتاق ۴' : 'room 4',
        tags: ['تقویم'],
        createdAt: TODAY.toISOString(),
      },
      {
        id: 'e2',
        title: lang === 'fa' ? 'کلاس زبان' : 'language class',
        start: iso(tomorrowD, 18, 30),
        end: iso(tomorrowD, 20),
        tags: [],
        createdAt: TODAY.toISOString(),
      },
    ],
    habits: [
      {
        id: 'h1',
        name: lang === 'fa' ? 'مطالعه' : 'reading',
        emoji: '📚',
        color: '#24b47e',
        unit: lang === 'fa' ? 'دقیقه' : 'min',
        target: 20,
        days: 'daily',
        log: { [today]: 20, [ymdOf(new Date(TODAY.getTime() - 86400000))]: 25, [ymdOf(new Date(TODAY.getTime() - 2 * 86400000))]: 10 },
        createdAt: TODAY.toISOString(),
      },
    ],
    transactions: [
      { id: 'x1', kind: 'out', amount: 250000, category: 'خوراک', note: lang === 'fa' ? 'ناهار' : 'lunch', date: today, createdAt: TODAY.toISOString() },
      { id: 'x2', kind: 'out', amount: 1200000, category: 'قبوض و مسکن', note: 'برق', date: ymdOf(new Date(TODAY.getTime() - 3 * 86400000)), createdAt: TODAY.toISOString() },
      { id: 'x3', kind: 'in', amount: 28000000, category: 'حقوق', note: lang === 'fa' ? 'حقوق ماه' : 'salary', date: ymdOf(new Date(TODAY.getTime() - 8 * 86400000)), createdAt: TODAY.toISOString() },
    ],
    journal: [
      { id: 'j1', date: today, mood: 4, energy: 3, text: lang === 'fa' ? 'روز خوب و پرانرژی بود' : 'a good, energetic day', gratitude: [lang === 'fa' ? 'چای' : 'tea'], createdAt: TODAY.toISOString() },
    ],
    health: [{ id: today, date: today, water: 3, sleep: 7, steps: 4200, weight: 73.5 }],
    anchors: [{ id: 'a1', title: lang === 'fa' ? 'تولد مامان' : "mom's birthday", date: '2027-03-03', yearly: true, note: lang === 'fa' ? 'گل هم بخر' : 'buy flowers' }],
    chat: [{ id: 'c1', role: 'assistant', text: lang === 'fa' ? 'سلام! چطور می‌تونم کمکت کنم؟' : 'hi, how can I help?', ts: TODAY.toISOString() }],
    snippets: [{ id: 'sn1', label: 'کد ملی', text: '0012345678', createdAt: TODAY.toISOString() }],
  },
});

const VIEWS = [
  ['today', ['بیمه', 'insurance']],
  ['tasks', ['بیمه', 'insurance']],
  ['calendar', ['جلسه', 'sync']],
  ['notes', ['ایدهٔ اپ', 'app idea']],
  ['habits', ['مطالعه', 'reading']],
  ['money', ['ناهار', 'lunch']],
  ['journal', ['پرانرژی', 'energetic']],
  ['health', ['آب', 'Water']],
  ['focus', ['تمرکز', 'Focus']],
  ['tools', ['دست‌کاری متن', 'Text']],
  ['settings', ['تنظیمات', 'Settings']],
];

const script = `
const store = new Map();
store.set('pa:v1', process.env.SEED);
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.Notification = class { static permission = 'default'; static requestPermission() { return Promise.resolve('granted'); } constructor(t, o) { this.body = o && o.body; this.close = () => {}; } };
class Param { setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} }
class Node { constructor() { this.frequency = new Param(); this.gain = new Param(); } connect() {} start() {} stop() {} }
globalThis.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; } createOscillator() { return new Node(); } createGain() { return new Node(); } };
globalThis.speechSynthesis = { getVoices: () => [], speak() { this.spoke = true; }, cancel() {} };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.navigator = { language: 'fa-IR', languages: ['fa-IR'], onLine: true, serviceWorker: undefined, clipboard: { writeText: () => Promise.resolve() } };
globalThis.location = { hash: '', href: 'http://localhost:5173/', reload() {}, assign() {}, replace() {} };
globalThis.document = {
  title: '',
  documentElement: { lang: 'fa', dir: 'rtl', dataset: { theme: 'light' }, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute: () => null, style: { setProperty() {}, removeProperty() {} } },
  body: { appendChild() {}, removeChild() {}, style: {}, classList: { add() {}, remove() {} } },
  head: { appendChild() {} },
  createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, click() {}, remove() {}, focus() {}, select() {}, blur() {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
};
globalThis.window = new Proxy(globalThis, { get: (t, p) => (p in t ? t[p] : undefined), set: (t, p, v) => ((t[p] = v), true) });
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const out = ${JSON.stringify(out)};
const React = require('react');
const { renderToString } = require('react-dom/server');
const App = require(out + '/App.js').default;
const { AppProvider } = require(out + '/store/store.js');

const view = process.env.VIEW;
globalThis.location.hash = '#' + view;
try {
  const html = renderToString(React.createElement(AppProvider, null, React.createElement(App)));
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\\s+/g, ' ').trim();
  process.stdout.write(JSON.stringify({ ok: true, len: html.length, text }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e), stack: String((e && e.stack) || '').split('\\n').slice(1, 4).join(' | ') }));
}
`;
const runner = path.join(out, 'runner.cjs');
writeFileSync(runner, script);

let failed = 0;
const check = (cond, label, extra) => {
  if (cond) console.log(`\x1b[32m✓\x1b[0m ${label}`);
  else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${label}${extra ? `\n     ${extra}` : ''}`);
  }
};

const render = (view, lang, opts = {}) => {
  const raw = execFileSync(process.execPath, [runner], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, VIEW: view, SEED: JSON.stringify(seed(lang, opts)) },
  });
  return JSON.parse(raw);
};

for (const lang of ['fa', 'en']) {
  for (const [view, markers] of VIEWS) {
    const r = render(view, lang);
    if (!r.ok) {
      check(false, `${view} (${lang}) renders`, r.error + ' — ' + r.stack);
      continue;
    }
    const junk = /(NaN|Invalid Date|undefined|\[object Object\])/.exec(r.text);
    check(!junk, `${view} (${lang}) has no ${junk ? junk[1] : 'junk'} in its text`, junk ? r.text.slice(Math.max(0, junk.index - 60), junk.index + 60) : '');
    const wanted = markers.some((m) => r.text.includes(m));
    check(wanted, `${view} (${lang}) shows seeded data`, wanted ? '' : `expected one of ${markers.join(' / ')} in: ${r.text.slice(0, 160)}`);
    check(r.len > 4000, `${view} (${lang}) is a full screen (${(r.len / 1000).toFixed(1)} kB html)`, `only ${r.len} chars: ${r.text.slice(0, 160)}`);
  }
}

/* the first-run onboarding sheet must appear when nothing was seeded yet */
{
  const raw = execFileSync(process.execPath, [runner], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, VIEW: 'today', SEED: JSON.stringify(seed('fa', { onboarded: false })) },
  });
  const r = JSON.parse(raw);
  check(r.ok && /خوش|بیا|نیما|زبان|Start|welcome/i.test(r.text), 'onboarding sheet renders for a first run', r.ok ? r.text.slice(0, 160) : r.error);
}

console.log(
  failed
    ? `\n\x1b[31m${failed}\x1b[0m render assertions failed`
    : `\n\x1b[32m✓\x1b[0m every view renders with seeded data in fa and en`,
);
process.exit(failed ? 1 : 0);
