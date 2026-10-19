#!/usr/bin/env node
/**
 * Jalali calendar conformance test.
 *
 * The whole app (calendar grids, anchors, health days, streaks, `ymd` keys)
 * trusts `src/lib/jalali.ts`, so it is verified here instead of by eye:
 *
 *   1. fixed known date pairs (Nowruz, Yalda, leap-boundary days)
 *   2. a day-by-day round-trip sweep over ±10 years around today
 *   3. month lengths consistent with the year length implied by Farvardin 1
 *   4. agreement with the runtime's own `persian` Intl calendar, when present
 *
 *   npm run test:jalali
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules', '.cache', 'jalcheck');
mkdirSync(out, { recursive: true });

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', 'src/lib/jalali.ts', '--outDir', out, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--ignoreConfig'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' } },
);

const require = createRequire(import.meta.url);
const { toJalali, toGregorian, isJalaliLeap, jalaliMonthLength } = require(path.join(out, 'lib', 'jalali.js'));

const DAY = 86400000;
const utc = (gy, gm, gd) => Date.UTC(gy, gm - 1, gd);
let failed = 0;
const ok = (cond, label) => {
  if (!cond) {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${label}`);
  }
};

/* 1 ─ known pairs: Gregorian → Jalali */
const KNOWN = [
  [2026, 3, 21, 1405, 1, 1, 'Nowruz 1405'],
  [2025, 3, 21, 1404, 1, 1, 'Nowruz 1404'],
  [2027, 3, 21, 1406, 1, 1, 'Nowruz 1406'],
  [2026, 10, 19, 1405, 7, 27, 'today in the harness'],
  [2024, 12, 21, 1403, 10, 1, 'Yalda 1403 / start of Dey'],
  [2026, 1, 1, 1404, 10, 11, 'New year\'s day 2026'],
  [2016, 3, 20, 1395, 1, 1, 'Nowruz 1395 (leap year)'],
  [2017, 3, 21, 1396, 1, 1, 'Nowruz 1396'],
  [1979, 3, 21, 1358, 1, 1, 'Nowruz 1358'],
  [2025, 3, 20, 1403, 12, 30, 'leap Esfand 1403 ran to day 30'],
  [2027, 3, 20, 1405, 12, 29, 'Esfand 1405 (common year) ends on day 29'],
];
for (const [gy, gm, gd, jy, jm, jd, label] of KNOWN) {
  const j = toJalali(gy, gm, gd);
  ok(j.jy === jy && j.jm === jm && j.jd === jd, `${label}: ${gy}-${gm}-${gd} → ${j.jy}/${j.jm}/${j.jd} (want ${jy}/${jm}/${jd})`);
  const g = toGregorian(jy, jm, jd);
  ok(g.gy === gy && g.gm === gm && g.gd === gd, `${label} back: → ${g.gy}/${g.gm}/${g.gd}`);
}

/* 2 ─ round-trip every day from 2016 to 2036, both directions */
let days = 0;
for (let t = utc(2016, 1, 1); t <= utc(2036, 12, 31); t += DAY) {
  const d = new Date(t);
  const gy = d.getUTCFullYear();
  const gm = d.getUTCMonth() + 1;
  const gd = d.getUTCDate();
  const j = toJalali(gy, gm, gd);
  days++;
  ok(j.jm >= 1 && j.jm <= 12, `month out of range for ${gy}-${gm}-${gd}: ${j.jm}`);
  ok(j.jd >= 1 && j.jd <= jalaliMonthLength(j.jy, j.jm), `day out of range for ${gy}-${gm}-${gd}: ${j.jy}/${j.jm}/${j.jd}`);
  const g = toGregorian(j.jy, j.jm, j.jd);
  ok(g.gy === gy && g.gm === gm && g.gd === gd, `round-trip broke on ${gy}-${gm}-${gd}`);
}

/* 3 ─ month lengths must add up to the real length of the year */
for (let jy = 1360; jy <= 1430; jy++) {
  const total = Array.from({ length: 12 }, (_, i) => jalaliMonthLength(jy, i + 1)).reduce((a, b) => a + b, 0);
  const a = toGregorian(jy, 1, 1);
  const b = toGregorian(jy + 1, 1, 1);
  const span = Math.round((utc(b.gy, b.gm, b.gd) - utc(a.gy, a.gm, a.gd)) / DAY);
  ok(span === total, `year ${jy}: month lengths sum to ${total} but Farvardin→Farvardin spans ${span}`);
  ok(isJalaliLeap(jy) === (span === 366), `year ${jy}: isJalaliLeap disagrees with its length`);
}

/* 4 ─ cross-check against the platform's own Persian calendar (V8/ICU ships it) */
try {
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const parts = (d) => {
    const p = {};
    for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    return { jy: +p.year, jm: +p.month, jd: +p.day };
  };
  let diff = 0;
  for (let t = utc(2016, 1, 1); t <= utc(2036, 12, 31); t += DAY) {
    const d = new Date(t);
    const j = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const r = parts(d);
    if (j.jy !== r.jy || j.jm !== r.jm || j.jd !== r.jd) diff++;
  }
  ok(diff === 0, `ICU persian calendar disagrees on ${diff} days`);
  console.log(`· Intl/persian cross-check: ${diff === 0 ? 'agree' : diff + ' days differ'}`);
} catch {
  console.log('· Intl/persian cross-check: unavailable in this runtime (skipped)');
}

console.log(
  failed
    ? `\n\x1b[31m${failed}\x1b[0m/${days} day-sweep assertions failed`
    : `\n\x1b[32m✓\x1b[0m jalali engine verified (${KNOWN.length * 2} known dates, ${days} days round-tripped, 71 year lengths)`,
);
process.exit(failed ? 1 : 0);
