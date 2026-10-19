# دستیار شخصی · Personal Assistant

یک دستیار شخصی کامل که **با یک کادر پیام همه‌چیز را انجام می‌دهد**: تایپ می‌کنی، جمله‌ات تجزیه می‌شود، کار/یادداشت/جلسه/خرج/عادت ثبت می‌شود. فارسی (راست‌به‌چپ، تقویم جلالی) و انگلیسی، محلی‌اول — هیچ سروری بین تو و داده‌هایت نیست.

Type one sentence in any mix of Persian and English. It is parsed into a task, note, event, expense, habit, health log, timer or navigation — then applied, with undo. Everything lives in `localStorage`; the app works fully offline as a PWA.

## 0. اجرا در ۳ دقیقه · Quick start

**۰.۱ Node لازم است.** در ترمینال بزن `node -v`. اگر عددی ندیدی یا زیر ۲۰ بود، از <https://nodejs.org> نسخهٔ LTS (۲۲) را نصب کن — `npm` هم با آن می‌آید. (روی ویندوز: Node را نصب کن، بعد **Terminal / PowerShell** را دوباره باز کن.)

**۰.۲ کد را بگیر و نصب کن:**

```bash
git clone https://github.com/lordthundera/lordthundera.git
cd lordthundera/assistant
npm install
```

**۰.۳ اجرا کن:**

```bash
npm run dev
```

آخرش آدرسی می‌نویسد → همان را در مرورگر باز کن: **http://localhost:5173** (فارسی، راست‌به‌چپ). برای بستن `Ctrl+C`.

**۰.۴ اولین قدم‌ها داخل اپ:** روی `⌘K` (مک) یا `Ctrl+K` (ویندوز/لینوکس) بزن و این‌ها را یکی‌یکی تایپ کن — هر خط یک فرمان است و قبل از ثبت، پیش‌نمایشش را می‌بینی:

```
خرید شیر و پنیر فردا !!! #خانه
خرج ناهار ۲۵۰ هزار تومان
یادداشت: ایدهٔ اپ موبایل
فردا ساعت ۹ جلسه با تیم محصول
۳ لیوان آب خوردم
تایمر ۲۵ دقیقه
تولد مامان ۱۲ اسفند
برو به یادداشت‌ها
```

بعد از هر فرمان `Enter` بزن؛ اگر اشتباه بود `Ctrl+Z` (یا دکمهٔ «برگشت» در نوار بالا) آخرین کار را برمی‌گرداند. برای دیدن بقیهٔ بخش‌ها از منوی کناری استفاده کن؛ اگر خواستی با دادهٔ واقعی نگاه کنی، در **Settings** دکمهٔ 🎁 «دادهٔ نمونه» همه‌چیز را پر می‌کند.

**۰.۵ روی گوشی:** همان وای‌فای کامپیوتر → اگر آدرس شبکه را در همان خروجی `npm run dev` دیدی (مثلاً `http://192.168.1.20:5173/`) در مرورگر گوشی باز کن. برای نصب به‌صورت اپ: منوی مرورگر → *Add to Home screen* / *Install app*. (میکروفن و نوتیفیکیشن فقط روی `localhost` یا HTTPS کار می‌کنند.)

**۰.۶ بکاپ و انتقال:** تنظیمات ← *خروجی JSON* یک فایل می‌دهد؛ *ورود* همان را برمی‌گرداند. داده‌ها فقط در `localStorage` همان مرورگرند (`pa:v1`)، پس پاک‌کردن دادهٔ مرورگر = پاک‌شدن همه‌چیز. اول خروجی بگیر.

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

`npm test` runs four suites, each a plain node script in `scripts/` with no test framework:

| script | guards |
| --- | --- |
| `test:parser` | 49 sentences → intent assertions (`nl-check.mjs`) |
| `test:jalali` | known Nowruz/Yalda dates, 7 671 days round-tripped, month lengths vs year lengths, cross-checked against the runtime's own Persian calendar (`jalali-check.mjs`) |
| `test:apply` | sentence → parse → apply → store: the row that actually gets written, including navigation and timer hand-off (`apply-check.mjs`) |
| `test:render` | every view mounted with seeded data in fa and en, failing on `NaN` / `undefined` / `Invalid Date` / a crash (`render-check.mjs`) |

Add a case whenever you change a rule in `src/lib/nl.ts` — it is the only layer with real ambiguity.
- `npm run build` type-checks with `strict` + `noUnusedLocals`; `applyIntent` and `describe` must stay in sync with the `Intent` union in `nl.ts`.
- `src/lib/*.ts` must stay free of DOM/React imports so the test harness can compile them on their own.
- Timestamps are stored as ISO strings but always *read* in local time; the parser builds them with `setHours` on a local `Date`, so keep it that way.

## 4. Notes on the stack

React 19 + Vite + TypeScript, no other runtime dependency — styling is one `styles.css`, icons are inline SVG paths in `components/ui.tsx`. The service worker caches the shell and never intercepts cross-origin requests, so a BYO-key model endpoint keeps working. To ship it anywhere, `npm run build` and drop `dist/` on any static host; it must be served over HTTPS (or localhost) for notifications, mic and the service worker.

---

## 5. نسخهٔ تولید و استقرار · Build & deploy

```bash
npm run build      # → dist/ (tsc --noEmit && vite build)
npm run preview    # همان dist را محلی سرو می‌کند: http://localhost:4173
```

`dist/` کاملاً آفلاین و subpath-safe است (assets با مسیر نسبی)، پس هر جایی که بگذاری کار می‌کند:

| مقصد | چطور |
| --- | --- |
| GitHub Pages (پروژه) | `dist/` را در شاخهٔ `gh-pages` (یا `docs/`) بگذار — لازم نیست `base` را عوض کنی، چون `base: './'` تنظیم شده |
| Netlify / Vercel / Cloudflare Pages | پوشهٔ `assistant` را وصل کن، build command `npm run build` و output dir `dist` |
| هر سرور استاتیک / پوشهٔ مشترک | محتوای `dist` را کپی کن؛ همین |
| فقط روی خودت | `dist/index.html` را با مرورگر باز کن می‌شود؛ ولی برای PWA/میکروفن HTTPS لازم است |

## 6. عیب‌یابی · Troubleshooting

| نشانه | کار |
| --- | --- |
| `tsc: not found` یا `vite: not found` | `npm install` را داخل `assistant` اجرا کن (نه ریشهٔ ریپو) |
| `npm run dev` می‌گوید پورت مشغول است | `npm run dev -- --port 5174` |
| صفحه سفید بعد از build | نسخهٔ قدیمیِ `dist`؛ `rm -rf dist && npm run build` |
| میکروفن/نوتیفیکیشن کار نمی‌کند | باید `localhost` یا HTTPS باشد؛ روی IP محلی با HTTP، مرورگر اجازه نمی‌دهد |
| فارسی/اعداد انگلیسی است | Settings ← زبان «فارسی»؛ RTL و اعداد فارسی با آن می‌آید |
| همه‌چیز غیب شده | داده در `localStorage` همان پروفایل مرورگر است؛ با پروفایل/مرورگر دیگر باز کردی. تنظیمات ← بازیابی از فایل JSON |
| می‌خواهی از صفر شروع کنی | Settings ← «پاک‌کردن داده‌ها» (یا DevTools → Application → Local Storage → کلید `pa:v1`) |

تست‌ها (هیچ فریم‌ورکی لازم ندارد): `npm test` یا تک‌تک `npm run test:parser` · `test:jalali` · `test:apply` · `test:render`.
