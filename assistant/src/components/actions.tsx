import { createContext, useContext } from 'react';

/* App-level capabilities shared with every view. */

export interface TimerState {
  mode: 'focus' | 'break' | 'idle';
  running: boolean;
  left: number; // seconds
  total: number; // seconds
  label?: string;
  taskId?: string;
  doneToday: number;
}

export interface Actions {
  view: string;
  payload: unknown;
  go: (view: string, payload?: unknown) => void;
  openPalette: (prefill?: string) => void;
  chatOpen: boolean;
  openChat: (prefill?: string) => void;
  ask: (q: string) => void;
  timer: TimerState;
  startTimer: (minutes: number, label?: string, taskId?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  timerSettings: { focus: number; short: number; long: number; autoStart: boolean; sound: boolean };
  setTimerSettings: (p: Partial<Actions['timerSettings']>) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  notifyEnabled: boolean;
  enableNotifications: () => void;
  llmOn: boolean;
}

export const ActionsCtx = createContext<Actions | null>(null);

export function useActions(): Actions {
  const c = useContext(ActionsCtx);
  if (!c) throw new Error('ActionsCtx missing');
  return c;
}
