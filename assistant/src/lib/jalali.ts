/**
 * Jalali (Persian / Shamsi) calendar conversion.
 * Algorithm port of the well-known jalaali-js breaks-table approach.
 * Pure functions, no dependencies.
 */

export interface JD {
  jy: number;
  jm: number; // 1-based month
  jd: number; // 1-based day
}
export interface GD {
  gy: number;
  gm: number;
  gd: number;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
  2394, 2456, 3178,
];

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

interface JalCal {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number): JalCal {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  let n: number;

  if (jy < BREAKS[0] || jy >= BREAKS[bl - 1]) {
    // Out of the tabulated range: fall back to a 2820-year style approximation.
    leapJ = div(jy - 621 - 4, 4) - div(jy - 621 - 1, 100) * 3 + div(jy - 621 - 1, 400) + 3;
    const march = 20 + (leapJ - (div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150));
    return { leap: 0, gy, march };
  }

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;

  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** Julian day number from Gregorian parts. */
export function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Gregorian parts from Julian day number. */
export function d2g(jdn: number): GD {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function toJalali(gy: number, gm: number, gd: number): JD {
  const jdn = g2d(gy, gm, gd);
  const r = jalCal(gy - 621);
  const jdn1f = g2d(r.gy, 3, r.march);
  let jy = gy - 621;
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    /* the day falls in the Jalali year that just ended: its leap day (if any)
       is recorded on the *new* year's cycle entry, not the old one */
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30); // months 7…12 all run 30 days
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toGregorian(jy: number, jm: number, jd: number): GD {
  const r = jalCal(jy);
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1);
}

export function isJalaliLeap(jy: number): boolean {
  try {
    return jalCal(jy).leap === 0;
  } catch {
    return false;
  }
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

export const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const GREGORIAN_MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAYS_FA = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
export const WEEKDAYS_FA_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
export const WEEKDAYS_EN = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** 0 = Saturday ... 6 = Friday, matching JS getDay() shifted for the Iranian week. */
export function faWeekday(d: Date): number {
  return (d.getDay() + 1) % 7;
}
