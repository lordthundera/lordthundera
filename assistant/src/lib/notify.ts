/* Notifications, chimes and the reminder scheduler. */

export type ToastKind = 'info' | 'success' | 'warn' | 'error';
export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  action?: { label: string; run: () => void };
}

let toastSeq = 1;
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(text: string, kind: ToastKind = 'info', action?: Toast['action']): number {
  const id = toastSeq++;
  toasts = [...toasts, { id, text, kind, action }];
  emit();
  setTimeout(() => dismiss(id), action ? 9000 : 5200);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(fn: (t: Toast[]) => void): () => void {
  listeners.add(fn);
  fn([...toasts]);
  return () => listeners.delete(fn);
}

/* ---------------------------------------------------------------- sound */

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

export function chime(kind: 'done' | 'timer' | 'nudge' = 'done') {
  const ac = audio();
  if (!ac) return;
  const notes = kind === 'done' ? [880, 1320] : kind === 'timer' ? [660, 990, 1320] : [520];
  notes.forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.value = 0.0001;
    o.connect(g).connect(ac.destination);
    const t0 = ac.currentTime + i * 0.14;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36);
    o.start(t0);
    o.stop(t0 + 0.4);
  });
}

/* ------------------------------------------------------------ notifications */

export async function ensureNotifyPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }
  return Notification.permission;
}

export function notify(title: string, body?: string, tag?: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag, icon: '/icons/icon-192.png', silent: false });
      setTimeout(() => n.close(), 12000);
      return;
    }
  } catch {
    /* ignore */
  }
  toast(`${title}${body ? ` — ${body}` : ''}`, 'info');
}

/** Speech input for the mic button (Web Speech API, browser-native). */
export interface Recognizer {
  start: () => void;
  stop: () => void;
  readonly listening: boolean;
}

export function createRecognizer(lang: 'fa' | 'en', onResult: (text: string, final: boolean) => void): Recognizer | null {
  type Rec = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start: () => void;
    stop: () => void;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
  };
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let listening = false;
  rec.onresult = (e) => {
    const res = e.results[e.results.length - 1];
    onResult(res[0].transcript, res.isFinal);
  };
  rec.onend = () => {
    listening = false;
  };
  rec.onerror = () => {
    listening = false;
  };
  return {
    get listening() {
      return listening;
    },
    start: () => {
      listening = true;
      try {
        rec.start();
      } catch {
        /* already running */
      }
    },
    stop: () => {
      listening = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

export function speak(text: string, lang: 'fa' | 'en') {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text.replace(/[*#`>-]/g, ' '));
  u.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
  u.rate = lang === 'fa' ? 1 : 1.05;
  const voices = speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang?.toLowerCase().startsWith(lang === 'fa' ? 'fa' : 'en'));
  if (match) u.voice = match;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
