import { addDays, normalizeText, ymd, dateFromJalali, jdOf, formatJalali, formatGregorian, toFaDigits } from './date';
import { JALALI_MONTHS_FA } from './jalali';
import type { Priority } from '../store/store';

/* ============================================================================
   Natural-language command engine — understands Persian *and* English so you
   can just say what you want:
     «فردا ساعت ۹ جلسه با تیم محصول #کار»
     «خرج ناهار ۲۵۰ هزار تومان»
     «یادم باشه جمعه گزارش رو بفرستم !!!»
     «تایمر ۲۵ دقیقه» · «۳ لیوان آب خوردم» · «عادت ۲۰ دقیقه مطالعه هر روز»
   Pure functions: no network, no dependencies, unit-testable.
   ========================================================================== */

export type Intent =
  | {
      kind: 'task';
      title: string;
      priority: Priority;
      due?: string;
      remindAt?: string;
      tags: string[];
      repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'weekdays';
      notes?: string;
    }
  | { kind: 'note'; title: string; body: string; tags: string[] }
  | { kind: 'event'; title: string; start: string; end?: string; location?: string; tags: string[] }
  | { kind: 'tx'; txKind: 'in' | 'out'; amount: number; category: string; note?: string; date: string }
  | { kind: 'habit'; name: string; target: number; unit: string; emoji?: string }
  | { kind: 'health'; field: 'water' | 'sleep' | 'steps' | 'weight'; amount: number; date: string; mode: 'add' | 'set' }
  | { kind: 'journal'; mood?: number; energy?: number; text?: string; date: string }
  | { kind: 'timer'; minutes: number; label?: string }
  | { kind: 'anchor'; title: string; date: string; yearly: boolean }
  | { kind: 'complete'; query: string }
  | { kind: 'open'; view: string }
  | { kind: 'ask'; question: string };

export interface ParseResult {
  intents: Intent[];
  lang: 'fa' | 'en';
  notes: string[];
}

interface Opts {
  now?: Date;
}

type Span = [number, number];

/** digit + script normalisation that keeps every character index intact */
function norm(s: string): string {
  return s
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/\u200C/g, ' ')
    .replace(/\u200F|\u200E/g, '')
    .toLowerCase();
}

function cut(src: string, spans: Span[]): string {
  // merge overlapping ranges first, then delete them back-to-front so indices stay valid
  const sorted = [...spans].map(([a, b]) => [Math.max(0, a), Math.min(src.length, b)] as Span).sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const [a, b] of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && a <= prev[1]) prev[1] = Math.max(prev[1], b);
    else merged.push([a, b]);
  }
  let out = src;
  for (const [a, b] of [...merged].sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + ' ' + out.slice(b);
  return normalizeText(out)
    .replace(/^(?:که|با|در|برای|به)\s+/i, '')
    .replace(/\s+(?:که|در ساعت|ساعت)$/i, '')
    .replace(/[،,:;\.\-–—\s]+$/g, '')
    .replace(/^[\s،,:;\.\-–—]+/g, '')
    .trim();
}

/* --------------------------------------------------------------- dates */

const DAY_WORDS =
  /(پس‌فردا|پس فردا|بعد از فردا|بعد فردا|day after tomorrow|امروز|امشب|today|فردا|فرداکه|tomorrow|دیروز|yesterday|هفتهٔ بعد|هفته بعد|هفته دیگه|next week|ماه بعد|next month)/i;

const WEEKDAY_FA: Record<string, number> = {
  شنبه: 6,
  یکشنبه: 0,
  دوشنبه: 1,
  سهشنبه: 2,
  چهارشنبه: 3,
  پنجشنبه: 4,
  جمعه: 5,
};
/** strip ZWNJ/spaces so یکشنبه / یک‌شنبه / یک شنبه all map to the same key */
const weekdayKey = (s: string) => s.replace(/[\s\u200C\u2000-\u200F]/g, '').toLowerCase();
const WEEKDAY_EN: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function extractDate(n: string, now: Date): { date: Date; span: Span } | null {
  const midnight = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const base = midnight(now);
  let m: RegExpExecArray | null;

  // numeric: 1405/08/02 (jalali) or 2026-10-24 (gregorian)
  const iso = /(?:تاریخ\s*)?(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/.exec(n);
  if (iso) {
    const y = +iso[1];
    const date = y >= 1200 && y <= 1500 ? dateFromJalali(y, +iso[2], +iso[3]) : midnight(new Date(y, +iso[2] - 1, +iso[3]));
    return { date: midnight(date), span: [iso.index, iso.index + iso[0].length] };
  }

  // «۲ مرداد» / «مرداد ۲»
  for (let i = 0; i < JALALI_MONTHS_FA.length; i++) {
    const mo = JALALI_MONTHS_FA[i];
    const rx = new RegExp(`${mo}\\s+(\\d{1,2})|(\\d{1,2})\\s+${mo}`, 'i');
    m = rx.exec(n);
    if (m) {
      const day = +(m[1] ?? m[2]);
      const jy = jdOf(now).jy;
      let d = dateFromJalali(jy, i + 1, day);
      if (d < base) d = dateFromJalali(jy + 1, i + 1, day);
      return { date: midnight(d), span: [m.index, m.index + m[0].length] };
    }
  }

  m = DAY_WORDS.exec(n);
  if (m) {
    const w = m[0];
    const shift = /پس.?فردا|بعد از فردا|بعد فردا|day after tomorrow/.test(w)
      ? 2
      : /فردا|tomorrow/.test(w)
        ? 1
        : /امشب/.test(w)
          ? 0
          : /امروز|today/.test(w)
            ? 0
            : /دیروز|yesterday/.test(w)
              ? -1
              : /هفته|week/.test(w)
                ? 7
                : /ماه|month/.test(w)
                  ? 30
                  : 0;
    return { date: addDays(base, shift), span: [m.index, m.index + w.length] };
  }

  if ((m = /(?:در|طی|ظرف|تا|within|in)\s*(\d{1,3})\s*(?:روز|working days?|days?)/i.exec(n)))
    return { date: addDays(base, +m[1]), span: [m.index, m.index + m[0].length] };
  if ((m = /(\d{1,3})\s*(?:روز|days?)\s*(?:بعد|دیگر|later|hence)/i.exec(n)))
    return { date: addDays(base, +m[1]), span: [m.index, m.index + m[0].length] };

  m =
    /(?:\b(?:next|after)\s+)?(?<![\p{L}])(یک‌?شنبه|سه‌?\s?شنبه|پنج‌?\s?شنبه|چهارشنبه|دوشنبه|جمعه|شنبه|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(\s+(?:بعد|بعدی|آینده|دیگه|next))?(?![\p{L}])/iu.exec(
      n,
    );
  if (m) {
    const key = weekdayKey(normalizeText(m[1]));
    const en = m[1].toLowerCase().replace(/\s/g, '');
    const target = WEEKDAY_FA[key] ?? (WEEKDAY_EN[en] as number | undefined) ?? 6;
    const jsDay = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const jsTarget = (target + 6) % 7; // convert Sat-first index → Mon-first
    let delta = (jsTarget - jsDay + 7) % 7;
    if (m[2]) delta += 7;
    else if (delta === 0 && now.getHours() >= 18) delta = 7; // evening → means next week
    return { date: addDays(base, delta), span: [m.index, m.index + m[0].length] };
  }
  return null;
}

/* --------------------------------------------------------------- times */

interface TimeOut {
  hour: number;
  minute: number;
  span: Span;
}

const DAYPART_PM = /(عصر|شب|شب‌ها|evening|night|pm)/i;
const DAYPART_AM = /(صبح|بامداد|morning|am)/i;

function extractTime(n: string): TimeOut | null {
  const specs: { rx: RegExp; hour: number; min: number; part: number }[] = [
    { rx: /(?:ساعت|سَاعت|saat|at)\s*(\d{1,2})(?:\s*[:\.٫]\s*(\d{2}))?\s*(صبح|بامداد|ظهر|عصر|شب|am|pm)?/i, hour: 1, min: 2, part: 3 },
    { rx: /(\d{1,2})\s*[:\.٫]\s*(\d{2})\s*(صبح|بامداد|ظهر|عصر|شب|am|pm)?/, hour: 1, min: 2, part: 3 },
    { rx: /(\d{1,2})\s*(صبح|بامداد|ظهر|عصر|شب|am|pm)(?![\p{L}])/iu, hour: 1, min: 0, part: 2 },
    { rx: /(?<![\p{L}])(صبح|بامداد|ظهر|عصر|شب|morning|afternoon|evening|night)\s*(\d{1,2})(?:\s*[:\.٫]\s*(\d{2}))?/iu, hour: 2, min: 3, part: 1 },
  ];
  for (const spec of specs) {
    const m = spec.rx.exec(n);
    if (!m) continue;
    // never read «۲۰ دقیقه» as a clock time
    if (/^\s*(?:دقیقه|minute)/i.test(n.slice(m.index + m[0].length))) continue;
    let hour = +m[spec.hour];
    if (!Number.isFinite(hour)) continue;
    const minuteRaw = spec.min ? m[spec.min] : undefined;
    const minute = minuteRaw != null && minuteRaw !== '' ? Math.min(59, +minuteRaw) : 0;
    const part = (m[spec.part] ?? '').toLowerCase();
    const tail = n.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const isPm = DAYPART_PM.test(part) || DAYPART_PM.test(tail);
    const isAm = DAYPART_AM.test(part) || DAYPART_AM.test(tail) || /ظهر|noon/.test(part);
    if (isPm && hour < 12) hour += 12;
    else if (isAm && hour === 12) hour = 0;
    else if (/نیمه.?شب|midnight/.test(n.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6))) hour = 0;
    else if (hour >= 1 && hour <= 7) hour += 12; // bare small hour → afternoon guess
    if (hour > 23) hour %= 24;
    return { hour, minute, span: [m.index, m.index + m[0].length] };
  }
  return null;
}

/* -------------------------------------------------------------- numbers */

const MULT: Record<string, number> = {
  هزار: 1e3,
  هزاره: 1e3,
  thousand: 1e3,
  k: 1e3,
  میلیون: 1e6,
  million: 1e6,
  milyan: 1e6,
  m: 1e6,
  میلیارد: 1e9,
  billion: 1e9,
  b: 1e9,
  تومن: 1,
  تومان: 1,
  ریال: 0.1,
  dollar: 1,
  dollars: 1,
  euro: 1,
};

/** "۲۵۰ هزار" → 250000, "۱.۲ میلیون" → 1200000, "۸۹۰۰۰۰" → 890000 */
export function parseAmount(text: string): number | null {
  const s = norm(text).replace(/[،,]/g, '').replace(/\u066B/g, '.');
  const rx = /(\d+(?:\.\d+)?)\s*(هزار|میلیون|میلیارد|thousand|million|billion|k|m|b|ریال|تومان|تومن|dollars?|euro)?/g;
  let m: RegExpExecArray | null;
  let best: number | null = null;
  let sum = 0;
  while ((m = rx.exec(s))) {
    const val = parseFloat(m[1]);
    const mult = m[2] ? MULT[m[2]] ?? 1 : 1;
    const piece = val * mult;
    if (!m[2] && val >= 1000) return val;
    sum += piece;
    const tail = s.slice(m.index + m[0].length).match(/^\s*و?\s*(\d+(?:\.\d+)?)\s*(هزار|میلیون|میلیارد)/);
    if (tail) {
      sum += parseFloat(tail[1]) * (MULT[tail[2]] ?? 1);
      rx.lastIndex = m.index + m[0].length + tail[0].length;
    }
    if (best == null || sum > best) best = sum;
  }
  return best;
}

function extractAmount(n: string, wantMoney: boolean): { amount: number; span: Span } | null {
  const rx =
    /\$?\s*\d+(?:[.,]\d+)?\s*(?:هزار|میلیون|میلیارد|k|m|b)?(?:\s*و\s*\d+(?:[.,]\d+)?\s*(?:هزار|میلیون|میلیارد))?\s*(?:تومان|تومن|ریال|\$|dollars?|euros?)?/gi;
  let m: RegExpExecArray | null;
  let best: { amount: number; span: Span } | null = null;
  while ((m = rx.exec(n))) {
    const amount = parseAmount(m[0]);
    if (amount == null) continue;
    const hasUnit = /(هزار|میلیون|میلیارد|تومان|تومن|ریال|\$|dollar|euro)/i.test(m[0]);
    if (wantMoney || hasUnit) {
      if (!best || amount > best.amount) best = { amount, span: [m.index, m.index + m[0].length] };
    }
  }
  return best;
}

/* ------------------------------------------------------- tags/prio/dur */

function extractTags(n: string): { tags: string[]; spans: Span[] } {
  const tags: string[] = [];
  const spans: Span[] = [];
  const rx = /#([\p{L}\p{N}_-]{1,24})/gu;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(n))) {
    tags.push(m[1]);
    spans.push([m.index, m.index + m[0].length]);
  }
  return { tags, spans };
}

const URGENT = /(فوری|اورژانسی|خیلی مهم|خیلی‌مهم|important|urgent|asap|critical|high priority|اولویت بالا)/i;
const LOW = /(کم‌اهمیت|کم اهمیت|هر وقت شد|low priority|not important|later)/i;

function extractPriority(n: string): { priority: Priority; spans: Span[] } {
  const spans: Span[] = [];
  const bangs = /!{1,3}/.exec(n);
  if (bangs) spans.push([bangs.index, bangs.index + bangs[0].length]);
  let priority: Priority = bangs ? (Math.min(bangs[0].length, 3) as Priority) : 2;
  const word = URGENT.exec(n);
  if (word) {
    spans.push([word.index, word.index + word[0].length]);
    priority = 3;
  }
  const low = LOW.exec(n);
  if (low && !word) {
    spans.push([low.index, low.index + low[0].length]);
    priority = 1;
  }
  return { priority, spans };
}

function extractDuration(n: string): { minutes: number; spans: Span[] } {
  let minutes = 0;
  const spans: Span[] = [];
  const h = /(\d{1,3})\s*(?:ساعت(?:ه)?|ساعات|hours?|hrs?|h\b)/i.exec(n);
  if (h) {
    minutes += +h[1] * 60;
    spans.push([h.index, h.index + h[0].length]);
  }
  const mnt = /(\d{1,3})\s*(?:دقیقه|دقیقیه|minutes?|min)/i.exec(n);
  if (mnt) {
    minutes += +mnt[1];
    spans.push([mnt.index, mnt.index + mnt[0].length]);
  }
  if (!minutes) {
    const half = /نیم\s*ساعت/.exec(n);
    if (half) {
      minutes = 30;
      spans.push([half.index, half.index + half[0].length]);
    }
  }
  const andHalf = /(\d{1,3})\s*(?:ساعت(?:ه)?|hours?)\s*و\s*نیم/i.exec(n);
  if (andHalf) {
    minutes = +andHalf[1] * 60 + 30;
    spans.push([andHalf.index, andHalf.index + andHalf[0].length]);
  }
  return { minutes, spans };
}

/* ---------------------------------------------------------- categories */

const CATEGORY_MAP: [RegExp, string][] = [
  [/(ناهار|لنچ|غذا|رستوران|فست.?فود|کافه|قهوه|کترینگ|شام|سوپر|مارکت|میوه|نان|grocer|lunch|dinner|food|burger|پیتزا)/i, 'خوراک'],
  [/(تاکسی|اسنپ|تپسی|مترو|بیس|اتوبوس|بنزین|پارکینگ|uber|taxi|bus|metro|کرایه ماشین|پل)/i, 'حمل‌ونقل'],
  [/(اجاره|رهن|شارژ|قبض|اینترنت|موبایل|تلفن|آب و برق|برق|گاز|rent|bill|utility)/i, 'قبوض و مسکن'],
  [/(دکتر|پزشک|دارو|داروخانه|دندان|بیمارستان|gym|باشگاه|ورزش|clinic|dentist|medicine)/i, 'سلامت'],
  [/(کتاب|دوره|کلاس|آموزش|مطالعه|course|class|tuition|ثبت‌نام)/i, 'آموزش'],
  [/(سینما|تئاتر|کنسرت|بازی|netflix|فیلم|game|سفر|هتل|پرواز|بلیط|تور)/i, 'تفریح و سفر'],
  [/(حقوق|پاداش|فروش|سود|salary|income|paycheck|dividend|freelance|قرارداد)/i, 'درآمد'],
  [/(هدیه|جایزه|پول توجیبی|gift)/i, 'هدیه'],
  [/(بیمه|مالیات|قسط|وام|loan|insurance|tax|installment)/i, 'قسط و مالی'],
];

function guessCategory(text: string, isIn: boolean): string {
  if (isIn) {
    for (const [rx, cat] of CATEGORY_MAP) if (cat === 'درآمد' && rx.test(text)) return 'حقوق';
    return 'درآمد';
  }
  for (const [rx, cat] of CATEGORY_MAP) if (rx.test(text) && cat !== 'درآمد') return cat;
  return 'متفرقه';
}

/* -------------------------------------------------------------- views */

const VIEWS: [RegExp, string][] = [
  [/یادداشت|notes?\b/i, 'notes'],
  [/تقویم|کالیندار|calendar/i, 'calendar'],
  [/عادت|habits?\b/i, 'habits'],
  [/پول|خرج|هزینه|بودجه|مالی|money|budget|expense/i, 'money'],
  [/تمرکز|پومودورو|فوکوس|focus|تایمر/i, 'focus'],
  [/روزنگار|ژورنال|journal|diary/i, 'journal'],
  [/سلامت|آب|خواب|health/i, 'health'],
  [/ابزار|tools?|ماشین.?حساب|تبدیل/i, 'tools'],
  [/تنظیمات|setting/i, 'settings'],
  [/کار|تسک|todo|tasks?\b/i, 'tasks'],
  [/امروز|today|داشبورد|home/i, 'today'],
];

/* ---------------------------------------------------------- verb strip */

const LEAD_VERBS =
  /^(?:لطفا(?:مین|)?\s*)?(?:برایم\s*)?(?:یاد(م|مون|ش)?\s*(?:باشه|بنداز|آوری کن|آوری)|remind\s+me(?:\s+to)?|reminder(?:\s+to)?|یادمون\s*باشه|نمی‌خوام\s*فراموش|ثبت\s*(?:کن|کردم)?|اضافه\s*کن|افزودن|create\s+a?|add\s+(?:a\s+|new\s+)?|new\s+|یه?\s*(?:کار|یادداشت|رویداد|جلسه|عادت)\s*(?:جدید)?(?:\s*[:：-]\s*)?|todo\s*[:：-]?|task\s*[:：-]?|باید|لازمه|قرار\s*(?:بذار|بدیم)?|بذار|ست\s*کن|تعیین\s*کن|برنامه‌ریزی(?:\s*کن)?|یادداشت(?:ی)?\s*(?:جدید)?\s*[:：-]?|note\s*(?:it\s*down)?\s*[:：-]?|jot\s*down|بنویس|write\s*down)\s*/i;

const EVENT_WORDS = /^(?:جلسه|ملاقات|قرار\s*(?:لمقات|ملاقات)?|کلاس|رویداد|قراره|appointment|meeting|event|call)\s*(?:با|در|برای|about|with)?\s*/i;

/* ============================================================================
   Intent classification
   ========================================================================== */

function detectKind(n: string, now: Date): Intent['kind'] {
  const has = (re: RegExp) => re.test(n);
  const num = /\d/.test(n);
  if (/^(?:برو\s+به|برو\s+توی|برو\s+سمت|باز\s+کن|نمایش\s+بده|برو\s+روی|go\s+to|open\s|show\s+me)\s/i.test(n)) return 'open';
  if (/[؟?]\s*$/.test(n) && !/^(?:ثبت|خرید|خرج)/i.test(n)) return 'ask';
  if (
    has(/(?:تایمر|پومودورو|زمان.?سنج|timer|pomodoro|focus\s+session)/i) ||
    (has(/(?:فوکوس|کار\s*متمرکز|focus)/iu) && /\d/.test(n) && !has(/(?:یادآوری|reminder|جلسه)/i))
  )
    return 'timer';
  if (has(/(?:انجامش\s*بده|انجام\s*بده|تمامش\s*کن|تمام\s*کن|انجام\s*شد|ختم\s*کن|علامت\s*بزن|complete|mark\s+done|mark\s+as\s+done|finish)/i) && !has(/(?:خرج|هزینه|پول)/i)) return 'complete';
  if (has(/(?:لیوان|glass(?:es)?|\bcups?\b|جام)/iu) && has(/(?:آب|نوش|drink|water|هیدرات)/i) && !has(/(?:خرید|بخر|buy|فروش|قیمت|خرج)/i)) return 'health';
  if (has(/(?:آب|water)/i) && has(/(?:خوردم|نوشیدم|خورم|ثبت|add|log|\+\s*\d)/i) && !has(/(?:خرید|بخر|buy|خرج)/i)) return 'health';
  if (has(/(?:خواب|sleep)/i) && (num || has(/(?:ساعت|quality|کیفیت)/i)) && !has(/(?:یادآوری|reminder)/i)) return 'health';
  if (has(/(?:قدم|steps|پیمایش|راه\s+رفتم)/i) && num) return 'health';
  if (has(/(?:وزن|weight|کیلو)/i) && num && !has(/(?:خرج|هزینه|قیمت)/i)) return 'health';
  if (has(/(?:روزنگار|ژورنال|journal|diary|از\s+روزم|حال\s+و\s+روزم|روحیه|mood|قدردانی|شکرگذارم)/i)) return 'journal';
  if (has(/(?:درآمد|حقوق\s*گرفتم|پول\s*گرفتم|دریافت\s*کردم|فروش|earned|received|income|got\s+paid)/i) && num) return 'tx';
  if (
    has(/(?:خرج|هزینه|پرداختم|پول\s*دادم|خریدم|قیمت|قسط|وام|اجاره|spent|paid|cost|expense|bought|installment|\$)/i) &&
    num
  )
    return 'tx';
  if (has(/(?:یادداشت|بنویس|note|jot\s+down|اسکرچ|scratch)/i)) return 'note';
  if (has(/(?:عادت|habit|Routine|روتین)/i)) return 'habit';
  if (
    has(/(?:تولد|سالگرد|anniversary|birthday|مناسبت|(?<![\p{L}])جشن(?![\p{L}]))/iu) &&
    !has(EVENT_WORDS) &&
    (extractDate(n, now) !== null || /^\s*(?:تولد|سالگرد|birthday|anniversary|جشن)/i.test(n))
  )
    return 'anchor';
  if (has(/(?:یادآوری|یادم\s*باشه|یادش\s*بنداز|فراموشت\s*نکن|reminder|remind\s+me|یادآوری\s*کن)/i)) return 'task';
  if (
    has(
      /(?:جلسه|ملاقات|قرار(?:ه)?(?![\p{L}])|کلاس|رویداد|ورکشاپ|مهمانی|جشن|سینما|کنسرت|بازی|سفر|تور|شام|ناهار|ناهار|appointment|meeting|event|schedul|dinner|lunch|party|wedding|concert|movie|gathering|workshop|تماس|call\s+(?:با|with)|زنگ\s*بزن)/iu,
    )
  )
    return 'event';
  if (has(/^(?:ثبت|افزودن|اضافه|یه?\s*کار|کار\s*جدید|add|new|create|todo|task|تسک)/i)) return 'task';
  if (has(/(?:چرا|چطور|چگونه|چیه|چطورم|چند|آیا|ایا|می‌تونم|میشه|چیکار|بگو|پیشنهاد|نظر|کمک|انگیزه|motiv|why|how|what|when|which|where|can\s+i|should\s+i|idea|advice|help)/i)) return 'ask';
  return 'task';
}

/* ============================================================================
   Parse one sentence into an intent
   ========================================================================== */

function parseOne(kind: Intent['kind'], part: string, now: Date, notes: string[]): Intent | null {
  const raw = part.trim();
  const n = norm(raw);
  const spans: Span[] = [];

  const date = extractDate(n, now);
  if (date) spans.push(date.span);
  const time = extractTime(n);
  if (time) spans.push(time.span);
  const wantMoney = kind === 'tx';
  const amount = extractAmount(n, wantMoney);
  if (amount && kind !== 'note' && kind !== 'open' && kind !== 'ask') spans.push(amount.span);
  const tags = extractTags(n);
  spans.push(...tags.spans);
  const prio = extractPriority(n);
  spans.push(...prio.spans);
  const dur = extractDuration(n);
  spans.push(...dur.spans);

  const repeat = /(?:هر\s*روز|روزانه|daily|every\s*day)/i.test(n)
    ? ('daily' as const)
    : /(?:هفته.?ای|هر\s*هفته|هفتگی|weekly|every\s*week)/i.test(n)
      ? ('weekly' as const)
      : /(?:ماهانه|هر\s*ماه|monthly)/i.test(n)
        ? ('monthly' as const)
        : /(?:روزهای\s*کار|weekdays)/i.test(n)
          ? ('weekdays' as const)
          : undefined;

  let title = cut(raw, spans);
  title = title.replace(LEAD_VERBS, '').replace(/^(?:که)\s+/i, '').trim();
  if (repeat) {
    const stripped = title
      .replace(/(?:هر\s*روز|روزانه|daily|every\s*day|هفته.?ای|هر\s*هفته|هفتگی|weekly|every\s*week|ماه.?انه|هر\s*ماه|monthly|روزهای\s*کار|weekdays)(?:\s*[۰-۹0-9]+\s*(?:بار|روز|times?|days?)\s*(?:در\s*(?:هفته|ماه))?)?/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (stripped.length > 2) title = stripped;
  }
  if (kind === 'event') {
    const stripped = title.replace(EVENT_WORDS, '').trim();
    if (stripped.length > 1) title = stripped;
  }
  if (!title) title = normalizeText(raw).replace(LEAD_VERBS, '').trim() || normalizeText(raw);

  const baseDay = date?.date ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (h: number, mn: number) => {
    const d = new Date(baseDay);
    d.setHours(h, mn, 0, 0);
    return d;
  };

  switch (kind) {
    case 'task': {
      const remindAt = time ? at(time.hour, time.minute) : date ? at(9, 0) : undefined;
      const due = time ? at(time.hour, time.minute) : date ? at(18, 0) : undefined;
      /* only keep what the task record cannot hold: a sum of money and an effort estimate */
      const bits: string[] = [];
      if (amount) bits.push(`مبلغ: ${amount.amount.toLocaleString('en-US')}`);
      if (dur.minutes > 0) bits.push(`مدت: ${dur.minutes} دقیقه`);
      return {
        kind: 'task',
        title,
        priority: prio.priority,
        ...(due ? { due: due.toISOString() } : {}),
        ...(remindAt ? { remindAt: remindAt.toISOString() } : {}),
        tags: tags.tags,
        repeat: repeat ?? 'none',
        notes: bits.length ? bits.join(' · ') : undefined,
      };
    }
    case 'event': {
      const start = at(time?.hour ?? 10, time?.minute ?? 0);
      const end = new Date(start.getTime() + (dur.minutes > 0 ? dur.minutes * 60000 : 60 * 60000));
      const loc = /(?:محل|لوکیشن|location|در\s+نشانی)\s+([^.,،؛]{3,44})/i.exec(raw);
      if (loc) spans.push([loc.index, loc.index + loc[0].length]);
      return {
        kind: 'event',
        title: title || (lang_fa(n) ? 'جلسه' : 'meeting'),
        start: start.toISOString(),
        end: end.toISOString(),
        location: loc ? normalizeText(loc[1]) : undefined,
        tags: tags.tags.length ? tags.tags : ['تقویم'],
      };
    }
    case 'note': {
      const notePrefix = /^(?:یادداشت|note)(?:\s*جدید)?\s*[:：-]\s*/i;
      const body = raw.replace(notePrefix, '').trim();
      const firstLine = (body.split('\n')[0] ?? body).replace(/^#+\s*/, '');
      return {
        kind: 'note',
        title: (normalizeText(firstLine).slice(0, 60) || 'یادداشت').replace(/[*`]/g, ''),
        body,
        tags: tags.tags,
      };
    }
    case 'tx': {
      const isIn = /(?:درآمد|حقوق گرفتم|گرفتم|دریافت|فروش|سود|earned|received|income)/i.test(n);
      const amt = amount?.amount ?? parseAmount(n);
      if (amt == null) {
        notes.push(lang_fa(n) ? 'مبلغ را در متن پیدا نکردم — مثلاً «خرج ناهار ۲۵۰ هزار».' : 'No amount found — e.g. “spent 250 on lunch”.');
        return null;
      }
      const forWhat = /(?:برای|بابت|for)\s+([^.,،؛]{2,32})/i.exec(raw);
      const category = guessCategory(forWhat ? forWhat[1] : cut(raw, spans), isIn);
      let noteText = cut(raw, spans)
        .replace(/^(?:خرج|هزینه|پرداختم|خریدم|paid|spent|cost|ثبت\s*خرج)\s*/i, '')
        .replace(/^(?:برای|بابت|for)\s+/i, '')
        .replace(/\$|toman|تومان|تومن|ریال/gi, '')
        .trim();
      if (noteText === title && forWhat) noteText = normalizeText(forWhat[1]);
      if (noteText === category || noteText.length < 2) noteText = forWhat ? normalizeText(forWhat[1]) : '';
      return { kind: 'tx', txKind: isIn ? 'in' : 'out', amount: Math.round(amt), category, note: noteText || undefined, date: ymd(baseDay) };
    }
    case 'habit': {
      const emoji = /([\p{Extended_Pictographic}])/u.exec(raw)?.[1];
      const unit = /دقیقه|minute/i.test(n) ? 'دقیقه' : /صفحه|page/i.test(n) ? 'صفحه' : /بار|times?/i.test(n) ? 'بار' : /کیلومتر|km/i.test(n) ? 'کیلومتر' : 'دقیقه';
      const target = dur.minutes > 0 ? dur.minutes : amount?.amount ? Math.round(amount.amount) : 1;
      const name = title
        .replace(/عادت/g, '')
        .replace(/هر\s*روز|daily/gi, '')
        .replace(/^(?:ساختن|ساز|new| بساز)\s*/i, '')
        .trim();
      return { kind: 'habit', name: name || (lang_fa(n) ? 'عادت جدید' : 'New habit'), target, unit, emoji: emoji || '🌱' };
    }
    case 'health': {
      if (/(?:خواب|sleep)/i.test(n)) {
        const h = dur.minutes ? dur.minutes / 60 : /(\d(?:[.,]\d)?)\s*(?:ساعت(?:ه)?|hours?|hrs?|h\b)/i.exec(n)?.[1];
        if (!h) {
          notes.push(lang_fa(n) ? 'ساعت خواب را بنویس (مثلاً «۷ ساعت خوابیدم»).' : 'Mention hours, e.g. “slept 7 hours”.');
          return null;
        }
        return { kind: 'health', field: 'sleep', amount: parseFloat(String(h).replace(',', '.')), date: ymd(baseDay), mode: 'set' };
      }
      if (/(?:قدم|steps|پیمایش|راه رفتم)/i.test(n)) {
        const v = amount?.amount ?? parseAmount(n);
        if (v == null) return null;
        return { kind: 'health', field: 'steps', amount: Math.round(v), date: ymd(baseDay), mode: 'set' };
      }
      if (/(?:وزن|weight|کیلو)/i.test(n)) {
        const raw2 = /(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:کیلو|kg)?/i.exec(n);
        const v = raw2 ? parseFloat(raw2[1].replace(',', '.')) : null;
        if (v == null) return null;
        return { kind: 'health', field: 'weight', amount: v > 400 ? v / 1000 : v, date: ymd(baseDay), mode: 'set' };
      }
      const cups = /(\d{1,2})\s*(?:لیوان|لیوانی|glass(?:es)?|cup|جام)/i.exec(n);
      const litres = /(\d(?:[.,]\d)?)\s*(?:لیتر|لتر|lit(?:er|re))/i.exec(n);
      const value = cups ? +cups[1] : litres ? Math.round(parseFloat(litres[1].replace(',', '.')) * 4) : /(?:آب\s*\+|add\s*water)/i.test(n) ? 1 : 1;
      return { kind: 'health', field: 'water', amount: value, date: ymd(baseDay), mode: 'add' };
    }
    case 'journal': {
      const moodM = /(?:حالم|مود|روحیه|feeling|mood)[^0-9]{0,12}([1-5])(?:\s*(?:از|\/)\s*5)?/i.exec(n);
      const energyM = /(?:انرژی|energy)[^0-9]{0,12}([1-5])/i.exec(n);
      const afterColon = raw.replace(/^[^:：]*[:：]\s*/, '');
      const fromColon = afterColon !== raw ? afterColon : '';
      const text = fromColon || cut(raw, spans).replace(/^(?:از روزم بنویس|روزنگار|ژورنال|journal)(?:\s*جدید)?\s*[:：-]?\s*/i, '');
      return {
        kind: 'journal',
        mood: moodM ? +moodM[1] : undefined,
        energy: energyM ? +energyM[1] : undefined,
        text: normalizeText(text) || undefined,
        date: ymd(baseDay),
      };
    }
    case 'timer': {
      const bare = /(\d{1,3})(?:\s*(?:ساعت|hours?|h))?\s*(?:دقیقه|minutes?|min)?/i.exec(n);
      const bareMinutes = bare ? (+bare[1] * (/ساعت|hours?|\bh\b/i.test(n) && !/دقیقه|minute|min/i.test(n) ? 60 : 1) || 0) : 0;
      const mins = dur.minutes > 0 ? dur.minutes : bareMinutes > 0 ? bareMinutes : 25;
      return { kind: 'timer', minutes: Math.min(Math.max(mins, 1), 180), label: title || undefined };
    }
    case 'anchor': {
      /* «عید ۱ فروردین» has no year → it belongs to every year. A date written with an
         explicit year (1404 / 2026 / 2026-05-05) is a one-off. */
      const hasYear = /\d{4}/.test(n);
      return {
        kind: 'anchor',
        title: title.replace(/(?:^|[\s])(?:جشن\s+)?(?:تولد|سالگرد|birthday|anniversary)/giu, ' ').trim() || title || 'مناسبت',
        date: ymd(baseDay),
        yearly: /تولد|سالگرد|birthday|anniversary|جشن|عید|نوروز|یادبود/i.test(n) || !hasYear,
      };
    }
    case 'complete': {
      const q = normalizeText(
        cut(raw, spans)
          .replace(/(?:انجامش?\s*بده|تمامش\s*کن|تمام\s*کن|انجام\s*شد|ختم\s*کن|علامت\s*بزن|complete|mark\s+(?:as\s+)?done|finish)/gi, '')
          .replace(/(?:^(?:این|اون|کار|تسک)\s+|^(?:the\s+)?(?:task|todo)\s+)/i, '')
          .replace(/\s+(?:رو|را|آن|the)\s*$/i, ''),
      );
      return { kind: 'complete', query: q || title };
    }
    case 'open': {
      for (const [rx, v] of VIEWS) if (rx.test(n)) return { kind: 'open', view: v };
      return { kind: 'open', view: 'today' };
    }
    case 'ask':
    default:
      return { kind: 'ask', question: raw };
  }
}

const lang_fa = (s: string) => /[\u0600-\u06FF]/.test(s);

/* ============================================================================
   Entry point
   ========================================================================== */

export function parse(input: string, opts: Opts = {}): ParseResult {
  const now = opts.now ?? new Date();
  const raw = (input ?? '').trim();
  const n = norm(raw);
  const notes: string[] = [];
  const lang: 'fa' | 'en' = lang_fa(n) ? 'fa' : 'en';
  if (!n) return { intents: [], lang, notes };

  /* a slash command with no argument just opens its view */
  const BARE: Record<string, string> = {
    '/water': 'health',
    '/آب': 'health',
    '/health': 'health',
    '/سلامت': 'health',
    '/sleep': 'health',
    '/today': 'today',
    '/امروز': 'today',
    '/home': 'today',
    '/tasks': 'tasks',
    '/کار': 'tasks',
    '/todo': 'tasks',
    '/notes': 'notes',
    '/یادداشت': 'notes',
    '/calendar': 'calendar',
    '/تقویم': 'calendar',
    '/habits': 'habits',
    '/عادت': 'habits',
    '/money': 'money',
    '/خرج': 'money',
    '/پول': 'money',
    '/journal': 'journal',
    '/روزنگار': 'journal',
    '/focus': 'focus',
    '/timer': 'focus',
    '/tools': 'tools',
    '/ابزار': 'tools',
    '/settings': 'settings',
    '/تنظیمات': 'settings',
  };
  const bare = BARE[norm(raw).toLowerCase()];
  if (bare) return { intents: [{ kind: 'open', view: bare }], lang, notes };

  /* explicit slash commands always win */
  const slash =
    /^\/(task|todo|کار|note|یادداشت|event|جلسه|رویداد|money|خرج|income|درآمد|timer|focus|تمرکز|habit|عادت|water|آب|journal|روزنگار|anchor|مناسبت|done|انجام|open|برو|ask|بپرس)\s+(.+)$/su.exec(
      raw,
    );
  if (slash) {
    const verb = slash[1].toLowerCase();
    const rest = slash[2].trim();
    const kindFor: Record<string, Intent['kind']> = {
      task: 'task',
      todo: 'task',
      'کار': 'task',
      note: 'note',
      'یادداشت': 'note',
      event: 'event',
      'جلسه': 'event',
      money: 'tx',
      'خرج': 'tx',
      income: 'tx',
      'درآمد': 'tx',
      timer: 'timer',
      focus: 'timer',
      'تمرکز': 'timer',
      habit: 'habit',
      'عادت': 'habit',
      water: 'health',
      'آب': 'health',
      journal: 'journal',
      'روزنگار': 'journal',
      anchor: 'anchor',
      'مناسبت': 'anchor',
      done: 'complete',
      'انجام': 'complete',
      رویداد: 'event',
      ask: 'ask',
      'بپرس': 'ask',
      open: 'open',
      'برو': 'open',
    };
    const kind = kindFor[verb] ?? 'task';
    const one = parseOne(kind, rest, now, notes);
    if (one && /in|درآمد/.test(verb) && one.kind === 'tx') one.txKind = 'in';
    return { intents: one ? [one] : [], lang, notes };
  }

  /* several commands on one line: separated by newline, ; or ؟… no — by ; and ؛ */
  const parts = raw
    .split(/\s*(?:\n|؛|;)\s*/u)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);

  const intents: Intent[] = [];
  for (const part of parts) {
    const one = parseOne(detectKind(norm(part), now), part, now, notes);
    if (one) intents.push(one);
  }
  if (!intents.length) intents.push({ kind: 'ask', question: raw });
  return { intents, lang, notes };
}

/* ============================================================================
   Human-readable preview for the command bar
   ========================================================================== */

const VIEW_LABEL: Record<string, [string, string]> = {
  today: ['امروز', 'Today'],
  tasks: ['کارها', 'Tasks'],
  calendar: ['تقویم', 'Calendar'],
  notes: ['یادداشت‌ها', 'Notes'],
  habits: ['عادت‌ها', 'Habits'],
  money: ['پول و بودجه', 'Money'],
  journal: ['روزنگار', 'Journal'],
  health: ['سلامت', 'Health'],
  focus: ['تمرکز', 'Focus'],
  tools: ['جعبه‌ابزار', 'Tools'],
  settings: ['تنظیمات', 'Settings'],
};

export function describe(i: Intent, lang: 'fa' | 'en' = 'fa'): string {
  const viewLabel = (v: string) => (VIEW_LABEL[v] ? (lang === 'fa' ? VIEW_LABEL[v][0] : VIEW_LABEL[v][1]) : v);
  const locale = lang === 'fa' ? 'fa-IR' : 'en-GB';
  const when = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  const t = (fa: string, en: string) => (lang === 'fa' ? fa : en);
  const money = (v: number) => (lang === 'fa' ? toFaDigits(v.toLocaleString('en-US')) : v.toLocaleString('en-US'));
  switch (i.kind) {
    case 'task': {
      const repeatLabel: Record<string, string> = {
        daily: t('هر روز', 'every day'),
        weekly: t('هفته‌ای', 'weekly'),
        monthly: t('ماهانه', 'monthly'),
        weekdays: t('روزهای کار', 'weekdays'),
      };
      return (
        t('کار', 'Task') +
        `: ${i.title}` +
        (i.due ? t(' · ددلاین ', ' · due ') + when(i.due) : i.remindAt ? t(' · یادآوری ', ' · remind ') + when(i.remindAt) : '') +
        (i.repeat && i.repeat !== 'none' ? t(' · تکرار ', ' · repeats ') + (repeatLabel[i.repeat] ?? i.repeat) : '') +
        (i.notes ? ` · ${i.notes}` : '')
      );
    }
    case 'event':
      return t('رویداد', 'Event') + `: ${i.title} · ${when(i.start)}${i.location ? ` · 📍${i.location}` : ''}`;
    case 'note':
      return t('یادداشت', 'Note') + `: ${i.title}`;
    case 'tx':
      return `${i.txKind === 'in' ? '💰 ' + t('درآمد', 'Income') : '💸 ' + t('خرج', 'Expense')} ${money(i.amount)}${i.category !== 'متفرقه' ? ' · ' + i.category : ''}${i.note ? ' · ' + i.note : ''}`;
    case 'habit':
      return t('عادت', 'Habit') + `: ${i.name} · ${i.target} ${i.unit}`;
    case 'health':
      return (
        { water: t('آب', 'Water') + ` +${i.amount} ${t('لیوان', 'cups')}`, sleep: t('خواب', 'Sleep') + ` ${i.amount}h`, steps: t('قدم', 'Steps') + ` ${i.amount}`, weight: t('وزن', 'Weight') + ` ${i.amount}kg` }[i.field] ?? ''
      );
    case 'journal':
      return t('روزنگار', 'Journal') + (i.mood ? ` · ${'●'.repeat(i.mood)}${'○'.repeat(5 - i.mood)}` : '') + (i.text ? ` · ${i.text.slice(0, 40)}` : '');
    case 'timer':
      return t('تایمر تمرکز', 'Focus timer') + ` ${i.minutes} ${t('دقیقه', 'min')}${i.label ? ` · ${i.label}` : ''}`;
    case 'anchor':
      return (
        t('مناسبت', 'Date to remember') +
        `: ${i.title} · ${lang === 'fa' ? formatJalali(i.date, { year: true }) : formatGregorian(i.date, false)}${i.yearly ? t(' · هر سال تکرار می‌شود', ' · repeats yearly') : ''}`
      );
    case 'complete':
      return t('انجام‌شده کردن', 'Mark done') + `: ${i.query}`;
    case 'open':
      return t('برو به', 'Open') + `: ${viewLabel(i.view)}`;
    case 'ask':
      return t('بپرسم از دستیار', 'Ask the assistant') + `: ${i.question.slice(0, 60)}`;
    default:
      return '';
  }
}

export const INTENT_ICON: Record<Intent['kind'], string> = {
  task: 'tasks',
  event: 'calendar',
  note: 'note',
  tx: 'wallet',
  habit: 'flame',
  health: 'heart',
  journal: 'book',
  timer: 'timer',
  anchor: 'bell',
  complete: 'check',
  open: 'spark',
  ask: 'robot',
};
