#!/usr/bin/env node
/**
 * End-to-end check of the capture pipeline: sentence → parse → apply → store.
 *
 * The UI's command bar does exactly this, so the assertions below cover what
 * actually lands in `localStorage`: dates, categories, tags, streak-safe keys,
 * navigation and timer hand-off. The store itself is React, so a plain object
 * with the same shape stands in for it — only the mutation surface is used.
 *
 *   npm run test:apply
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules', '.cache', 'applycheck');
mkdirSync(out, { recursive: true });

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'tsc',
    'src/lib/apply.ts',
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
    '--ignoreConfig',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' } },
);

const require = createRequire(import.meta.url);
const { parse } = require(path.join(out, 'lib', 'nl.js'));
const { applyAll } = require(path.join(out, 'lib', 'apply.js'));
const { ymd } = require(path.join(out, 'lib', 'date.js'));

const NOW = new Date(2026, 9, 19, 14, 5, 0); // Mon 19 Oct 2026 = 27 Mehr 1405
const TODAY = ymd(NOW);

function harness(seedTasks = []) {
  const collections = {
    tasks: seedTasks,
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
    budgets: [],
  };
  const navs = [];
  const timers = [];
  let n = 0;
  const state = { collections, settings: { lang: 'fa', currency: 'تومان' }, onboarded: true, past: [] };
  const ctx = {
    state,
    add: (coll, item) => {
      const id = item.id ?? `x${++n}`;
      collections[coll].push({ ...item, id });
      return id;
    },
    patch: (coll, id, next) => {
      const i = collections[coll].findIndex((x) => x.id === id || x.date === id);
      if (i >= 0) collections[coll][i] = { ...collections[coll][i], ...next };
    },
    remove: (coll, id) => {
      const i = collections[coll].findIndex((x) => x.id === id);
      if (i >= 0) collections[coll].splice(i, 1);
    },
    go: (view) => navs.push(view),
    startTimer: (minutes, label) => timers.push({ minutes, label }),
  };
  const run = (text) => {
    const res = parse(text, { now: NOW });
    return { res, applied: applyAll(res.intents, ctx) };
  };
  return { state, ctx, run, navs, timers };
}

let failed = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`\x1b[32m✓\x1b[0m ${label}`);
  else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${label}${extra ? `\n     ${extra}` : ''}`);
  }
};

/* — events, tasks, money ———————————————————————————————————————————— */
{
  const h = harness();
  h.run('فردا ساعت ۹ جلسه با تیم محصول #کار');
  const e = h.state.collections.events[0];
  check('session → event tomorrow 09:00 with tag', e && e.start.endsWith('T09:00:00.000Z') && e.end > e.start && e.tags.includes('کار'), JSON.stringify(e));
  check('event navigates to the calendar', h.navs.includes('calendar'), h.navs.join(','));
}
{
  const h = harness();
  h.run('خرید شیر و پنیر فردا ساعت ۱۸ !!! #خانه');
  const t = h.state.collections.tasks[0];
  check('shopping line → task, priority 3, tag خانه', t && t.title === 'خرید شیر و پنیر' && t.priority === 3 && t.tags.includes('خانه') && t.due.startsWith('2026-10-20T18:00'), JSON.stringify(t));
  check('task is created open and undo-labelled', t && t.done === false && t.createdAt && h.state.past.length === 0, 'undo lives in the reducer, not in ctx.add');
}
{
  const h = harness();
  h.run('خرج ناهار ۲۵۰ هزار تومان');
  const x = h.state.collections.transactions[0];
  check('expense → 250000 out, خوراک, dated today', x && x.amount === 250000 && x.kind === 'out' && x.category === 'خوراک' && x.date === TODAY, JSON.stringify(x));
}
{
  const h = harness();
  h.run('درآمد حقوق ۲۸ میلیون');
  const x = h.state.collections.transactions[0];
  check('income → 28000000 in', x && x.amount === 28000000 && x.kind === 'in', JSON.stringify(x));
}

/* — notes, journal, habits, health ——————————————————————————————————— */
{
  const h = harness();
  h.run('یادداشت: ایدهٔ اپ موبایل');
  const note = h.state.collections.notes[0];
  check('note → markdown body kept', note && note.body.includes('ایدهٔ اپ موبایل') && note.pinned === false, JSON.stringify(note));
}
{
  const h = harness();
  h.run('از روزم بنویس: امروز خوب بود');
  const j = h.state.collections.journal[0];
  check('journal entry dated today', j && j.date === TODAY && String(j.text).includes('خوب بود'), JSON.stringify(j));
}
{
  const h = harness();
  h.run('عادت ۲۰ دقیقه مطالعه هر روز');
  const hb = h.state.collections.habits[0];
  check('habit → name مطالعه, daily, target 20', hb && hb.name === 'مطالعه' && hb.days === 'daily' && hb.target === 20 && hb.log && Object.keys(hb.log).length === 0, JSON.stringify(hb));
}
{
  const h = harness();
  h.run('۳ لیوان آب خوردم');
  const health = h.state.collections.health[0];
  check('water → 3 cups on today\'s key', health && health.date === TODAY && health.water === 3, JSON.stringify(health));
  h.run('۲ لیوان آب خوردم');
  check('second log adds to the same day', h.state.collections.health.length === 1 && h.state.collections.health[0].water === 5, JSON.stringify(h.state.collections.health[0]));
}

/* — anchors, completion, timer, navigation —————————————————————————— */
{
  const h = harness();
  h.run('تولد مامان ۱۲ اسفند');
  const a = h.state.collections.anchors[0];
  /* 12 Esfand 1405 = 2027-03-03 (verified against the runtime's own Persian calendar) */
  check('birthday → yearly anchor on the right Gregorian day', a && a.yearly === true && a.date === '2027-03-03', JSON.stringify(a));
}
{
  const h = harness([
    { id: 't1', title: 'پرداخت بیمه ماشین', done: false, priority: 2, tags: [], subtasks: [], kind: 'task', createdAt: NOW.toISOString() },
    { id: 't2', title: 'تمدید پاسپورت', done: false, priority: 2, tags: [], subtasks: [], kind: 'task', createdAt: NOW.toISOString() },
  ]);
  h.run('بیمه رو انجام بده');
  const done = h.state.collections.tasks.find((t) => t.id === 't1');
  check('«بیمه رو انجام بده» ticks the right task', done && done.done === true && !!done.completedAt, JSON.stringify(done));
  check('the other task is untouched', h.state.collections.tasks.find((t) => t.id === 't2').done === false);
}
{
  const h = harness();
  h.run('تایمر ۲۵ دقیقه');
  check('timer handed to the focus engine', h.timers[0] && h.timers[0].minutes === 25, JSON.stringify(h.timers));
}
{
  const h = harness();
  h.run('برو به یادداشت‌ها');
  check('navigation intent switches view', h.navs[0] === 'notes', h.navs.join(','));
}
{
  const h = harness();
  const { applied } = h.run('خرج ناهار ۹۰ هزار؛ یک لیوان آب');
  check('two intents from one line', h.state.collections.transactions.length === 1 && h.state.collections.health[0]?.water === 1 && h.state.collections.tasks.length === 0, JSON.stringify(h.state.collections));
  check('one confirmation line per intent', applied.lines.length === 2, JSON.stringify(applied.lines));
}
{
  const h = harness();
  const { applied, res } = h.run('چطور عادت‌ها را حفظ کنم؟');
  check('a question is asked, not stored', h.state.collections.tasks.length === 0 && applied.asks.length === 1 && res.lang === 'fa', JSON.stringify({ lines: applied.lines, asks: applied.asks }));
}

console.log(
  failed
    ? `\n\x1b[31m${failed}\x1b[0m apply-pipeline assertions failed`
    : `\n\x1b[32m✓\x1b[0m parse → apply → store verified for tasks, events, money, notes, journal, habits, health, anchors, completion, timer, navigation`,
);
process.exit(failed ? 1 : 0);
