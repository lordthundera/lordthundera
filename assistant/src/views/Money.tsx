import { useMemo, useState } from 'react';
import { Bars, Card, Confirm, Donut, Empty, Field, Icon, Progress, Segmented, useToast } from '../components/ui';
import type { Transaction } from '../store/store';
import { useApp } from '../store/store';
import { addMonths, formatJalali, formatJalaliShort, localizeDigits, normalizeText, startOfDay, ymd } from '../lib/date';
import { parse } from '../lib/nl';
import { useActions } from '../components/actions';

/* =====================================================================
   Money — quick ledger, categories, budgets, CSV export.
   ===================================================================== */

const PALETTE = ['#5b8cff', '#24b47e', '#f2a516', '#ef5b6b', '#9b5cff', '#12b8c8', '#ff8fab', '#a3bffa', '#7bd389', '#ffd166'];
const CATEGORIES = ['خوراک', 'حمل‌ونقل', 'قبوض و مسکن', 'سلامت', 'آموزش', 'تفریح و سفر', 'هدیه', 'قسط و مالی', 'درآمد', 'متفرقه'];

export function Money() {
  const { state, add, patch, remove, dispatch } = useApp();
  const push = useToast();
  const { openChat } = useActions();
  const lang = state.settings.lang;
  const cur = state.settings.currency;
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [kind, setKind] = useState<'in' | 'out'>('out');
  const [view, setView] = useState<'list' | 'bycat'>('list');
  const [form, setForm] = useState({ amount: '', category: 'خوراک', note: '', date: ymd(new Date()) });
  const [free, setFree] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const all = state.collections.transactions;
  const monthTx = useMemo(
    () =>
      all
        .filter((t) => {
          const d = new Date(t.date);
          return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
        })
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt))),
    [all, month],
  );

  const income = monthTx.filter((t) => t.kind === 'in').reduce((a, b) => a + b.amount, 0);
  const spend = monthTx.filter((t) => t.kind === 'out').reduce((a, b) => a + b.amount, 0);
  const net = income - spend;
  const budget = state.settings.monthBudget;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dayOfMonth = month.getMonth() === new Date().getMonth() && month.getFullYear() === new Date().getFullYear() ? new Date().getDate() : daysInMonth;

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of monthTx) if (t.kind === 'out') m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTx]);

  const daily = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
        return monthTx.filter((t) => t.kind === 'out' && t.date === ymd(d)).reduce((a, b) => a + b.amount, 0);
      }),
    [monthTx, daysInMonth, month],
  );

  const monthly = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(month, i - 5);
      const spendM = all
        .filter((t) => t.kind === 'out' && new Date(t.date).getMonth() === m.getMonth() && new Date(t.date).getFullYear() === m.getFullYear())
        .reduce((a, b) => a + b.amount, 0);
      return { label: localizeDigits(String(m.getMonth() + 1), lang), value: spendM };
    });
  }, [all, lang, month]);

  const fmt = (v: number) => localizeDigits(Math.round(v).toLocaleString('en-US'), lang) + (cur ? ' ' + cur : '');

  const save = () => {
    const amount = Number(String(form.amount).replace(/[^\d.]/g, ''));
    if (!amount) return push('مبلغ را وارد کن', 'warn');
    add(
      'transactions',
      { kind, amount, category: form.category, note: form.note ? normalizeText(form.note) : undefined, date: form.date, createdAt: new Date().toISOString() } as Transaction & { id?: string },
      'ثبت مالی',
    );
    setForm({ ...form, amount: '', note: '' });
    push(kind === 'out' ? '💸 خرج ثبت شد' : '💰 درآمد ثبت شد', 'success');
  };

  const freeAdd = () => {
    if (!free.trim()) return;
    const { intents } = parse(free, { now: new Date() });
    const money = intents.filter((i) => i.kind === 'tx');
    if (!money.length) {
      push(lang === 'fa' ? 'مبلغی در متنتان پیدا نشد. مثال: «خرج ناهار ۱۵۰ هزار تومان»' : 'No amount found. Try “spent 150 on lunch”.', 'warn');
      return;
    }
    money.forEach((i) => {
      if (i.kind !== 'tx') return;
      add('transactions', { kind: i.txKind, amount: i.amount, category: i.category, note: i.note, date: i.date, createdAt: new Date().toISOString() } as never, 'ثبت مالی');
    });
    setFree('');
    push('💰 ' + money.length + (lang === 'fa' ? ' ردیف ثبت شد' : ' row(s) logged'), 'success');
  };

  const exportCsv = () => {
    const rows = [['date', 'kind', 'amount', 'currency', 'category', 'note'].join(','), ...monthTx.map((t) => [t.date, t.kind, t.amount, cur, t.category, (t.note ?? '').replace(/,/g, '؛')].join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ledger-${ymd(month)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    push('📎 فایل CSV دانلود شد', 'success');
  };

  return (
    <div className="grid fade-in" style={{ gap: 14 }}>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <Card title={<><Icon name="wallet" size={17} /> {lang === 'fa' ? 'ثبت سریع' : 'Quick log'}</>}>
          <div className="col" style={{ gap: 10 }}>
            <Segmented
              value={kind}
              onChange={(v) => {
                setKind(v);
                if (v === 'in' && form.category === 'خوراک') setForm({ ...form, category: 'درآمد' });
                if (v === 'out' && form.category === 'درآمد') setForm({ ...form, category: 'خوراک' });
              }}
              options={[
                { value: 'out', label: '💸 ' + (lang === 'fa' ? 'خرج' : 'Expense') },
                { value: 'in', label: '💰 ' + (lang === 'fa' ? 'درآمد' : 'Income') },
              ]}
            />
            <div className="grid cols-2">
              <Field label={lang === 'fa' ? 'مبلغ' : 'Amount'}>
                <input className="input mono" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="250000" onKeyDown={(e) => e.key === 'Enter' && save()} />
              </Field>
              <Field label={lang === 'fa' ? 'تاریخ' : 'Date'}>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label={lang === 'fa' ? 'دسته' : 'Category'}>
                <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {(kind === 'in' ? ['حقوق', 'فریلنس', 'سرمایه', 'فروش', 'سایر'] : CATEGORIES.filter((c) => c !== 'درآمد')).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={lang === 'fa' ? 'توضیح' : 'Note'}>
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={lang === 'fa' ? 'سوپرمارکت' : 'groceries'} onKeyDown={(e) => e.key === 'Enter' && save()} />
              </Field>
            </div>
            <button className="btn primary block" onClick={save}>
              <Icon name="plus" size={15} /> {lang === 'fa' ? 'ثبت کن' : 'Log it'}
            </button>
            <div className="row tight" style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={free}
                onChange={(e) => setFree(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && freeAdd()}
                placeholder={lang === 'fa' ? 'یا بنویس: «دیروز ۱۲۰ هزار تاکسی دادم»' : 'or type: “paid 120k taxi yesterday”'}
              />
              <button className="btn" onClick={freeAdd}>
                <Icon name="bolt" size={15} />
              </button>
            </div>
          </div>
        </Card>

        <Card title={<><Icon name="chart" size={17} /> {formatJalali(month, { weekday: false })}</>} action={<div className="row tight">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))}><Icon name={lang === 'fa' ? 'chevronR' : 'chevronL'} size={16} /></button>
          <button className="icon-btn" onClick={() => setMonth(startOfDay(new Date()))} title={lang === 'fa' ? 'این ماه' : 'this month'}><Icon name="reset" size={16} /></button>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))}><Icon name={lang === 'fa' ? 'chevronL' : 'chevronR'} size={16} /></button>
        </div>}>
          <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'خرج ماه' : 'Spent'}</span>
              <span className="v" style={{ color: 'var(--bad)' }}>{fmt(spend)}</span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'درآمد' : 'Income'}</span>
              <span className="v" style={{ color: 'var(--ok)' }}>{fmt(income)}</span>
            </div>
            <div className="stat">
              <span className="k">{lang === 'fa' ? 'خالص' : 'Net'}</span>
              <span className="v" style={{ color: net >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{fmt(net)}</span>
            </div>
          </div>

          {budget > 0 ? (
            <div style={{ marginTop: 10 }}>
              <Progress
                value={spend}
                max={budget}
                color={spend > (budget / daysInMonth) * dayOfMonth * 1.15 ? 'linear-gradient(90deg,var(--bad),#ff9fa8)' : 'var(--grad)'}
                label={
                  <span>
                    {lang === 'fa' ? `بودجه: ${fmt(budget)} · ${lang === 'fa' ? 'روز' : 'day'} ${localizeDigits(String(dayOfMonth), lang)}/${localizeDigits(String(daysInMonth), lang)}` : `Budget ${fmt(budget)} · day ${dayOfMonth}/${daysInMonth}`}
                    {spend > 0 ? ` — ${lang === 'fa' ? 'میانگین روزانه' : 'daily avg'} ${fmt(spend / dayOfMonth)}` : ''}
                  </span>
                }
              />
            </div>
          ) : (
            <div className="tiny" style={{ marginTop: 8 }}>
              {lang === 'fa' ? 'برای پیگیری بودجه، مبلغ ماهانه را وارد کن: ' : 'Set a monthly budget: '}
              <input
                className="input"
                style={{ display: 'inline-block', width: 130, padding: '3px 8px' }}
                defaultValue={budget || ''}
                placeholder="0"
                onBlur={(e) => dispatch({ type: 'settings', patch: { monthBudget: Number(e.target.value.replace(/[^\d]/g, '')) || 0 } })}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="tiny" style={{ marginBottom: 4 }}>{lang === 'fa' ? 'روند ۶ ماهه' : '6-month trend'}</div>
            <Bars values={monthly.map((m) => m.value)} labels={monthly.map((m) => m.label)} height={76} />
          </div>
          <div className="row tight" style={{ marginTop: 10 }}>
            <button className="btn sm ghost" onClick={exportCsv}>
              <Icon name="download" size={14} /> CSV
            </button>
            <button className="btn sm ghost" onClick={() => openChat(lang === 'fa' ? `خرج این ماه چقدر شد و کجاها زیاد رفتم؟` : `How much did I spend this month and where did it go?`)}>
              <Icon name="robot" size={14} /> {lang === 'fa' ? 'تحلیل دستیار' : 'ask for analysis'}
            </button>
          </div>
        </Card>
      </div>

      <div className="split">
        <Card
          pad0
          title={
            <>
              <Icon name="tasks" size={17} /> {lang === 'fa' ? 'دفتر این ماه' : 'This month’s ledger'}
              <span className="badge soft">{localizeDigits(String(monthTx.length), lang)}</span>
            </>
          }
          action={
            <div className="row tight">
              <select className="select" style={{ width: 130, padding: '3px 24px' }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="">{lang === 'fa' ? 'همهٔ دسته‌ها' : 'All categories'}</option>
                {byCat.map(([c]) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Segmented
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: lang === 'fa' ? 'فهرست' : 'List' },
                  { value: 'bycat', label: lang === 'fa' ? 'دسته‌ها' : 'Groups' },
                ]}
              />
            </div>
          }
        >
          {!monthTx.length ? (
            <Empty icon="🧾" title={lang === 'fa' ? 'این ماه چیزی ثبت نشده' : 'Nothing logged this month'} hint={lang === 'fa' ? 'از فرم بالا یا نوار فرمان استفاده کن.' : 'Use the form above or the command bar.'} />
          ) : view === 'list' ? (
            <div className="list">
              {monthTx
                .filter((t) => !filterCat || t.category === filterCat)
                .map((t) => (
                  <div key={t.id} className="list-item" style={{ alignItems: 'center' }}>
                    <span className="tick" style={{ background: t.kind === 'in' ? 'color-mix(in oklab,var(--ok) 18%,transparent)' : 'color-mix(in oklab,var(--bad) 14%,transparent)', borderColor: 'transparent', color: t.kind === 'in' ? 'var(--ok)' : 'var(--bad)', fontSize: 11, fontWeight: 800 }}>
                      {t.kind === 'in' ? '↑' : '↓'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row tight">
                        <span className="title" style={{ fontSize: 14 }}>
                          {t.note || t.category}
                        </span>
                        <span className="chip">{t.category}</span>
                      </div>
                      <div className="meta">
                        <span>{formatJalaliShort(t.date)}</span>
                        <span>· {ymd(t.date) === ymd(new Date()) ? (lang === 'fa' ? 'امروز' : 'today') : ''}</span>
                      </div>
                    </div>
                    <b className="mono" style={{ color: t.kind === 'in' ? 'var(--ok)' : 'var(--text)', fontSize: 13.5, whiteSpace: 'nowrap' }}>
                      {t.kind === 'in' ? '+' : '−'} {fmt(t.amount)}
                    </b>
                    <input
                      className="input"
                      style={{ width: 92, padding: '2px 6px', fontSize: 12 }}
                      defaultValue={t.amount}
                      title={lang === 'fa' ? 'ویرایش مبلغ' : 'edit amount'}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(/[^\d.]/g, ''));
                        if (v && v !== t.amount) patch('transactions', t.id, { amount: v }, 'ویرایش مبلغ');
                      }}
                    />
                    <Confirm text={lang === 'fa' ? 'حذف شود؟' : 'Delete?'} onYes={() => remove('transactions', t.id, 'حذف تراکنش')}>
                      <Icon name="trash" size={15} />
                    </Confirm>
                  </div>
                ))}
            </div>
          ) : (
            <div style={{ padding: 14 }}>
              <div className="col" style={{ gap: 8 }}>
                {byCat.map(([cat, val], i) => (
                  <div key={cat} className="row between">
                    <span className="row tight">
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
                      {cat}
                    </span>
                    <div style={{ flex: 1, margin: '0 10px' }}>
                      <div className="bar slim">
                        <i style={{ width: `${(val / (byCat[0]?.[1] || 1)) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                      </div>
                    </div>
                    <b className="mono tiny">{fmt(val)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="col">
          <Card title={lang === 'fa' ? 'سهم دسته‌ها' : 'Where it goes'}>
            {byCat.length ? (
              <Donut
                data={byCat.slice(0, 7).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))}
                label={
                  <div>
                    <div className="tiny">{lang === 'fa' ? 'خرج ماه' : 'spent'}</div>
                    <b style={{ fontSize: 14 }}>{fmt(spend)}</b>
                  </div>
                }
              />
            ) : (
              <div className="tiny">{lang === 'fa' ? 'داده‌ای نیست.' : 'No data yet.'}</div>
            )}
          </Card>
          <Card title={lang === 'fa' ? 'روزهای پرهزینه' : 'Heaviest days'} flat>
            <Bars values={daily} labels={daily.map((_, i) => (i % 5 === 0 ? localizeDigits(String(i + 1), lang) : ''))} height={82} />
            <div className="tiny" style={{ marginTop: 4 }}>
              {lang === 'fa' ? 'میانگین روزانه: ' : 'Daily average: '}
              <b>{fmt(spend / dayOfMonth)}</b> · {lang === 'fa' ? 'تا پایان ماه: ' : 'Left in month: '}
              <b>{fmt(Math.max(0, (budget || spend) - spend))}</b>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
