import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { ymd } from '../lib/date';

/* =====================================================================
   Data model — everything the assistant can manage for you.
   ===================================================================== */

export type ID = string;
export type Lang = 'fa' | 'en';

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export type Priority = 0 | 1 | 2 | 3; // none, low, normal, high

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  done: boolean;
  priority: Priority;
  due?: string; // ISO datetime (deadline)
  remindAt?: string; // ISO datetime (notification)
  notified?: boolean;
  tags: string[];
  projectId?: ID;
  subtasks: Subtask[];
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'weekdays';
  kind: 'task' | 'errand' | 'goal' | 'errand-followup';
  createdAt: string;
  completedAt?: string;
  source?: string;
}

export interface Project {
  id: ID;
  name: string;
  color: string;
  archived?: boolean;
}

export interface Note {
  id: ID;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  source?: string;
}

export interface CalendarEvent {
  id: ID;
  title: string;
  start: string;
  end?: string;
  location?: string;
  notes?: string;
  tags: string[];
  createdAt: string;
}

export interface Habit {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  unit: string; // e.g. "minute", "page", "rep"
  target: number; // per day
  days: 'daily' | 'weekdays' | 'weekend' | number[]; // custom weekdays (0=Sat)
  log: Record<string, number>; // ymd → amount
  createdAt: string;
}

export interface Transaction {
  id: ID;
  kind: 'in' | 'out';
  amount: number;
  category: string;
  note?: string;
  date: string; // ymd
  method?: string;
  createdAt: string;
}

export interface JournalEntry {
  id: ID;
  date: string; // ymd
  mood: number; // 1..5
  energy?: number; // 1..5
  text: string;
  gratitude: string[];
  createdAt: string;
}

export interface HealthLog {
  date: string; // ymd
  water: number; // cups
  sleep?: number; // hours
  steps?: number;
  weight?: number; // kg
}

export interface Anchor {
  id: ID;
  title: string;
  date: string; // ymd (gregorian); for yearly events only month/day matter
  yearly: boolean;
  note?: string;
}

export interface ChatMsg {
  id: ID;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: string;
  pending?: boolean;
  error?: boolean;
}

export interface Snippet {
  id: ID;
  label: string;
  text: string;
  createdAt: string;
}

export interface LLMConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
}

export interface Settings {
  name: string;
  lang: Lang;
  theme: 'auto' | 'light' | 'dark';
  calendar: 'jalali' | 'gregorian';
  wakeTime: string; // HH:MM
  sleepTime: string;
  dailyReview: string; // HH:MM → evening recap nudge ('' = off)
  currency: string;
  monthBudget: number;
  waterGoal: number;
  llm: LLMConfig;
  showDemoData: boolean;
}

export interface Collections {
  tasks: Task[];
  projects: Project[];
  notes: Note[];
  events: CalendarEvent[];
  habits: Habit[];
  transactions: Transaction[];
  journal: JournalEntry[];
  health: HealthLog[];
  anchors: Anchor[];
  chat: ChatMsg[];
  snippets: Snippet[];
}

export type Coll = keyof Collections;

export interface UndoStep {
  label: string;
  collections: Collections;
}

export interface AppState {
  collections: Collections;
  settings: Settings;
  onboarded: boolean;
  past: UndoStep[];
}

export const COLLECTIONS: Coll[] = [
  'tasks',
  'projects',
  'notes',
  'events',
  'habits',
  'transactions',
  'journal',
  'health',
  'anchors',
  'chat',
  'snippets',
];

/* =====================================================================
   Helpers
   ===================================================================== */

export function uid(prefix = ''): string {
  return (
    prefix +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

export const defaultSettings: Settings = {
  name: '',
  lang: 'fa',
  theme: 'auto',
  calendar: 'jalali',
  wakeTime: '07:30',
  sleepTime: '23:30',
  dailyReview: '20:00',
  currency: 'تومان',
  monthBudget: 0,
  waterGoal: 8,
  showDemoData: false,
  llm: {
    enabled: false,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.4,
    systemPrompt: '',
  },
};

export const emptyCollections: Collections = {
  tasks: [],
  projects: [],
  notes: [],
  events: [],
  habits: [],
  transactions: [],
  journal: [],
  health: [],
  anchors: [],
  chat: [],
  snippets: [],
};

const initialState: AppState = {
  collections: structuredClone(emptyCollections),
  settings: structuredClone(defaultSettings),
  onboarded: false,
  past: [],
};

/* =====================================================================
   Actions + reducer (with an undo snapshot stack)
   ===================================================================== */

export type New<T> = Partial<Pick<T & { id: ID }, 'id'>> & Omit<T, 'id'>;

export type Action =
  | { type: 'add'; coll: Coll; item: Record<string, unknown>; label?: string }
  | { type: 'addMany'; coll: Coll; items: Record<string, unknown>[]; label?: string }
  | { type: 'patch'; coll: Coll; id: ID; patch: Record<string, unknown>; label?: string }
  | { type: 'remove'; coll: Coll; id: ID; label?: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'llm'; patch: Partial<LLMConfig> }
  | { type: 'state'; state: AppState }
  | { type: 'seedDemo' }
  | { type: 'clearData' }
  | { type: 'markOnboarded' }
  | { type: 'undo' };

function withId<T extends Record<string, unknown>>(item: T): T & { id: ID } {
  return { ...item, id: (item.id as ID) || uid() };
}

const LABEL: Record<string, string> = {
  add: 'افزودن',
  patch: 'ویرایش',
  remove: 'حذف',
  seedDemo: 'دادهٔ نمونه',
  clearData: 'پاک‌کردن',
  state: 'بازگردانی',
  undo: 'بازگردش',
};

function withHistory(state: AppState, next: AppState, label: string): AppState {
  const past = [...state.past, { label, collections: state.collections }].slice(-25);
  return { ...next, past };
}

function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'add':
    case 'addMany': {
      const items = (action.type === 'add' ? [action.item] : action.items).map(withId);
      const next: AppState = {
        ...state,
        collections: {
          ...state.collections,
          [action.coll]: [...items, ...(state.collections[action.coll] as unknown[])],
        } as Collections,
      };
      return withHistory(state, next, action.label ?? LABEL.add + ' ' + action.coll);
    }
    case 'patch': {
      const list = state.collections[action.coll] as { id: ID }[];
      const next: AppState = {
        ...state,
        collections: {
          ...state.collections,
          [action.coll]: list.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)),
        } as Collections,
      };
      return withHistory(state, next, action.label ?? LABEL.patch + ' ' + action.coll);
    }
    case 'remove': {
      const list = state.collections[action.coll] as { id: ID }[];
      const removed = list.find((x) => x.id === action.id) as { id: ID } | undefined;
      const next: AppState = {
        ...state,
        collections: { ...state.collections, [action.coll]: list.filter((x) => x.id !== action.id) } as Collections,
      };
      return withHistory(state, next, (action.label ?? LABEL.remove + ' ' + action.coll) + (removed ? '' : ' ✓'));
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'llm':
      return { ...state, settings: { ...state.settings, llm: { ...state.settings.llm, ...action.patch } } };
    case 'state':
      return withHistory(state, action.state, LABEL.state);
    case 'markOnboarded':
      return { ...state, onboarded: true };
    case 'clearData':
      return withHistory(
        state,
        { ...state, collections: structuredClone(emptyCollections), settings: { ...state.settings, showDemoData: false } },
        LABEL.clearData,
      );
    case 'seedDemo':
      return withHistory(
        { ...state, onboarded: true, settings: { ...state.settings, showDemoData: true } },
        { ...state, collections: mergeDemo(state.collections), onboarded: true, settings: { ...state.settings, showDemoData: true } },
        LABEL.seedDemo,
      );
    case 'undo': {
      const last = state.past[state.past.length - 1];
      if (!last) return state;
      return { ...state, collections: last.collections, past: state.past.slice(0, -1) };
    }
    default:
      return state;
  }
}

/* =====================================================================
   Demo / seed data — so the assistant has something to work with on day 1
   ===================================================================== */

function mergeDemo(base: Collections): Collections {
  const now = new Date();
  const d = (offset: number, h: number, m = 0) => {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m, 0, 0);
    return x.toISOString();
  };
  const demo: Collections = {
    projects: [
      { id: 'p-work', name: 'کار و پروژه', color: '#5b8cff', archived: false },
      { id: 'p-life', name: 'شخصی و خانواده', color: '#2ec4a6', archived: false },
      { id: 'p-learn', name: 'یادگیری', color: '#c084fc', archived: false },
    ],
    tasks: [
      {
        id: 't1',
        title: 'تحویل گزارش هفتگی به تیم',
        notes: 'خلاصهٔ ۳ اسلایدی + نمودار فروش',
        done: false,
        priority: 3,
        due: d(0, 17),
        tags: ['کار', 'فوری'],
        projectId: 'p-work',
        subtasks: [
          { id: 's1', title: 'جمع‌آوری داده‌ها', done: true },
          { id: 's2', title: 'نوشتن تحلیل', done: false },
        ],
        repeat: 'weekly',
        kind: 'task',
        createdAt: d(-3, 9),
        source: 'demo',
      },
      {
        id: 't2',
        title: '۲۰ صفحه مطالعهٔ کتاب «عادت‌های اتمی»',
        done: false,
        priority: 2,
        due: d(1, 21),
        tags: ['مطالعه'],
        projectId: 'p-learn',
        subtasks: [],
        repeat: 'daily',
        kind: 'goal',
        createdAt: d(-6, 8),
        source: 'demo',
      },
      {
        id: 't3',
        title: 'گرفتن وقت دکتر دندان‌پزشکی',
        done: false,
        priority: 2,
        remindAt: d(2, 10),
        due: d(2, 12),
        tags: ['سلامت'],
        projectId: 'p-life',
        subtasks: [],
        kind: 'errand',
        createdAt: d(-1, 11),
        source: 'demo',
      },
      {
        id: 't4',
        title: 'پاسخ به ایمیل مشتری',
        done: true,
        priority: 1,
        tags: ['کار'],
        projectId: 'p-work',
        subtasks: [],
        kind: 'task',
        createdAt: d(-1, 9),
        completedAt: d(0, 10),
        source: 'demo',
      },
      {
        id: 't5',
        title: 'خرید هدیهٔ تولد مامان',
        done: false,
        priority: 3,
        due: d(4, 20),
        tags: ['خانواده'],
        projectId: 'p-life',
        subtasks: [],
        kind: 'errand',
        createdAt: d(-2, 18),
        source: 'demo',
      },
    ],
    notes: [
      {
        id: 'n1',
        title: 'ایده‌های سه‌شنبه‌شب',
        body:
          '# ایده‌های محصول\n\n- یک **دستیار متنی** که ورودی فارسی/انگلیسی را بفهمد\n- حالت تمرین برای مرور هفته\n- خروجی PDF برای گزارش‌ها\n\n> نکته: اول ساده بساز، بعد بهینه کن.\n\n```js\nconst plan = ideas => ideas.sort(byImpact);\n```',
        tags: ['ایده'],
        pinned: true,
        createdAt: d(-4, 22),
        updatedAt: d(-1, 9),
        source: 'demo',
      },
      {
        id: 'n2',
        title: 'چک‌لیست سفر',
        body: '- [ ] شارژر و پاوربانک\n- [ ] دارو\n- [ ] چاپ بلیط\n- [ ] کیسه لباس کثیف',
        tags: ['سفر', 'چک‌لیست'],
        pinned: false,
        createdAt: d(-9, 14),
        updatedAt: d(-9, 14),
        source: 'demo',
      },
    ],
    events: [
      {
        id: 'e1',
        title: 'جلسهٔ هماهنگی تیم محصول',
        start: d(0, 11),
        end: d(0, 12),
        location: 'گوگل‌میت',
        tags: ['کار'],
        createdAt: d(-2, 9),
      },
      {
        id: 'e2',
        title: 'ورزش — باشگاه',
        start: d(0, 19),
        end: d(0, 20, 15),
        location: 'باشگاه پارس',
        tags: ['سلامت'],
        createdAt: d(-5, 9),
      },
      {
        id: 'e3',
        title: 'شام با دوستان',
        start: d(2, 20, 30),
        end: d(2, 22, 30),
        location: 'کافه نیک',
        tags: ['دوستان'],
        createdAt: d(-1, 12),
      },
    ],
    habits: (() => {
      const log: Record<string, number> = {};
      for (let i = 1; i <= 42; i++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const wd = (day.getDay() + 6) % 7;
        if (i % 7 === 6) continue;
        log[ymd(day)] = wd % 2 === 0 ? 30 : 20;
      }
      const water: Record<string, number> = {};
      for (let i = 0; i <= 20; i++) water[ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))] = 1;
      return [
        {
          id: 'h1',
          name: 'ورزش صبحگاهی',
          emoji: '🏋️',
          color: '#2ec4a6',
          unit: 'دقیقه',
          target: 30,
          days: [0, 1, 2, 3, 4] as number[],
          log,
          createdAt: d(-45, 8),
        },
        {
          id: 'h2',
          name: 'مطالعه',
          emoji: '📚',
          color: '#c084fc',
          unit: 'صفحه',
          target: 20,
          days: 'daily',
          log: water,
          createdAt: d(-30, 8),
        },
      ] as Habit[];
    })(),
    transactions: [
      { id: 'x1', kind: 'in', amount: 28000000, category: 'حقوق', note: 'حقوق ماه', date: ymd(now), createdAt: d(0, 8) },
      { id: 'x2', kind: 'out', amount: 6500000, category: 'اجاره', date: ymd(now), createdAt: d(0, 9) },
      { id: 'x3', kind: 'out', amount: 420000, category: 'خوراک', note: 'سوپرمارکت', date: ymd(now), createdAt: d(0, 12) },
      { id: 'x4', kind: 'out', amount: 180000, category: 'حمل‌ونقل', date: ymd(now), createdAt: d(0, 13) },
      { id: 'x5', kind: 'out', amount: 1250000, category: 'خوراک', note: 'رستوران', date: ymd(new Date(now.getTime() - 86400000 * 2)), createdAt: d(-2, 21) },
      { id: 'x6', kind: 'out', amount: 890000, category: 'سلامت', note: 'داروخانه', date: ymd(new Date(now.getTime() - 86400000 * 5)), createdAt: d(-5, 18) },
    ] as Transaction[],
    journal: [
      {
        id: 'j1',
        date: ymd(new Date(now.getTime() - 86400000)),
        mood: 4,
        energy: 3,
        text: 'روز پرباری بود. تمرکزم روی پروژه خوب بود ولی دیر خوابیدم.',
        gratitude: ['هوای خوب', 'کمک هم‌تیمی‌ها', 'قهوهٔ صبح'],
        createdAt: d(-1, 22),
      },
    ] as JournalEntry[],
    health: [
      { date: ymd(now), water: 3, sleep: 7, steps: 5200, weight: 74.2 },
      { date: ymd(new Date(now.getTime() - 86400000)), water: 7, sleep: 6.5, steps: 8100, weight: 74.5 },
      { date: ymd(new Date(now.getTime() - 86400000 * 2)), water: 6, sleep: 8, steps: 6400, weight: 74.8 },
    ] as HealthLog[],
    anchors: [
      { id: 'a1', title: 'تولد مامان', date: ymd(new Date(now.getFullYear(), new Date().getMonth() + 1, 12)), yearly: true, note: 'گل + کیک' },
      { id: 'a2', title: 'سالگرد دانشگاه', date: ymd(new Date(now.getFullYear(), new Date().getMonth(), 26)), yearly: false },
    ] as Anchor[],
    chat: [],
    snippets: [
      { id: 'sn1', label: 'متن عذرخواهی حرفه‌ای', text: 'با سلام، بابت تأخیر پیش‌آمده پوزش می‌خواهم و امروز تا ساعت ۱۸ جبران می‌کنم.', createdAt: d(-2, 10) },
    ] as Snippet[],
  };
  const out = structuredClone(base) as Collections;
  for (const key of COLLECTIONS) {
    const existing = out[key] as { id: ID }[];
    const ids = new Set(existing.map((x) => x.id));
    const add = (demo[key] as { id: ID }[]).filter((x) => !ids.has(x.id));
    if (add.length) (out[key] as { id: ID }[]).unshift(...add);
  }
  return out;
}

/* =====================================================================
   Persistence
   ===================================================================== */

const KEY = 'pa:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(initialState);
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const collections = { ...structuredClone(emptyCollections), ...(parsed.collections ?? {}) };
    for (const k of COLLECTIONS) if (!Array.isArray(collections[k])) collections[k] = [];
    return {
      collections,
      settings: {
        ...defaultSettings,
        ...(parsed.settings ?? {}),
        llm: { ...defaultSettings.llm, ...(parsed.settings?.llm ?? {}) },
      },
      onboarded: parsed.onboarded ?? false,
      past: [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

function save(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — app keeps working in memory */
  }
}

export function exportBlob(state: AppState): string {
  return JSON.stringify({ app: 'personal-ai-assistant', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function parseImport(raw: string): AppState {
  const p = JSON.parse(raw) as Partial<AppState>;
  if (!p || typeof p !== 'object' || !p.collections) throw new Error('فایل پشتیبان معتبر نیست');
  const collections = { ...structuredClone(emptyCollections), ...p.collections };
  return {
    collections,
    settings: { ...defaultSettings, ...(p.settings ?? {}), llm: { ...defaultSettings.llm, ...(p.settings?.llm ?? {}) } },
    onboarded: true,
    past: [],
  };
}

/* =====================================================================
   Context
   ===================================================================== */

interface Ctx {
  state: AppState;
  stateRef: React.RefObject<AppState>;
  dispatch: (a: Action) => void;
  add: <T extends { id?: ID }>(coll: Coll, item: T, label?: string) => ID;
  patch: (coll: Coll, id: ID, patch: Record<string, unknown>, label?: string) => void;
  remove: (coll: Coll, id: ID, label?: string) => void;
  undo: () => void;
  canUndo: boolean;
  lastUndoLabel: string | null;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, load);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const t = setTimeout(() => save(state), 200);
    return () => clearTimeout(t);
  }, [state]);

  const api = useMemo<Ctx>(
    () => ({
      state,
      stateRef,
      dispatch,
      canUndo: state.past.length > 0,
      lastUndoLabel: state.past.length ? state.past[state.past.length - 1].label : null,
      undo: () => dispatch({ type: 'undo' }),
      add: <T extends { id?: ID }>(coll: Coll, item: T, label?: string): ID => {
        const id = item.id ?? uid();
        dispatch({ type: 'add', coll, item: { ...item, id } as Record<string, unknown>, label });
        return id;
      },
      patch: (coll: Coll, id: ID, patch: Record<string, unknown>, label?: string) => dispatch({ type: 'patch', coll, id, patch, label }),
      remove: (coll: Coll, id: ID, label?: string) => dispatch({ type: 'remove', coll, id, label }),
    }),
    [state],
  );

  return <AppCtx.Provider value={api}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useSettings(): Settings {
  return useApp().state.settings;
}

/* ---------------------------------------------------------------- selectors */

export function isRecurringDoneToday(t: Task): boolean {
  if (!t.repeat || t.repeat === 'none' || !t.done) return false;
  return !!t.completedAt && sameDateString(t.completedAt, new Date().toISOString());
}

function sameDateString(a: string, b: string): boolean {
  return ymd(new Date(a)) === ymd(new Date(b));
}

export function effectiveDone(t: Task): boolean {
  if (!t.repeat || t.repeat === 'none') return t.done;
  if (!t.completedAt) return false;
  const doneDay = new Date(t.completedAt);
  const today = new Date();
  if (ymd(doneDay) === ymd(today)) return true;
  return false; // recurring tasks reset each day
}

export function isOverdue(t: Task): boolean {
  return !effectiveDone(t) && !!t.due && new Date(t.due).getTime() < Date.now() - 60_000;
}

export function isOpen(t: Task): boolean {
  return !effectiveDone(t);
}

export function tasksForDay(tasks: Task[], day: Date): Task[] {
  return tasks.filter((t) => (t.due && sameDateString(t.due, day.toISOString())) || (t.remindAt && sameDateString(t.remindAt, day.toISOString())));
}

export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((e) => sameDateString(e.start, day.toISOString()))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function habitDoneToday(h: Habit, day = new Date()): boolean {
  return (h.log[ymd(day)] ?? 0) >= h.target;
}

export function habitActive(h: Habit, day = new Date()): boolean {
  if (h.days === 'daily') return true;
  if (h.days === 'weekend') return [5, 6].includes((day.getDay() + 1) % 7);
  if (h.days === 'weekdays') return !((day.getDay() + 1) % 6 === 0);
  return h.days.includes((day.getDay() + 1) % 7);
}

export function streak(h: Habit): { current: number; best: number } {
  const today = startOfDaySafe(new Date());
  let current = 0;
  for (let i = 0; i < 400; i++) {
    const day = new Date(today.getTime() - i * 86400000);
    const done = (h.log[ymd(day)] ?? 0) >= h.target;
    if (done) current++;
    else if (i === 0) continue; // today still open
    else break;
  }
  // best = longest run over the last 400 days
  let best = 0;
  let run = 0;
  for (let i = 400; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86400000);
    if ((h.log[ymd(day)] ?? 0) >= h.target) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  return { current, best: Math.max(best, current) };
}

function startOfDaySafe(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function monthTransactions(txs: Transaction[], ref = new Date()): Transaction[] {
  return txs.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  });
}
