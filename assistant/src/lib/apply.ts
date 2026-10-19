import type { Intent } from './nl';
import { describe } from './nl';
import { ymd } from './date';
import type { AppState, Coll, HealthLog, JournalEntry, Note, Task, Transaction } from '../store/store';
import { effectiveDone } from '../store/store';
import { chime, toast } from './notify';

/* ============================================================================
   Executes parsed intents against the store. Returns a human summary line.
   ========================================================================== */

export interface ApplyCtx {
  add: <T extends { id?: string }>(coll: Coll, item: T, label?: string) => string;
  patch: (coll: Coll, id: string, patch: Record<string, unknown>, label?: string) => void;
  remove: (coll: Coll, id: string, label?: string) => void;
  state: AppState;
  go: (view: string, payload?: unknown) => void;
  startTimer: (minutes: number, label?: string) => void;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function scoreMatch(query: string, text: string): number {
  const q = tokenize(query);
  const t = text.toLowerCase();
  if (!q.length) return 0;
  let score = t.includes(query.toLowerCase().trim()) ? 3 : 0;
  for (const w of q) if (t.includes(w)) score += 1;
  return score / (q.length + (score > 3 ? 1 : 0));
}

export function findTask(query: string, tasks: Task[]): Task | null {
  const open = tasks.filter((t) => !effectiveDone(t));
  let best: { t: Task; s: number } | null = null;
  for (const t of open) {
    const s = scoreMatch(query, t.title + ' ' + t.tags.join(' ') + ' ' + (t.notes ?? ''));
    if (!best || s > best.s) best = { t, s };
  }
  return best && best.s >= 0.5 ? best.t : null;
}

export function applyIntent(i: Intent, ctx: ApplyCtx): string {
  const { state } = ctx;
  const lang = state.settings.lang;
  switch (i.kind) {
    case 'task': {
      const item: Omit<Task, 'id'> = {
        title: i.title,
        notes: i.notes,
        done: false,
        priority: i.priority,
        tags: i.tags,
        subtasks: [],
        repeat: i.repeat ?? 'none',
        kind: 'task',
        createdAt: new Date().toISOString(),
        source: 'command',
        ...(i.due ? { due: i.due } : {}),
        ...(i.remindAt ? { remindAt: i.remindAt } : {}),
      };
      ctx.add('tasks', item as Task & { id?: string }, 'ثبت کار');
      if (i.remindAt) ctx.go('tasks');
      chime('nudge');
      return '✅ ' + describe(i, lang);
    }
    case 'event': {
      ctx.add(
        'events',
        {
          title: i.title,
          start: i.start,
          end: i.end,
          location: i.location,
          tags: i.tags,
          createdAt: new Date().toISOString(),
        } as never,
        'ثبت رویداد',
      );
      ctx.go('calendar');
      return '🗓 ' + describe(i, lang);
    }
    case 'note': {
      const note: Omit<Note, 'id'> = {
        title: i.title,
        body: i.body,
        tags: i.tags,
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'command',
      };
      ctx.add('notes', note as never, 'ثبت یادداشت');
      ctx.go('notes');
      return '📝 ' + describe(i, lang);
    }
    case 'tx': {
      const tx: Omit<Transaction, 'id'> = {
        kind: i.txKind,
        amount: i.amount,
        category: i.category,
        note: i.note,
        date: i.date || ymd(new Date()),
        createdAt: new Date().toISOString(),
      };
      ctx.add('transactions', tx as never, 'ثبت مالی');
      return '💰 ' + describe(i, lang);
    }
    case 'habit': {
      ctx.add(
        'habits',
        {
          name: i.name,
          emoji: i.emoji ?? '🌱',
          color: '#24b47e',
          unit: i.unit,
          target: i.target,
          days: 'daily',
          log: {},
          createdAt: new Date().toISOString(),
        } as never,
        'ساخت عادت',
      );
      ctx.go('habits');
      return '🔥 ' + describe(i, lang);
    }
    case 'health': {
      const today = i.date || ymd(new Date());
      const existing = state.collections.health.find((h) => h.date === today);
      const upd: HealthLog = {
        date: today,
        water: i.field === 'water' ? (existing?.water ?? 0) + (i.mode === 'add' ? i.amount : i.amount) : existing?.water ?? 0,
        sleep: i.field === 'sleep' ? i.amount : existing?.sleep,
        steps: i.field === 'steps' ? i.amount : existing?.steps,
        weight: i.field === 'weight' ? i.amount : existing?.weight,
      };
      if (existing) ctx.patch('health', existing.date, upd as never, 'ثبت سلامت');
      else ctx.add('health', { ...upd, id: today } as never, 'ثبت سلامت');
      if (i.field === 'water') chime('done');
      return '💧 ' + describe(i, lang);
    }
    case 'journal': {
      const day = i.date || ymd(new Date());
      const existing = state.collections.journal.find((j) => j.date === day);
      const data: Partial<JournalEntry> = {
        date: day,
        mood: i.mood ?? existing?.mood ?? 3,
        energy: i.energy ?? existing?.energy,
        text: i.text ? (existing?.text ? existing.text + '\n\n' + i.text : i.text) : existing?.text ?? '',
        gratitude: existing?.gratitude ?? [],
      };
      if (existing) ctx.patch('journal', existing.id, data as never, 'روزنگار');
      else ctx.add('journal', { ...data, createdAt: new Date().toISOString() } as never, 'روزنگار');
      return '📔 ' + describe(i, lang);
    }
    case 'timer': {
      ctx.startTimer(i.minutes, i.label);
      return '⏱ ' + describe(i, lang);
    }
    case 'anchor': {
      ctx.add('anchors', { title: i.title, date: i.date, yearly: i.yearly } as never, 'مناسبت');
      return '📌 ' + describe(i, lang);
    }
    case 'complete': {
      const t = findTask(i.query, state.collections.tasks);
      if (!t) return '🤔 ' + (lang === 'fa' ? `کاری با این نام پیدا نکرد: «${i.query}»` : `No task matching “${i.query}”`);
      ctx.patch('tasks', t.id, { done: true, completedAt: new Date().toISOString() }, 'انجام کار');
      chime('done');
      return (lang === 'fa' ? '🎉 انجام‌شده: ' : '🎉 Completed: ') + t.title;
    }
    case 'open': {
      ctx.go(i.view);
      return '→ ' + i.view;
    }
    case 'ask':
    default:
      return '❓ ' + i.question;
  }
}

export function applyAll(intents: Intent[], ctx: ApplyCtx): { lines: string[]; asks: string[]; navigations: string[] } {
  const lines: string[] = [];
  const asks: string[] = [];
  const navs: string[] = [];
  const originalGo = ctx.go;
  const wrapped: ApplyCtx = { ...ctx, go: (v, p) => (v === 'chat' ? asks.push('') : navs.push(v), originalGo(v, p)) };
  for (const intent of intents) {
    if (intent.kind === 'ask') {
      asks.push(intent.question);
      lines.push('❓ ' + intent.question);
      continue;
    }
    if (intent.kind === 'open') navs.push(intent.view);
    lines.push(applyIntent(intent, intent.kind === 'open' ? ctx : wrapped));
  }
  return { lines, asks, navigations: navs };
}

/** Convenience: parse-free quick capture used by every view's inline input. */
export function quickTask(ctx: ApplyCtx, title: string, extra: Partial<Task> = {}) {
  ctx.add(
    'tasks',
    {
      title: title.trim(),
      done: false,
      priority: 2,
      tags: [],
      subtasks: [],
      kind: 'task',
      createdAt: new Date().toISOString(),
      ...extra,
    } as never,
    'ثبت کار',
  );
  toast('✅ ' + (ctx.state.settings.lang === 'fa' ? 'کار اضافه شد' : 'Task added'));
}
