import {
  faWeekday,
  GREGORIAN_MONTHS_EN,
  JALALI_MONTHS_FA,
  toGregorian,
  toJalali,
  WEEKDAYS_EN,
  WEEKDAYS_FA,
  jalaliMonthLength,
  type JD,
} from './jalali';

/* ------------------------------------------------------------------ digits */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian/Arabic digits → latin, normalize Arabic yeh/keheh, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)))
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/\u200F|\u200E|\u0640/g, '') // bidi marks, tatweel
    .replace(/\s+/g, ' ')
    .trim();
}

export function toFaDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

export function localizeDigits(s: string, lang: 'fa' | 'en'): string {
  return lang === 'fa' ? toFaDigits(s) : s;
}

/* ------------------------------------------------------------------- dates */

export const DAY = 86_400_000;

export function startOfDay(d: Date | string): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date | string): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function addDays(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
}
export function sameDay(a: Date | string, b: Date | string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
export function ymd(d: Date | string): string {
  const x = new Date(d);
  const m = `${x.getMonth() + 1}`.padStart(2, '0');
  const day = `${x.getDate()}`.padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function minutesOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}
export function hhmm(d: Date | string): string {
  const x = new Date(d);
  return `${`${x.getHours()}`.padStart(2, '0')}:${`${x.getMinutes()}`.padStart(2, '0')}`;
}
export function setTime(d: Date | string, h: number, m = 0): Date {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

/* ------------------------------------------------------------------ jalali */

export function jdOf(d: Date | string): JD {
  const x = new Date(d);
  return toJalali(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

export function dateFromJalali(jy: number, jm: number, jd: number): Date {
  const g = toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd);
}

export function formatJalali(d: Date | string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const x = new Date(d);
  const j = jdOf(x);
  const label = `${JALALI_MONTHS_FA[j.jm - 1]} ${j.jd}, ${j.jy}`;
  const wd = opts.weekday === false ? '' : `${WEEKDAYS_FA[faWeekday(x)]}، `;
  // the Jalali label is Persian by definition → Persian digits throughout
  return toFaDigits(opts.year === false ? `${wd}${JALALI_MONTHS_FA[j.jm - 1]} ${j.jd}` : `${wd}${label}`);
}

export function formatJalaliShort(d: Date | string): string {
  const j = jdOf(d);
  return `${j.jy}/${`${j.jm}`.padStart(2, '0')}/${`${j.jd}`.padStart(2, '0')}`;
}

export function formatGregorian(d: Date | string, withWeekday = true): string {
  const x = new Date(d);
  const s = `${GREGORIAN_MONTHS_EN[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
  return withWeekday ? `${WEEKDAYS_EN[faWeekday(x)]}, ${s}` : s;
}

/** "۳ روز بعد", "۵ ساعت پیش" … */
export function relTime(iso: string | Date, now: Date = new Date(), lang: 'fa' | 'en' = 'fa'): string {
  const t = new Date(iso).getTime();
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const future = diff >= 0;
  const p = (n: number, fa: [string, string, string], en: string) => {
    if (lang === 'fa') {
      const s = n <= 1 ? fa[0] : n <= 34 ? fa[1] : fa[2];
      return `${toFaDigits(Math.abs(n))} ${s}`;
    }
    return `${Math.abs(n)} ${en}`;
  };
  if (min < 1) return lang === 'fa' ? 'همین حالا' : 'just now';
  if (min < 60)
    return future
      ? lang === 'fa'
        ? `${p(min, ['دقیقه', 'دقیقه', 'دقیقه'], 'min')} دیگر`
        : `in ${p(min, ['', '', ''], 'min')}`
      : lang === 'fa'
        ? `${p(min, ['دقیقه', 'دقیقه', 'دقیقه'], 'min')} پیش`
        : `${p(min, ['', '', ''], 'min')} ago`;
  const hours = Math.round(min / 60);
  if (hours < 24)
    return future
      ? lang === 'fa'
        ? `${p(hours, ['ساعت', 'ساعت', 'ساعت'], 'h')} دیگر`
        : `in ${p(hours, ['', '', ''], 'h')}`
      : lang === 'fa'
        ? `${p(hours, ['ساعت', 'ساعت', 'ساعت'], 'h')} پیش`
        : `${p(hours, ['', '', ''], 'h')} ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30)
    return future
      ? lang === 'fa'
        ? `${p(days, ['روز', 'روز', 'روز'], 'd')} دیگر`
        : `in ${p(days, ['', '', ''], 'd')}`
      : lang === 'fa'
        ? `${p(days, ['روز', 'روز', 'روز'], 'd')} پیش`
        : `${p(days, ['', '', ''], 'd')} ago`;
  const months = Math.round(days / 30);
  return future
    ? lang === 'fa'
      ? `${p(months, ['ماه', 'ماه', 'ماه'], 'mo')} دیگر`
      : `in ${p(months, ['', '', ''], 'mo')}`
    : lang === 'fa'
      ? `${p(months, ['ماه', 'ماه', 'ماه'], 'mo')} پیش`
      : `${p(months, ['', '', ''], 'mo')} ago`;
}

/* ------------------------------------------------------------ month matrix */

/** 6×7 matrix of dates covering the month that contains `anchor` (Saturday-first). */
export function monthMatrix(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -faWeekday(first));
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d));
    weeks.push(row);
  }
  return weeks;
}

export function jalaliMonthGrid(jy: number, jm: number): (JD | null)[][] {
  const days = jalaliMonthLength(jy, jm);
  const first = dateFromJalali(jy, jm, 1);
  const offset = faWeekday(first);
  const cells: (JD | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push({ jy, jm, jd: d });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (JD | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** whole-day difference (b - a) */
export function diffDays(a: Date | string, b: Date | string): number {
  return Math.round((startOfDay(new Date(b)).getTime() - startOfDay(new Date(a)).getTime()) / DAY);
}

export function dayOfYear(d: Date): number {
  return Math.floor((startOfDay(d).getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / DAY);
}
