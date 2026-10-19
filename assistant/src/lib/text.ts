import { normalizeText, toFaDigits } from './date';

/* ============================================================================
   Small text/data toolkit used by the Tools lab and the assistant.
   ============================================================================ */

export interface TextStats {
  chars: number;
  charsNoSpace: number;
  words: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  speakingMinutes: number;
  persian: boolean;
}

export function stats(text: string): TextStats {
  const t = text ?? '';
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const sentences = (t.match(/[.!?۔؟]+(?=\s|$)/g) ?? []).length || (t.trim() ? 1 : 0);
  const paragraphs = t.split(/\n{2,}/).filter((p) => p.trim()).length;
  const persian = /[\u0600-\u06FF]/.test(t);
  const wpm = persian ? 180 : 220;
  return {
    chars: t.length,
    charsNoSpace: t.replace(/\s/g, '').length,
    words,
    sentences,
    paragraphs,
    readingMinutes: +(words / (wpm * 1.6)).toFixed(1),
    speakingMinutes: +(words / wpm).toFixed(1),
    persian,
  };
}

const STOP = new Set(
  ('و با که از به در برای این آن ما شما هم یا اگر نه Was the and of to in on for with a is are was were it this that be as at by' +
    ' است هست بود باشد می not برای های را چه اگر چون اما ولی حتى')
    .split(/\s+/),
);

export function keywords(text: string, n = 12): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  const tokens = normalizeText(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_'-]{1,}/gu) ?? [];
  for (const w of tokens) {
    if (w.length < 2 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
}

/** Extractive summarizer: scores sentences by word frequency + position. */
export function summarize(text: string, maxSentences = 4): { summary: string; ratio: number } {
  const sentences = (text.match(/[^.!؟?\n]+[.!؟?\n]+|[^.!؟?\n]+$/g) ?? [text]).map((s) => s.trim()).filter((s) => s.length > 20);
  if (sentences.length <= maxSentences) return { summary: sentences.join(' '), ratio: 1 };
  const freq = new Map<string, number>();
  for (const w of keywords(text, 40)) freq.set(w.word, w.count);
  const scored = sentences.map((s, i) => {
    const words = normalizeText(s).toLowerCase().split(/\s+/);
    const score =
      words.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.max(1, words.length) + (i === 0 ? 0.5 : 0) + (i < 2 ? 0.2 : 0);
    return { s, score, i };
  });
  const picked = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  const summary = picked.join(' ');
  return { summary, ratio: summary.length / Math.max(1, text.length) };
}

export function toBullets(text: string, marker = '•'): string {
  return text
    .split(/\n|(?<=[.!?۔؟])\s+/)
    .map((s) => s.trim().replace(/^[-*•\d.)\s]+/, ''))
    .filter(Boolean)
    .map((s) => `${marker} ${s}`)
    .join('\n');
}

/** Curated Persian half-spacing fixes + Arabic→Persian letters. */
export function polishFa(text: string): string {
  return text
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\S) ،/g, '$1،')
    .replace(/،(?=\S)/g, '، ')
    .replace(/\s+([.!؟:;])/g, '$1')
    .replace(/(^|\s)(می|نمی|بی|پیش|به)\s+(?=(شود|شودم|شوی|شویم|کنم|کنی|کند|کنیم|کنید|کنند|رود|روم|روی|رویم|خواهم|خواهی|خواهد|توانم|توانی|تواند|آید|آیم|گیرم|گیری|گیرد))(?=\S)/gmu, '$1$2\u200C')
    .replace(/(^|\s)(ها|هایی|ام|ات|ش|مان|تان|شان)(?=[\s.,;!?،])/g, '$1$2');
}

export function splitLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim());
}

/* ------------------------------------------------------------ converters */

export function slugify(text: string): string {
  return normalizeText(text)
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function caseConvert(text: string, kind: 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'snake' | 'kebab' | 'constant'): string {
  const words = text.trim().split(/[\s_\-]+/).filter(Boolean);
  switch (kind) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.toLowerCase().replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
    case 'sentence':
      return text.trim().toLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (c) => c.toUpperCase());
    case 'camel':
      return words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
  }
}

export function prettyJson(text: string, indent = 2): string {
  const obj = JSON.parse(text);
  return typeof obj === 'string' && indent === 0 ? JSON.stringify(obj) : JSON.stringify(obj, null, indent);
}

export function b64(text: string, decode = false): string {
  const bytes = new TextEncoder();
  if (decode) return new TextDecoder().decode(Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0)));
  let bin = '';
  for (const b of bytes.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuid(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ------------------------------------------------------------ generators */

export function password(len = 16, opts: { digits?: boolean; symbols?: boolean; upper?: boolean; fa?: boolean } = {}): string {
  const sets = ['abcdefghijkmnopqrstuvwxyz'];
  if (opts.upper !== false) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
  if (opts.digits !== false) sets.push('23456789');
  if (opts.symbols) sets.push('!@#$%^&*()-_=+[]{}<>?');
  if (opts.fa) sets.push('ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی');
  const pool = sets.join('');
  const rnd = new Uint32Array(len);
  crypto.getRandomValues(rnd);
  return [...rnd].map((v) => pool[v % pool.length]).join('');
}

export function passphrase(words = 4): string {
  const bank =
    'ابر باد باران دشت کوه ستاره دریا موج سنگ پرنده درخت سایه نور شب روز باغ کلید پنجره پل کوچه آتش ابریشم بید بلوط پسته تیغ چمن خار زرافshan'.split(' ');
  const safe = bank.filter((w) => w.length > 2 && !w.includes('shan'));
  const rnd = new Uint32Array(words);
  crypto.getRandomValues(rnd);
  return [...rnd].map((v) => safe[v % safe.length]).join('-') + '-' + (10 + (v2(rnd) % 89));
}
function v2(a: Uint32Array): number {
  return a.reduce((x, y) => x + y, 0);
}

/* ------------------------------------------------------------ units */

export const UNIT_GROUPS: Record<string, { unit: string; to: number; label: string }[]> = {
  length: [
    { unit: 'mm', to: 0.001, label: 'میلی‌متر' },
    { unit: 'cm', to: 0.01, label: 'سانتی‌متر' },
    { unit: 'm', to: 1, label: 'متر' },
    { unit: 'km', to: 1000, label: 'کیلومتر' },
    { unit: 'inch', to: 0.0254, label: 'اینچ' },
    { unit: 'ft', to: 0.3048, label: 'فوت' },
    { unit: 'mile', to: 1609.344, label: 'مایل' },
    { unit: 'par', to: 3, label: 'فرسنگ (≈۳ کیلومتر)' },
  ],
  mass: [
    { unit: 'mg', to: 0.000001, label: 'میلی‌گرم' },
    { unit: 'g', to: 0.001, label: 'گرم' },
    { unit: 'kg', to: 1, label: 'کیلوگرم' },
    { unit: 'ton', to: 1000, label: 'تن' },
    { unit: 'lb', to: 0.45359237, label: 'پوند' },
    { unit: 'ounce', to: 0.0283495, label: 'اونس' },
    { unit: 'man', to: 3, label: 'من (≈۳ کیلو)' },
  ],
  time: [
    { unit: 's', to: 1 / 3600, label: 'ثانیه' },
    { unit: 'min', to: 1 / 60, label: 'دقیقه' },
    { unit: 'h', to: 1, label: 'ساعت' },
    { unit: 'day', to: 24, label: 'روز' },
    { unit: 'week', to: 168, label: 'هفته' },
    { unit: 'month', to: 730, label: 'ماه (۳۰ روز)' },
    { unit: 'year', to: 8766, label: 'سال' },
  ],
  data: [
    { unit: 'B', to: 1, label: 'بایت' },
    { unit: 'KB', to: 1024, label: 'کیلوبایت' },
    { unit: 'MB', to: 1024 ** 2, label: 'مگابایت' },
    { unit: 'GB', to: 1024 ** 3, label: 'گیگابایت' },
    { unit: 'TB', to: 1024 ** 4, label: 'ترابایت' },
  ],
  angle: [
    { unit: 'deg', to: 1, label: 'درجه' },
    { unit: 'rad', to: 57.2958, label: 'رادیان' },
    { unit: 'grad', to: 0.9, label: 'گراد' },
  ],
};

export function convertUnit(group: keyof typeof UNIT_GROUPS | string, value: number, from: string, to: string): number {
  const list = UNIT_GROUPS[group] ?? [];
  const a = list.find((x) => x.unit === from)?.to ?? 1;
  const b = list.find((x) => x.unit === to)?.to ?? 1;
  if (group === 'length' || group === 'mass') return (value * a) / b;
  if (group === 'data') return (value * a) / b;
  return (value * a) / b;
}

export function tempConvert(value: number, from: 'C' | 'F' | 'K', to: 'C' | 'F' | 'K'): number {
  const c = from === 'C' ? value : from === 'F' ? ((value - 32) * 5) / 9 : value - 273.15;
  return to === 'C' ? c : to === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
}

export function fmtNum(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const d = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 4;
  return localize(v.toFixed(Math.min(digits || d, 4)));
}
function localize(s: string): string {
  return toFaDigits(s.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1،'));
}
