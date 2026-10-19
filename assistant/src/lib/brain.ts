import { formatJalali, hhmm, jdOf, localizeDigits, normalizeText, relTime, startOfDay, toFaDigits, ymd, addDays } from './date';
import type { AppState, Habit, Task } from '../store/store';
import { effectiveDone, eventsForDay, habitActive, monthTransactions, streak, tasksForDay } from '../store/store';

/* ============================================================================
   The offline "brain": everything the assistant can answer or decide using
   only your own data — no network, no account.
   ============================================================================ */

const QUOTES_FA = [
  'انگیزه توهم می‌زند، عادت است که کار را تمام می‌کند. یک قدم کوچک، همین الان.',
  'کاری که امروز روی کارت است، فردا بار نیست.',
  'به خودت قول بده، ولی قول را آن‌قدر کوچک کن که نتوانی بشکنی.',
  'تمرکز یعنی «نه» گفتن به ده کار خوب، تا یک کار عالی جا باز کند.',
  'خستگی از کار نمی‌آید، از کار نیمه‌تمام می‌آید. یکی را ببند.',
  'هر شب ده دقیقه برای فردا، هر صبح یک ساعت برای تو.',
  'نظم بیرونی از تصمیم‌های از پیش‌گرفته می‌آید؛ تصمیم‌هایت را بنویس.',
  'اگر کاری بیش از دو دقیقه وقت می‌گیرد، فقط اول دو دقیقه‌اش را شروع کن.',
  'مقایسهٔ خودت با دیروز، نه با دیگران.',
  'یک لیست کوتاه با سه کار، بهتر از صد تا ایده است.',
  'اول مهم، بعد فوری. کار فوری فریاد می‌زند، کار مهم سکوت.',
  'پیشرفت آهسته بهتر از توقف کامل است.',
];

const QUOTES_EN = [
  'Motivation fades; systems finish the job. Take one small step now.',
  'A two-minute start beats a perfect plan.',
  'Short list, three items, real progress.',
  'First important, then urgent.',
  'Compare yourself to yesterday, not to someone else.',
];

export function quote(lang: 'fa' | 'en' = 'fa'): string {
  const bank = lang === 'fa' ? QUOTES_FA : QUOTES_EN;
  const idx = Math.floor(Math.random() * bank.length);
  return bank[idx];
}

export interface BrainAnswer {
  text: string;
  chips?: string[];
  handled: boolean;
}

const T = (lang: 'fa' | 'en', fa: string, en: string) => (lang === 'fa' ? fa : en);

function moneyFmt(v: number, state: AppState): string {
  const cur = state.settings.currency;
  return localizeDigits(Math.round(v).toLocaleString('en-US'), state.settings.lang) + (cur ? ` ${cur}` : '');
}

function openTasks(state: AppState): Task[] {
  return state.collections.tasks.filter((t) => !effectiveDone(t));
}

export function topThree(tasks: Task[]): Task[] {
  const today = startOfDay(new Date());
  return [...tasks]
    .sort((a, b) => {
      const score = (t: Task) => {
        let s = t.priority * 10;
        if (t.due) {
          const d = new Date(t.due);
          if (d < today) s += 60; // overdue
          else if (d < addDays(today, 1)) s += 40;
          else if (d < addDays(today, 3)) s += 20;
        } else s -= 5;
        if (t.subtasks.length && t.subtasks.every((x) => !x.done)) s += 4;
        return s;
      };
      return score(b) - score(a);
    })
    .slice(0, 3);
}

/** The assistant's plan for the day, turned into time blocks from wake time. */
export function planDay(state: AppState): { task: Task; from: string; to: string }[] {
  const [wh, wm] = state.settings.wakeTime.split(':').map(Number);
  let cursor = new Date();
  cursor.setHours(wh || 8, wm || 0, 0, 0);
  if (cursor.getTime() < Date.now()) cursor = new Date(Date.now() + 5 * 60000);
  const blocks: { task: Task; from: string; to: string }[] = [];
  for (const t of topThree(openTasks(state))) {
    const dur = t.priority >= 3 ? 75 : 50;
    const from = new Date(cursor);
    const to = new Date(cursor.getTime() + dur * 60000);
    blocks.push({ task: t, from: hhmm(from), to: hhmm(to) });
    cursor = new Date(to.getTime() + 15 * 60000);
  }
  return blocks;
}

export function briefing(state: AppState): string {
  const lang = state.settings.lang;
  const now = new Date();
  const j = jdOf(now);
  const greeting =
    now.getHours() < 12
      ? T(lang, `صبح بخیر${state.settings.name ? ' ' + state.settings.name : ''}`, 'Good morning')
      : now.getHours() < 18
        ? T(lang, `ظهر بخیر${state.settings.name ? ' ' + state.settings.name : ''}`, 'Good afternoon')
        : T(lang, `شب بخیر${state.settings.name ? ' ' + state.settings.name : ''}`, 'Good evening');

  const lines: string[] = [];
  const dayName = formatJalali(now, { year: false });
  lines.push(`${greeting} · ${dayName} (${T(lang, 'روز', 'day')} ${j.jm}/${j.jd} · ${j.jy})`);

  const open = openTasks(state);
  const todayTasks = tasksForDay(state.collections.tasks, now).filter((t) => !effectiveDone(t));
  const overdue = open.filter((t) => t.due && new Date(t.due) < now);
  const evts = eventsForDay(state.collections.events, now);
  const habitsToday = state.collections.habits.filter((h) => habitActive(h));
  const habitsLeft = habitsToday.filter((h) => (h.log[ymd(now)] ?? 0) < h.target);
  const tx = monthTransactions(state.collections.transactions);
  const spend = tx.filter((t) => t.kind === 'out').reduce((a, b) => a + b.amount, 0);
  const water = state.collections.health.find((h) => h.date === ymd(now))?.water ?? 0;

  lines.push(
    T(lang, '', '') +
      (todayTasks.length
        ? T(
            lang,
            `امروز ${toFaDigits(todayTasks.length)} کار داری`,
            `You have ${todayTasks.length} task${todayTasks.length === 1 ? '' : 's'} today`,
          )
        : T(lang, 'امروز کار زمان‌بندی‌شده‌ای نداری', 'Nothing scheduled for today')) +
      (overdue.length ? T(lang, ` · ${toFaDigits(overdue.length)} عقب‌افتاده ⚠️`, ` · ${overdue.length} overdue ⚠️`) : ''),
  );
  if (evts.length)
    lines.push(
      T(lang, `قرارهای امروز: `, `Today's events: `) +
        evts.map((e) => `${hhmm(new Date(e.start))} ${e.title}`).join(T(lang, '، ', ', ')),
    );
  else lines.push(T(lang, 'تقویم امروز خالیه — وقت آزاده برای کار عمیق.', 'Calendar is clear — good time for deep work.'));
  if (habitsToday.length)
    lines.push(
      habitsLeft.length
        ? T(lang, `${toFaDigits(habitsLeft.length)} عادت برای امروز باقی مونده: `, `${habitsLeft.length} habit(s) left today: `) +
            habitsLeft.map((h) => h.emoji + ' ' + h.name).join(T(lang, '، ', ', '))
        : T(lang, 'همهٔ عادت‌های امروز انجام شد ✅', 'All of today’s habits are done ✅'),
    );
  lines.push(
    T(lang, `آب: ${toFaDigits(water)}/${toFaDigits(state.settings.waterGoal)} لیوان · `, `Water: ${water}/${state.settings.waterGoal} cups · `) +
      T(lang, `خرج این ماه: ${moneyFmt(spend, state)}`, `Spend this month: ${moneyFmt(spend, state)}`),
  );
  const plan = planDay(state);
  if (plan.length)
    lines.push(
      T(lang, '\nپیشنهاد برنامهٔ امروز:', '\nSuggested plan:') +
        '\n' +
        plan.map((p, i) => `${toFaDigits(i + 1)}) ${p.from}–${p.to}  ${p.task.title}`).join('\n'),
    );
  lines.push('💡 ' + quote(lang));
  return lines.filter(Boolean).join('\n');
}

/** Answer a user question offline. Returns handled:false when it needs a model. */
export function answer(question: string, state: AppState): BrainAnswer {
  const lang = state.settings.lang;
  const q = normalizeText(question).toLowerCase();
  const now = new Date();
  const open = openTasks(state);

  const reply = (text: string, chips?: string[]): BrainAnswer => ({ text, chips, handled: true });

  /* agenda */
  if (/(امروز|امشب| امشب|today|امروز چی|برنامه امروز)/.test(q) && /(دارم|چي|چی|برنامه|قرار|agenda|plan|work|کار)/.test(q)) {
    const t = tasksForDay(state.collections.tasks, now).filter((x) => !effectiveDone(x));
    const e = eventsForDay(state.collections.events, now);
    const lines: string[] = [];
    if (e.length) lines.push(T(lang, '📅 قرارها:', '📅 Events:') + '\n' + e.map((x) => `${hhmm(new Date(x.start))} · ${x.title}${x.location ? ` (${x.location})` : ''}`).join('\n'));
    if (t.length) lines.push(T(lang, '✅ کارها:', '✅ Tasks:') + '\n' + t.map((x) => `· ${x.title}${x.priority === 3 ? ' 🔴' : ''}`).join('\n'));
    if (!lines.length) lines.push(T(lang, 'امروز چیزی ثبت نشده. می‌خوای برنامه‌ریزی کنیم؟', 'Nothing logged for today. Want to plan?'));
    return reply(lines.join('\n\n'), [T(lang, 'برنامه فردا', 'tomorrow'), T(lang, 'انگیزه بده', 'motivate me')]);
  }
  if (/(فردا|tomorrow)/.test(q) && /(دارم|چی|برنامه|کار|plan|agenda)/.test(q)) {
    const d = addDays(now, 1);
    const t = tasksForDay(state.collections.tasks, d).filter((x) => !effectiveDone(x));
    const e = eventsForDay(state.collections.events, d);
    return reply(
      `${formatJalali(d)} — ${t.length + e.length === 0 ? T(lang, 'خالی است 🎉', 'is free 🎉') : T(lang, 'این‌ها را داری:', 'you have:')}\n` +
        [...e.map((x) => `📅 ${hhmm(new Date(x.start))} ${x.title}`), ...t.map((x) => `✅ ${x.title}`)].join('\n'),
    );
  }
  if (/(هفته|week)/.test(q) && /(برنامه|agenda|چها|چی|رویداد|دارم)/.test(q)) {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i);
      const t = tasksForDay(state.collections.tasks, d).filter((x) => !effectiveDone(x));
      const e = eventsForDay(state.collections.events, d);
      if (t.length + e.length) out.push(`🗓 ${formatJalali(d, { year: false })}: ${[...e.map((x) => x.title), ...t.map((x) => x.title)].join(T(lang, '، ', ', '))}`);
    }
    return reply(out.length ? out.join('\n') : T(lang, 'هفتهٔ خلوتی در پیش داری.', 'A quiet week ahead.'));
  }

  /* workload */
  if (/(چند|how many|count).{0,20}(کار|task|todo|کار باز|باقی|مونده|left)/.test(q) || /(چه‌قدر|چقدر).{0,15}(کار|کاری| مونده)/.test(q)) {
    const overdue = open.filter((t) => t.due && new Date(t.due) < now).length;
    const today = tasksForDay(state.collections.tasks, now).filter((x) => !effectiveDone(x)).length;
    const done = state.collections.tasks.filter((t) => effectiveDone(t)).length;
    return reply(
      T(lang, '', '') +
        [
          `${T(lang, 'کارهای باز', 'Open tasks')}: ${toFaDigits(open.length)}`,
          `${T(lang, 'برای امروز', 'Due today')}: ${toFaDigits(today)}`,
          `${T(lang, 'عقب‌افتاده', 'Overdue')}: ${toFaDigits(overdue)}`,
          `${T(lang, 'انجام‌شده', 'Completed')}: ${toFaDigits(done)}`,
        ].join('\n'),
      [T(lang, 'سه کار مهم امروز رو بگو', 'give me the top 3')],
    );
  }
  if (/(مهم|اولویت|priority|top|باید اول|از کجا|کجا شروع|شروع کنم|next)/.test(q)) {
    const t = topThree(open);
    if (!t.length) return reply(T(lang, 'لیستت خالیه. اول یک کار ثبت کن.', 'Your list is empty — capture something first.'), [T(lang, 'ثبت کار', 'add task')]);
    return reply(
      T(lang, 'اول این سه تا:\n', 'Start with these three:\n') +
        t.map((x, i) => `${toFaDigits(i + 1)}. ${x.title}${x.due ? ` — ${relTime(x.due, now, lang)}` : ''}`).join('\n'),
      [T(lang, 'برنامه‌ریزی امروز', 'plan my day')],
    );
  }

  /* money */
  if (/(خرج|هزینه|پول|بودجه|درآمد|budget|spend|spent|money|expense|income)/.test(q)) {
    const tx = monthTransactions(state.collections.transactions);
    const out = tx.filter((t) => t.kind === 'out').reduce((a, b) => a + b.amount, 0);
    const inc = tx.filter((t) => t.kind === 'in').reduce((a, b) => a + b.amount, 0);
    const byCat = new Map<string, number>();
    for (const t of tx) if (t.kind === 'out') byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const budget = state.settings.monthBudget;
    return reply(
      [
        T(lang, `این ماه ${moneyFmt(out, state)} خرج کرده‌ای.`, `You spent ${moneyFmt(out, state)} this month.`),
        T(lang, `درآمد ثبت‌شده: ${moneyFmt(inc, state)}`, `Recorded income: ${moneyFmt(inc, state)}`),
        budget ? `${T(lang, 'بودجه: ', 'Budget: ')}${moneyFmt(budget, state)} — ${out > budget ? T(lang, `${moneyFmt(out - budget, state)} بیشتر`, `${moneyFmt(out - budget, state)} over`) : T(lang, `${moneyFmt(budget - out, state)} مانده`, `${moneyFmt(budget - out, state)} left`)}` : '',
        top.length ? T(lang, 'بیشترین خرج‌ها:', 'Top categories:') + '\n' + top.map(([c, v]) => `· ${c}: ${moneyFmt(v, state)}`).join('\n') : '',
      ]
        .filter(Boolean)
        .join('\n'),
      [T(lang, 'ثبت خرج', 'log an expense')],
    );
  }

  /* habits */
  if (/(عادت|habit|زنجیره|streak)/.test(q)) {
    const hs = state.collections.habits;
    if (!hs.length) return reply(T(lang, 'هنوز عادتی نساخته‌ای. بگو مثلاً: «عادت ۲۰ دقیقه مطالعه».', 'No habits yet. Try “habit: read 20 minutes”.'), [T(lang, 'ساختن عادت', 'new habit')]);
    return reply(
      hs
        .map((h: Habit) => {
          const s = streak(h);
          const doneToday = (h.log[ymd(now)] ?? 0) >= h.target;
          return `${h.emoji} ${h.name}: ${T(lang, 'جریان', 'streak')} ${toFaDigits(s.current)} ${T(lang, 'روز', 'days')} · ${doneToday ? T(lang, 'امروز ✅', 'today ✅') : T(lang, 'امروز ⏳', 'today ⏳')}`;
        })
        .join('\n'),
    );
  }

  /* health */
  if (/(آب|خواب|قدم|وزن|water|sleep|steps|weight)/.test(q)) {
    const h = state.collections.health.find((x) => x.date === ymd(now));
    return reply(
      [
        `${T(lang, 'آب امروز', 'Water today')}: ${toFaDigits(h?.water ?? 0)}/${toFaDigits(state.settings.waterGoal)} ${T(lang, 'لیوان', 'cups')}`,
        h?.sleep ? `${T(lang, 'خواب دیروز', 'Sleep')}: ${localizeDigits(String(h.sleep), lang)} ${T(lang, 'ساعت', 'h')}` : '',
        h?.steps ? `${T(lang, 'قدم', 'Steps')}: ${toFaDigits(h.steps.toLocaleString('en-US'))}` : '',
        h?.weight ? `${T(lang, 'وزن', 'Weight')}: ${localizeDigits(String(h.weight), lang)} kg` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      [T(lang, 'آب خوردم +۱ لیوان', 'logged a glass of water')],
    );
  }

  /* mood */
  if (/(حال|روحیه|emode|mod|ژورنال|روزنگار|mood)/.test(q)) {
    const js = state.collections.journal.slice(0, 7);
    if (!js.length) return reply(T(lang, 'هنوز چیزی در روزنگار ننوخته‌ای. یک خط بنویس: «از روزم بنویس …»', 'Your journal is empty. Try “journal: today I …”'), [T(lang, 'نوشتن روزنگار', 'write in journal')]);
    const avg = js.reduce((a, b) => a + b.mood, 0) / js.length;
    const emoji = ['😞', '😕', '😐', '🙂', '😄'][Math.max(0, Math.min(4, Math.round(avg) - 1))];
    return reply(
      T(lang, `میانگین حال ۷ روز اخیر: ${avg.toFixed(1)}/۵ ${emoji}`, `Average mood (last 7 days): ${avg.toFixed(1)}/5 ${emoji}`) +
        '\n' +
        js.map((x) => `· ${x.date}: ${'●'.repeat(x.mood)}${'○'.repeat(5 - x.mood)}`).join('\n'),
    );
  }

  /* planning */
  if (/(برنامه‌ریزی|برنامه ریزی|برنامه‌ام|plan|schedule|روزمو بچین|بچین)/.test(q)) {
    const plan = planDay(state);
    if (!plan.length) return reply(T(lang, 'کار بازی برای امروز نداری. چیزی اضافه کنم؟', 'Nothing open to schedule. Want to add something?'));
    return reply(
      T(lang, 'این چیدمان را پیشنهاد می‌کنم:\n', 'Here’s my suggested plan:\n') +
        plan.map((p, i) => `${toFaDigits(i + 1)}) ${p.from}–${p.to} · ${p.task.title}`).join('\n'),
      [T(lang, 'ثبت در تقویم', 'add to calendar')],
    );
  }

  /* motivation / small talk */
  if (/(انگیزه|motiv|خسته‌ام|بی‌حواس|ناامید|stress|استرس|نگران|آرامش)/.test(q)) {
    const extra = /(خسته|stress|استرس|نگران|anxious)/.test(q)
      ? '\n' + T(lang, 'یک نفس ۴-۷-۸ بکش: ۴ دم، ۷ نگه‌داشتن، ۸ بازدم. سه دور.', 'Try one 4-7-8 breath: inhale 4, hold 7, exhale 8. Three rounds.')
      : '';
    return reply('💡 ' + quote(lang) + extra, [T(lang, 'برنامه امروز', 'plan my day')]);
  }
  if (/^(سلام|درود|hi|hello|hey|صبح بخیر|شب بخیر)/.test(q)) {
    return reply(T(lang, `سلام${state.settings.name ? ' ' + state.settings.name : ''} 👋 ${briefing(state).split('\n')[0]}`, `Hi${state.settings.name ? ' ' + state.settings.name : ''} 👋`));
  }
  if (/(ممنون|مرسی|thanks|thank you|قربان)/.test(q)) return reply(T(lang, 'قربان تو 🙌 کاری داشتی اینجام.', 'Anytime 🙌'), undefined);
  if (/(کمک|help|چی بلدی|چه‌کار|چه کار)/.test(q))
    return reply(
      T(
        lang,
        'بلدم:\n· کار و یادآوری بسازم: «فردا ساعت ۹ جلسه با تیم»\n· خرج و درآمد ثبت کنم: «خرج ناهار ۱۵۰ هزار»\n· یادداشت بنویسم: «یادداشت: ایدهٔ جدید …»\n· عادت و آب و خواب را پیاده کنم\n· تقویم و برنامهٔ روز را بچینم\n· هر سؤالی را (اگر مدل زبانی وصل کنی) جواب بدهم',
        'I can:\n· create tasks/reminders: “tomorrow 9am team meeting”\n· log money: “spent 150k on lunch”\n· write notes\n· track habits, water, sleep\n· plan your day & calendar\n· answer anything else when a language model is connected (Settings → Model)',
      ),
      [T(lang, 'برنامه امروز چیه؟', 'what’s my day?'), T(lang, 'چند کار مونده؟', 'how much is left?')],
    );

  return { handled: false, text: '' };
}

/** A compact snapshot of the user's data, injected into the model prompt. */
export function dataSnapshot(state: AppState): string {
  const now = new Date();
  const t = state.collections.tasks;
  const cut = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s);
  return JSON.stringify(
    {
      today: ymd(now),
      jalali: formatJalali(now),
      name: state.settings.name || undefined,
      openTasks: t
        .filter((x) => !effectiveDone(x))
        .slice(0, 25)
        .map((x) => ({
          title: x.title,
          priority: x.priority,
          due: x.due ? new Date(x.due).toISOString().slice(0, 16) : undefined,
          tags: x.tags,
        })),
      completedLast7: t.filter((x) => x.completedAt && new Date(x.completedAt) > addDays(now, -7)).length,
      eventsNext7: state.collections.events
        .filter((e) => new Date(e.start) > addDays(now, -1) && new Date(e.start) < addDays(now, 7))
        .slice(0, 15)
        .map((e) => ({ title: e.title, start: new Date(e.start).toISOString().slice(0, 16), location: e.location })),
      habitsToday: state.collections.habits.map((h) => ({ name: h.name, done: (h.log[ymd(now)] ?? 0) >= h.target, streak: streak(h).current })),
      thisMonth: (() => {
        const tx = monthTransactions(state.collections.transactions);
        return {
          spent: tx.filter((x) => x.kind === 'out').reduce((a, b) => a + b.amount, 0),
          income: tx.filter((x) => x.kind === 'in').reduce((a, b) => a + b.amount, 0),
          budget: state.settings.monthBudget,
          currency: state.settings.currency,
        };
      })(),
      healthToday: state.collections.health.find((h) => h.date === ymd(now)),
      recentNotes: state.collections.notes.slice(0, 5).map((n) => ({ title: n.title, excerpt: cut(n.body) })),
      journalLast3: state.collections.journal.slice(0, 3).map((j) => ({ date: j.date, mood: j.mood, text: cut(j.text || '', 120) })),
    },
    null,
    1,
  );
}

export const SUGGESTIONS_FA = [
  'برنامهٔ امروز من چیه؟',
  'چند کار مونده؟',
  'خرج این ماه چقدر شد؟',
  'یه انگیزه بده',
  'برنامه‌ریزی امروز',
  'وضعیت عادت‌هام',
];
export const SUGGESTIONS_EN = ['What’s on today?', 'How much is left?', 'My spend this month', 'Motivate me', 'Plan my day', 'Habit streaks'];
