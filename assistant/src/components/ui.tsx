import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dismiss, subscribeToasts, toast, type Toast } from '../lib/notify';

/* ============================================================================
   Primitives, icons and hand-drawn SVG charts.
   ========================================================================== */

const PATHS: Record<string, string> = {
  spark: 'M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7.5V12l3 2',
  note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v5h5',
  tasks: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  flame: 'M12 22c4 0 6-2.5 6-6 0-4-3-6-4-9-2 2-3 3-3 5-1 0-2-1-2-3-2 1.5-3 4-3 7 0 3.5 2 6 6 6Z',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2Zm0 0V6a2 2 0 0 1 2-2h11M17 13h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2Zm0 0v14M9 7h7M9 11h5',
  heart: 'M12 20s-7-4.4-7-9.5A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.5C19 15.6 12 20 12 20Z',
  timer: 'M10 2h4M12 14V9M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  tools: 'M14.7 6.3a4 4 0 0 0 5 5L21 12l-9 9-3.5-.5L8 17l-4 4-1-1 4-4-1.5-1.5 3.5-.5 9-9Z',
  gear: 'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.3a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a1.6 1.6 0 0 0-1.5-1H1.3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3 7.9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 8 3.6h.1A1.6 1.6 0 0 0 9 2.1V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm7-3a7 7 0 0 1-14 0M12 19v3',
  speaker: 'M11 5 6 9H3v6h3l5 4Zm4.5 3.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M1 12h2M21 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  close: 'M18 6 6 18M6 6l12 12',
  chevronR: 'm9 18 6-6-6-6',
  chevronL: 'm15 18-6-6 6-6',
  chevronD: 'm6 9 6 6 6-6',
  menu: 'M3 6h18M3 12h18M3 18h18',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  upload: 'M12 21V9m0 0 4 4M12 9 8 13M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2',
  play: 'M7 4.5v15l12-7.5Z',
  pause: 'M8 4h3v16H8Zm5 0h3v16h-3Z',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  bell: 'M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7ZM10.3 21a2 2 0 0 0 3.4 0',
  send: 'M4 12 20 4l-6 16-2-6Z',
  robot: 'M7 11h.01M17 11h.01M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM12 2v3M9 15h6',
  star: 'm12 3 2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.6 6.7 19.4l1.1-6L3.4 9.3l6-.8Z',
  pin: 'M9 3h6l-1 6 4 4H6l4-4ZM12 13v8',
  filter: 'M3 5h18l-7 8v6l-4 2v-8Z',
  flag: 'M5 21V4h13l-2 5 2 5H5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  copy: 'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6Z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  water: 'M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11Z',
  chart: 'M4 20V10M10 20V4m6 16v-7m6 7V8',
};

export function Icon({ name, size = 18, style, className }: { name: keyof typeof PATHS | string; size?: number; style?: React.CSSProperties; className?: string }) {
  const d = PATHS[name] ?? PATHS.spark;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ layout */

export function Card({
  title,
  icon,
  action,
  children,
  flat,
  className = '',
  pad0,
  style,
}: {
  title?: ReactNode;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  flat?: boolean;
  className?: string;
  pad0?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${flat ? 'flat' : ''} ${pad0 ? 'pad-0' : ''} ${className}`} style={style}>
      {(title || action) && (
        <header className="card-head">
          <h3>
            {icon ? <Icon name={icon} size={17} /> : null}
            {title}
          </h3>
          <span className="spacer" />
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chip({ children, className = '', onClick, title, style }: { children: ReactNode; className?: string; onClick?: () => void; title?: string; style?: React.CSSProperties }) {
  return (
    <span className={`chip ${className}`} onClick={onClick} title={title} style={style}>
      {children}
    </span>
  );
}

export function Empty({ icon = '✨', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>
        <b>{title}</b>
        {hint ? <div className="tiny" style={{ marginTop: 4 }}>{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => (e.target === e.currentTarget ? onClose() : undefined)}>
      <div className="sheet" style={width ? { width: `min(${width}px, 100%)` } : undefined} role="dialog" aria-modal="true">
        {title != null && (
          <div className="sheet-head">
            {title}
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="بستن">
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-head" style={{ borderBottom: 0, borderTop: '1px solid var(--line)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      {label ? <span>{label}</span> : null}
      {children}
      {hint ? <span className="tiny">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: 'sm';
}) {
  return (
    <div className="seg" role="tablist" style={size === 'sm' ? { padding: 2 } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          className={value === o.value ? 'on' : ''}
          style={size === 'sm' ? { padding: '3px 9px', fontSize: 12.5 } : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim().replace(/^#/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div className="row tight">
      {value.map((t) => (
        <span key={t} className="chip tag">
          #{t}
          <button className="icon-btn" style={{ width: 16, height: 16 }} onClick={() => onChange(value.filter((x) => x !== t))} aria-label="remove">
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <input
        className="input"
        style={{ maxWidth: 140, padding: '4px 8px' }}
        value={draft}
        placeholder={placeholder ?? '#برچسب'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function Confirm({ text, onYes, children }: { text: string; onYes: () => void; children: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className="icon-btn danger"
      title={armed ? text : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          onYes();
          setArmed(false);
        } else setArmed(true);
      }}
    >
      {armed ? <span className="tiny" style={{ color: 'var(--bad)' }}>{'مطمئنی؟'}</span> : children}
    </button>
  );
}

/* ------------------------------------------------------------------ charts */

export function Donut({ data, size = 132, label }: { data: { label: string; value: number; color: string }[]; size?: number; label?: ReactNode }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="row" style={{ gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
            {data.map((d) => {
              const len = (d.value / total) * c;
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="12"
                  strokeDasharray={`${Math.max(0.001, len - 2)} ${c}`}
                  strokeDashoffset={-off}
                  strokeLinecap="round"
                />
              );
              off += len;
              return el;
            })}
          </g>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{label}</div>
      </div>
      <div className="donut-legend" style={{ minWidth: 0, flex: 1 }}>
        {data.map((d) => (
          <div key={d.label} className="row tight" style={{ justifyContent: 'space-between' }}>
            <span className="row tight" style={{ minWidth: 0 }}>
              <i className="sw" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <b className="tiny nowrap">{Math.round((d.value / total) * 100)}٪</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bars({ values, labels, height = 108 }: { values: number[]; labels?: string[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="bars" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="b"
          title={`${labels?.[i] ?? i + 1}: ${v.toLocaleString('en-US')}`}
          style={{ height: `${Math.max(3, (v / max) * 100)}%`, opacity: 0.35 + 0.65 * (v / max) }}
        >
          {labels?.[i] ? <span>{labels[i]}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Spark({ values, height = 40, color = 'var(--brand)' }: { values: number[]; height?: number; color?: string }) {
  if (values.length < 2) return <div className="tiny muted">—</div>;
  const w = 200;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - ((v - min) / span) * (height - 6) - 3]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={`${d} L ${w} ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}

export function Ring({ progress, size = 118, stroke = 9, children }: { progress: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = size / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringgrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, Math.max(0, progress))} ${c}`}
          style={{ transition: 'stroke-dasharray .4s cubic-bezier(.2,.8,.2,1)' }}
        />
        <defs>
          <linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ toasts */

const ToastCtx = createContext<{ push: typeof toast } | null>(null);
export const useToast = () => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('ToastCtx missing');
  return c.push;
};

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  const push = useMemo(() => toast, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
            <i className="dot" />
            <span style={{ whiteSpace: 'pre-wrap' }}>{t.text}</span>
            {t.action ? (
              <button
                className="btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------- misc */

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, rows = 4) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.max(rows * 22, el.scrollHeight + 2)}px`;
    };
    fit();
    const mo = new MutationObserver(fit);
    mo.observe(el, { attributes: true, attributeFilter: ['value'] });
    el.addEventListener('input', fit);
    return () => {
      mo.disconnect();
      el.removeEventListener('input', fit);
    };
  }, [ref, rows]);
}

export function CopyButton({ text, label = 'کپی' }: { text: string; label?: string }) {
  const push = useToast();
  const [ok, setOk] = useState(false);
  const t = useRef<number | undefined>(undefined);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          window.clearTimeout(t.current);
          t.current = window.setTimeout(() => setOk(false), 1400);
        } catch {
          push('مرورگر اجازهٔ کپی نداد', 'warn');
        }
      }}
    >
      <Icon name={ok ? 'check' : 'copy'} size={14} /> {ok ? 'کپی شد' : label}
    </button>
  );
}

export function Progress({ value, max, label, color }: { value: number; max: number; label?: ReactNode; color?: string }) {
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="col" style={{ gap: 4 }}>
      {label ? (
        <div className="row between tiny">
          <span>{label}</span>
          <span className="mono">{Math.round(p * 100)}٪</span>
        </div>
      ) : null}
      <div className="bar slim">
        <i style={{ width: `${p * 100}%`, background: color ?? 'var(--grad)' }} />
      </div>
    </div>
  );
}
