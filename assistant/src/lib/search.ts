import { normalizeText } from './date';
import type { AppState } from '../store/store';
import { effectiveDone } from '../store/store';

/* ============================================================================
   One search index over everything: used by ⌘K palette and the search boxes.
   ========================================================================== */

export interface Hit {
  group: string;
  icon: string;
  title: string;
  sub?: string;
  view: string;
  coll?: keyof AppState['collections'];
  id?: string;
  keywords?: string;
  score: number;
}

const VIEWS: { id: string; label: string; labelEn: string; icon: string; keywords: string }[] = [
  { id: 'today', label: 'امروز', labelEn: 'Today', icon: 'spark', keywords: 'home dashboard امروز خانه پیشانی' },
  { id: 'tasks', label: 'کارها', labelEn: 'Tasks', icon: 'tasks', keywords: 'todo کار تسک لیست tasks' },
  { id: 'calendar', label: 'تقویم', labelEn: 'Calendar', icon: 'calendar', keywords: 'تقویم برنامه جلسه calendar' },
  { id: 'notes', label: 'یادداشت‌ها', labelEn: 'Notes', icon: 'note', keywords: 'یادداشت نت notes متن' },
  { id: 'habits', label: 'عادت‌ها', labelEn: 'Habits', icon: 'flame', keywords: 'عادت روتین habit streak' },
  { id: 'money', label: 'پول و بودجه', labelEn: 'Money', icon: 'wallet', keywords: 'پول خرج بودجه مالی money budget' },
  { id: 'journal', label: 'روزنگار', labelEn: 'Journal', icon: 'book', keywords: 'ژورنال روزنگار حال mood journal' },
  { id: 'health', label: 'سلامت', labelEn: 'Health', icon: 'heart', keywords: 'سلامت آب خواب وزن health' },
  { id: 'focus', label: 'تمرکز', labelEn: 'Focus', icon: 'timer', keywords: 'پومودورو تایمر تمرکز focus timer' },
  { id: 'tools', label: 'جعبه‌ابزار', labelEn: 'Tools', icon: 'tools', keywords: 'ابزار ماشین حساب converter tools' },
  { id: 'settings', label: 'تنظیمات', labelEn: 'Settings', icon: 'gear', keywords: 'تنظیمات مدل کلید settings' },
];

export const VIEW_LIST = VIEWS;

function fuzzy(q: string, text: string): number {
  if (!q) return 0;
  const t = normalizeText(text).toLowerCase();
  if (t.includes(q)) return 3 + (t.startsWith(q) ? 1 : 0);
  const words = q.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) if (w.length > 1 && t.includes(w)) s += 1;
  if (!s) {
    // subsequence match
    let i = 0;
    for (const ch of t) if (ch === words[0]?.[i]) i++;
    if (words[0] && i === words[0].length) s = 1;
  }
  return s;
}

export interface CommandDef {
  id: string;
  label: string;
  labelEn: string;
  hint: string;
  icon: string;
  run: string; // 'view:tasks' | 'action:new-task' | 'action:chat' | 'action:theme'
}

export const COMMANDS: CommandDef[] = [
  { id: 'new-task', label: 'کار جدید بساز', labelEn: 'New task', hint: 'کار + عنوان', icon: 'plus', run: 'action:new-task' },
  { id: 'new-note', label: 'یادداشت جدید', labelEn: 'New note', hint: 'یادداشت', icon: 'note', run: 'action:new-note' },
  { id: 'new-event', label: 'رویداد در تقویم', labelEn: 'New event', hint: 'جلسه فردا ساعت ۱۰', icon: 'calendar', run: 'action:new-event' },
  { id: 'new-expense', label: 'ثبت خرج', labelEn: 'Log expense', hint: 'خرج ۲۰۰ هزار', icon: 'wallet', run: 'action:new-expense' },
  { id: 'new-income', label: 'ثبت درآمد', labelEn: 'Log income', hint: 'درآمد …', icon: 'wallet', run: 'action:new-income' },
  { id: 'new-habit', label: 'عادت جدید', labelEn: 'New habit', hint: 'عادت ۲۰ دقیقه مطالعه', icon: 'flame', run: 'action:new-habit' },
  { id: 'water', label: '+۱ لیوان آب', labelEn: 'Log a glass of water', hint: 'سلامت', icon: 'water', run: 'action:water' },
  { id: 'timer', label: 'شروع تایمر تمرکز ۲۵ دقیقه', labelEn: 'Start 25-min focus timer', hint: 'پومودورو', icon: 'timer', run: 'action:timer' },
  { id: 'chat', label: 'گفت‌وگو با دستیار', labelEn: 'Chat with assistant', hint: 'بپرس…', icon: 'robot', run: 'action:chat' },
  { id: 'brief', label: 'گزارش وضعیت من', labelEn: 'Status briefing', hint: 'خلاصهٔ امروز', icon: 'chart', run: 'action:brief' },
  { id: 'theme', label: 'تغییر پوسته (روشن/تاریک)', labelEn: 'Toggle theme', hint: 'نمایش', icon: 'moon', run: 'action:theme' },
  { id: 'export', label: 'پشتیبان‌گیری JSON', labelEn: 'Export data', hint: 'داده‌ها', icon: 'download', run: 'action:export' },
  { id: 'import', label: 'بازگردانی فایل پشتیبان', labelEn: 'Import backup', hint: 'داده‌ها', icon: 'upload', run: 'action:import' },
  { id: 'model', label: 'اتصال مدل زبانی', labelEn: 'Connect a language model', hint: 'تنظیمات', icon: 'bolt', run: 'action:model' },
];

export function search(q: string, state: AppState, limit = 24): Hit[] {
  const query = normalizeText(q).toLowerCase();
  const lang = state.settings.lang;
  const hits: Hit[] = [];
  const add = (h: Omit<Hit, 'score'> & { score?: number }) => hits.push({ score: 0, ...h });

  for (const v of VIEWS) {
    const s = fuzzy(query, lang === 'fa' ? v.label + ' ' + v.keywords : v.labelEn + ' ' + v.keywords);
    if (s > 0) add({ group: lang === 'fa' ? 'مناطق برنامه' : 'Sections', icon: v.icon, title: lang === 'fa' ? v.label : v.labelEn, view: v.id, score: s + 0.4 });
  }
  for (const c of COMMANDS) {
    const s = fuzzy(query, (lang === 'fa' ? c.label + ' ' + c.hint : c.labelEn + ' ' + c.hint) + ' ' + c.id);
    if (s > 0) add({ group: lang === 'fa' ? 'دستورها' : 'Commands', icon: c.icon, title: lang === 'fa' ? c.label : c.labelEn, sub: c.hint, view: c.run, score: s + 0.2 });
  }
  if (query.length < 2) return hits.sort(sortHits).slice(0, limit);

  for (const t of state.collections.tasks) {
    const s = fuzzy(query, t.title + ' ' + t.tags.join(' ') + ' ' + (t.notes ?? ''));
    if (s > 0) add({ group: lang === 'fa' ? 'کارها' : 'Tasks', icon: effectiveDone(t) ? 'check' : 'tasks', title: t.title, sub: t.due ? new Date(t.due).toLocaleString(lang === 'fa' ? 'fa' : 'en') : undefined, view: 'tasks', coll: 'tasks', id: t.id, score: s + (effectiveDone(t) ? -1 : 1) });
  }
  for (const n of state.collections.notes) {
    const s = fuzzy(query, n.title + ' ' + n.body + ' ' + n.tags.join(' '));
    if (s > 0) add({ group: lang === 'fa' ? 'یادداشت‌ها' : 'Notes', icon: 'note', title: n.title, sub: normalizeText(n.body).slice(0, 90), view: 'notes', coll: 'notes', id: n.id, score: s });
  }
  for (const e of state.collections.events) {
    const s = fuzzy(query, e.title + ' ' + (e.location ?? '') + ' ' + e.tags.join(' '));
    if (s > 0) add({ group: lang === 'fa' ? 'تقویم' : 'Calendar', icon: 'calendar', title: e.title, sub: new Date(e.start).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB'), view: 'calendar', coll: 'events', id: e.id, score: s });
  }
  for (const h of state.collections.habits) {
    const s = fuzzy(query, h.name);
    if (s > 0) add({ group: lang === 'fa' ? 'عادت‌ها' : 'Habits', icon: 'flame', title: h.emoji + ' ' + h.name, view: 'habits', coll: 'habits', id: h.id, score: s });
  }
  for (const j of state.collections.journal) {
    const s = fuzzy(query, j.text + ' ' + j.date);
    if (s > 0) add({ group: lang === 'fa' ? 'روزنگار' : 'Journal', icon: 'book', title: j.date + ' · ' + '❤'.repeat(j.mood), sub: j.text.slice(0, 90), view: 'journal', coll: 'journal', id: j.id, score: s });
  }
  for (const x of state.collections.transactions) {
    const s = fuzzy(query, (x.note ?? '') + ' ' + x.category);
    if (s > 0) add({ group: lang === 'fa' ? 'مالی' : 'Money', icon: 'wallet', title: `${x.kind === 'in' ? '+' : '−'} ${x.amount.toLocaleString('en-US')} ${state.settings.currency}`, sub: x.category + (x.note ? ' · ' + x.note : ''), view: 'money', coll: 'transactions', id: x.id, score: s });
  }
  return hits.sort(sortHits).slice(0, limit);
}

function sortHits(a: Hit, b: Hit): number {
  return b.score - a.score;
}

export function defaultHits(state: AppState, lang: 'fa' | 'en'): Hit[] {
  const recent: Hit[] = [
    ...state.collections.notes.slice(0, 3).map((n) => ({
      group: lang === 'fa' ? 'اخیر' : 'Recent',
      icon: 'note',
      title: n.title,
      view: 'notes',
      coll: 'notes' as const,
      id: n.id,
      score: 0,
    })),
    ...state.collections.tasks
      .filter((t) => !effectiveDone(t))
      .slice(0, 4)
      .map((t) => ({ group: lang === 'fa' ? 'کارهای باز' : 'Open', icon: 'tasks', title: t.title, view: 'tasks', coll: 'tasks' as const, id: t.id, score: 0 })),
  ];
  const cmds: Hit[] = COMMANDS.slice(0, 6).map((c) => ({
    group: lang === 'fa' ? 'دستورهای سریع' : 'Quick actions',
    icon: c.icon,
    title: lang === 'fa' ? c.label : c.labelEn,
    sub: c.hint,
    view: c.run,
    score: 0,
  }));
  return [...cmds, ...recent];
}
