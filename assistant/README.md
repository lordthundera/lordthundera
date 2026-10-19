# دستیار شخصی · Personal Assistant

یک دستیار شخصی کامل که **با یک کادر پیام همه‌چیز را انجام می‌دهد**: تایپ می‌کنی، جمله‌ات تجزیه می‌شود، کار/یادداشت/جلسه/خرج/عادت ثبت می‌شود. فارسی (راست‌به‌چپ، تقویم جلالی) و انگلیسی، محلی‌اول — هیچ سروری بین تو و داده‌هایت نیست.

Type one sentence in any mix of Persian and English. It is parsed into a task, note, event, expense, habit, health log, timer or navigation — then applied, with undo. Everything lives in `localStorage`; the app works fully offline as a PWA.

```bash
npm install
npm run dev        # http://localhost:5173  (fa, RTL)
npm test           # 49 parser assertions + a Jalali-calendar conformance sweep
npm run build      # tsc --noEmit && vite build
npm run preview    # serve the production bundle
```

---

## 1. The command bar is the app

`⌘K` / `Ctrl+K` (or the pill on Today, or the mic). One line in → one or more intents out. Everything below is what the parser actually understands today; each example is a passing test in [`scripts/nl-check.mjs`](scripts/nl-check.mjs).

| You type | You get |
| --- | --- |
| `فردا ساعت ۹ جلسه با تیم محصول` | event tomorrow 09:00, title «تیم محصول» |
| `یادم باشه جمعه گزارش رو بفرستم` | task + reminder on Friday |
| `خرید هدیهٔ تولد مامان` | task (a birthday *without* a date is a task, not an anchor) |
| `تولد مامان ۱۲ اسفند` | yearly anchor (repeats every year) |
| `خرج ناهار ۲۵۰ هزار تومان` | expense 250 000 → category خوراک |
| `درآمد حقوق ۲۸ میلیون` | income 28 000 000 |
| `یادداشت: ایدهٔ اپ موبایل` | markdown note |
| `عادت ۲۰ دقیقه مطالعه هر روز` | habit «مطالعه», daily, target 20 |
| `۳ لیوان آب خوردم` / `۷ ساعت خوابیدم` / `وزنم ۷۳.۵ کیلو` / `۸۰۰۰ قدم` | health log for today |
| `از روزم بنویس: امروز خوب بود` | journal entry |
| `تایمر ۲۵ دقیقه` / `امشب ۴۵ دقیقه فوکوس` | focus timer, pre-filled and ready to start |
| `گزارش هفتگی فوری !!! #کار` | task, priority 3, tag `کار` |
| `برو به یادداشت‌ها` | navigates to Notes |
| `q2 رو انجام بده` | marks task `q2` done |
| `برنامه امروز من چیه؟` | offline briefing (or the model, if connected) |
| `how many tasks are left?` | English works the same way |

Rules that keep it predictable:

- **Times only come from a real clock pattern** — `ساعت ۹`, `۹:۳۰`, `۶ pm`, `عصر ۵`. A bare `۲۰ دقیقه` is a *duration*, never hour 20.
- **Numbers become money only when they carry a unit** (`تومان`, `هزار`, `میلیون`, `$`); otherwise they stay part of the title.
- **Weekday spellings are normalised** — `پنجشنبه`, `پنج‌شنبه`, `پنج شنبه` are the same day; `next friday` / `جمعه بعد` jump a week.
- **`;` and `؛` split a line into several commands**, up to five at once.
- Slash commands always win: `/task`, `/note`, `/event`, `/money`, `/income`, `/timer`, `/habit`, `/water`, `/ask`, `/open`, `/done`, plus bare `/focus`, `/money`, `/tools`… to jump to a view.

Voice input (Web Speech) uses `fa-IR` or `en-US` from Settings; answers can be read aloud. If you connect an OpenAI-compatible endpoint in Settings, questions that the local brain can't answer are sent with a JSON snapshot of your data; with no key the same questions are answered from local data only.

## 2. Modules

```
src/
  lib/nl.ts        natural-language parser  →  Intent[]  (pure, no DOM)
  lib/apply.ts     Intent → store mutations (undoable), + what the UI can ask back
  lib/brain.ts     offline answers: briefing, counts, streaks, spend, suggestions
  lib/llm.ts       streaming chat with a user-supplied endpoint + data snapshot
  lib/date.ts      Jalali/Gregorian helpers, rel-time, digit localisation
  lib/jalali.ts    bidirectional date conversion + month tables
  lib/md.tsx       small markdown renderer (headings, lists, tasks, code, links)
  lib/search.ts    fuzzy palette: data, views, commands
  lib/notify.ts    notification permission + reminder scheduler
  store/store.tsx  one reducer, localStorage `pa:v1`, undo stack, selectors
  views/           Today · Tasks · Calendar · Notes · Habits · Money · Journal · Health · Focus · Tools · Settings
  components/      CommandSheet (⌘K) · ChatDock · TaskRow · ui primitives · Onboarding
public/            manifest.webmanifest · sw.js · icons
scripts/nl-check.mjs  parser test-suite (npm test)
```

State never leaves the browser: `localStorage` key `pa:v1`, export/import as a single JSON file, plus a demo dataset for a first look.

## 3. Editing safely

- `npm test` guards the parser. Add a case whenever you change a rule in `src/lib/nl.ts` — it is the only layer with real ambiguity.
- `npm run build` type-checks with `strict` + `noUnusedLocals`; `applyIntent` and `describe` must stay in sync with the `Intent` union in `nl.ts`.
- `src/lib/*.ts` must stay free of DOM/React imports so the test harness can compile them on their own.
- Timestamps are stored as ISO strings but always *read* in local time; the parser builds them with `setHours` on a local `Date`, so keep it that way.

## 4. Notes on the stack

React 19 + Vite + TypeScript, no other runtime dependency — styling is one `styles.css`, icons are inline SVG paths in `components/ui.tsx`. The service worker caches the shell and never intercepts cross-origin requests, so a BYO-key model endpoint keeps working. To ship it anywhere, `npm run build` and drop `dist/` on any static host; it must be served over HTTPS (or localhost) for notifications, mic and the service worker.
