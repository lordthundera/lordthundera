#!/usr/bin/env node
/**
 * Zero-dependency test for the Persian/English command parser.
 * Compiles the pure lib modules to CJS in a cache dir, then asserts.
 *   npm test
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules', '.cache', 'nlcheck');
mkdirSync(out, { recursive: true });

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'tsc',
    'src/lib/nl.ts',
    'src/lib/date.ts',
    'src/lib/jalali.ts',
    '--outDir',
    out,
    '--module',
    'commonjs',
    '--jsx',
    'react-jsx',
    '--target',
    'es2022',
    '--skipLibCheck',
    '--ignoreConfig',
  ],
  { cwd: root, stdio: 'inherit' },
);

const require = createRequire(import.meta.url);
const { parse } = require(path.join(out, 'lib', 'nl.js'));

const NOW = new Date(2026, 9, 19, 14, 5, 0); // Mon 19 Oct 2026 = 27 Mehr 1405
const P = (s) => parse(s, { now: NOW }).intents[0] ?? null;

const cases = [
  ['فردا ساعت ۹ جلسه با تیم محصول', (i) => i.kind === 'event' && i.title === 'تیم محصول' && i.start.endsWith('09:00:00.000Z')],
  ['یادم باشه جمعه گزارش رو بفرستم', (i) => i.kind === 'task' && i.title === 'گزارش رو بفرستم' && !!i.remindAt],
  ['خرج ناهار ۲۵۰ هزار تومان', (i) => i.kind === 'tx' && i.amount === 250000 && i.txKind === 'out' && i.category === 'خوراک'],
  ['درآمد حقوق ۲۸ میلیون', (i) => i.kind === 'tx' && i.amount === 28000000 && i.txKind === 'in'],
  ['خرج قبض اینترنت ۸۹۰۰۰۰', (i) => i.kind === 'tx' && i.amount === 890000 && i.category === 'قبوض و مسکن'],
  ['ثبت خرج ۱ میلیون و ۲۰۰ هزار برای سفر', (i) => i.kind === 'tx' && i.amount === 1200000 && i.category === 'تفریح و سفر'],
  ['یادداشت: ایدهٔ اپ موبایل برای ردیابی آب', (i) => i.kind === 'note' && i.title.includes('اپ موبایل')],
  ['تایمر ۲۵ دقیقه', (i) => i.kind === 'timer' && i.minutes === 25],
  ['/timer 45', (i) => i.kind === 'timer' && i.minutes === 45],
  ['عادت ۲۰ دقیقه مطالعه هر روز', (i) => i.kind === 'habit' && i.name === 'مطالعه' && i.target === 20],
  ['۳ لیوان آب خوردم', (i) => i.kind === 'health' && i.field === 'water' && i.amount === 3],
  ['۷ ساعت خوابیدم', (i) => i.kind === 'health' && i.field === 'sleep' && i.amount === 7],
  ['وزنم ۷۳.۵ کیلو', (i) => i.kind === 'health' && i.field === 'weight' && Math.abs(i.amount - 73.5) < 0.01],
  ['برنامه امروز من چیه؟', (i) => i.kind === 'ask'],
  ['how many tasks are left?', (i) => i.kind === 'ask'],
  ['گزارش هفتگی فوری !!! #کار', (i) => i.kind === 'task' && i.priority === 3 && i.tags.includes('کار')],
  ['هر روز ۲۰ دقیقه مطالعه', (i) => i.kind === 'task' && i.repeat === 'daily' && i.title === 'مطالعه'],
  ['بعد فردا ساعت ۱۶ ویزیت دکتر', (i) => i.kind === 'task' && i.due.startsWith('2026-10-21T16:00')],
  ['spent $45 on lunch', (i) => i.kind === 'tx' && i.amount === 45 && i.category === 'خوراک'],
  ['remind me to call mom sunday 6pm', (i) => i.kind === 'task' && i.title === 'call mom' && i.due.endsWith('18:00:00.000Z')],
  ['برو به یادداشت‌ها', (i) => i.kind === 'open' && i.view === 'notes'],
  ['از روزم بنویس: امروز خوب بود', (i) => i.kind === 'journal' && i.text === 'امروز خوب بود'],
  ['امشب ساعت ۲۲ یادآوری دارو', (i) => i.kind === 'task' && i.due.startsWith('2026-10-19T22:00')],
  ['۲ مرداد ساعت ۱۰ مهمانی', (i) => i.kind === 'event' && i.start.startsWith('2027-07-24T10:00')],
  ['ساعت ۹:۳۰ صبح کلاس زبان', (i) => i.kind === 'event' && i.start.endsWith('09:30:00.000Z')],
  ['یه قرار پنجشنبه ۱۸:۳۰ کافه نیک', (i) => i.kind === 'event' && i.start.startsWith('2026-10-22T18:30')],
  ['/note خریدها: شیر، نان', (i) => i.kind === 'note' && i.body.includes('خریدها')],
  ['/task ارسال مقاله فردا', (i) => i.kind === 'task' && i.title === 'ارسال مقاله' && !!i.due],
  ['/money ۳۰۰ هزار تاکسی', (i) => i.kind === 'tx' && i.amount === 300000 && i.category === 'حمل‌ونقل'],
  ['خرید هدیهٔ تولد مامان', (i) => i.kind === 'task' && i.title.includes('هدیه')],
  ['تولد مامان ۱۲ اسفند', (i) => i.kind === 'anchor' && i.yearly],
  ['۳۰ دقیقه پیاده‌روی', (i) => i.kind === 'task' && i.title === 'پیاده‌روی'],
  ['q2 رو انجام بده', (i) => i.kind === 'complete'],
  ['/water', (i) => i.kind === 'open' && i.view === 'health'],
  ['فردا صبح ۹ جلسه با سارا', (i) => i.kind === 'event' && i.start.endsWith('09:00:00.000Z')],
  ['بدهکاری ۴۰۰ هزار تومان به آرش', (i) => i.kind === 'task' && i.title === 'بدهکاری به آرش' && i.notes.includes('400,000')],
  ['یادداشت: ایده اپ موبایل', (i) => i.kind === 'note' && i.body === 'ایده اپ موبایل'],
  ['هر روز ساعت ۸ صبح مدیتیشن', (i) => i.kind === 'task' && i.repeat === 'daily' && i.due.endsWith('08:00:00.000Z')],
  ['next friday dinner at 8pm', (i) => i.kind === 'event'],
  ['امشب ۴۵ دقیقه فوکوس', (i) => i.kind === 'timer' && i.minutes === 45],
  ['۲۰ عدد اسکوات', (i) => i.kind === 'task' && i.title.includes('اسکوات')],
  ['هفته‌ای ۳ بار ورزش', (i) => i.kind === 'task' && i.repeat === 'weekly' && i.title === 'ورزش'],
  ['memo buy milk در ۲ روز', (i) => i.kind === 'task' || i.kind === 'note'],
  ['وام: قسط ۵ میلیون', (i) => i.kind === 'tx' && i.amount === 5000000 && i.txKind === 'out'],
  ['/done q3', (i) => i.kind === 'complete' && i.query === 'q3'],
  ['/anchor عید ۱ فروردین', (i) => i.kind === 'anchor' && i.yearly],
  ['/focus 15', (i) => i.kind === 'timer' && i.minutes === 15],
  ['/journal امروز عالی بود', (i) => i.kind === 'journal' && i.text.includes('عالی')],
  ['چطور انگیزه‌ام را نگه دارم؟', (i) => i.kind === 'ask'],
];

let failed = 0;
const pad = '·';
for (const [text, check] of cases) {
  let ok = false;
  let intent = null;
  try {
    intent = P(text);
    ok = !!intent && check(intent);
  } catch (e) {
    intent = { error: e.message };
  }
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${pad} ${text}${ok ? '' : '\n     got: ' + JSON.stringify(intent).slice(0, 220)}`);
  if (!ok) failed++;
}

console.log(`\n${cases.length - failed}/${cases.length} command-parsing tests passed`);
process.exit(failed ? 1 : 0);
