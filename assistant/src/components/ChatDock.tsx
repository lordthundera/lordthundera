import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useToast } from './ui';
import { uid, useApp, type ChatMsg } from '../store/store';
import { answer as brainAnswer, SUGGESTIONS_EN, SUGGESTIONS_FA } from '../lib/brain';
import { parse } from '../lib/nl';
import { applyAll } from '../lib/apply';
import { buildSystemPrompt, streamChat, type ChatTurn } from '../lib/llm';
import { createRecognizer, speak, type Recognizer } from '../lib/notify';
import { localizeDigits } from '../lib/date';
import { useActions } from './actions';

/* =====================================================================
   The chat dock: offline brain first, optional LLM second, mic + TTS.
   ===================================================================== */

export function ChatDock({ open, seed, onClose }: { open: boolean; seed?: string; onClose: () => void }) {
  const { state, add, patch, remove, dispatch } = useApp();
  const { go } = useActions();
  const push = useToast();
  const lang = state.settings.lang;
  const llm = state.settings.llm;
  const chat = state.collections.chat;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [withData, setWithData] = useState(true);
  const [listening, setListening] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seededRef = useRef<string | undefined>(undefined);

  const suggestions = lang === 'fa' ? SUGGESTIONS_FA : SUGGESTIONS_EN;
  const micSupported = useMemo(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window), []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, open]);

  // auto-answer when something was pushed in from another view
  useEffect(() => {
    if (!open || !seed || seededRef.current === seed) return;
    seededRef.current = seed;
    if (seed.startsWith('cmd:')) {
      dispatch({ type: 'add', coll: 'chat', item: { id: uid(), role: 'system', text: seed.slice(4), ts: new Date().toISOString() } as never });
      return;
    }
    send(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  const pushMsg = (m: Omit<ChatMsg, 'id'>): string => {
    const id = uid();
    add('chat', { ...m, id } as never, 'گفت‌وگو');
    return id;
  };

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    pushMsg({ role: 'user', text: q, ts: new Date().toISOString() });
    setBusy(true);

    /* 1) if the message contains actionable commands, offer to run them */
    const parsed = parse(q, { now: new Date() });
    const actions = parsed.intents.filter((i) => i.kind !== 'ask');
    const local = brainAnswer(q, state);
    if (local.handled && !actions.length) {
      pushMsg({ role: 'assistant', text: local.text, ts: new Date().toISOString() });
      setBusy(false);
      return;
    }

    /* 2) local brain answer + optional action offer */
    if (local.handled) {
      pushMsg({ role: 'assistant', text: local.text, ts: new Date().toISOString() });
    }

    /* 3) model, if connected */
    if (!llm.enabled || !llm.apiKey) {
      if (!local.handled) {
        pushMsg({
          role: 'assistant',
          text:
            lang === 'fa'
              ? `این یکی را بدون اتصال به مدل زبانی نمی‌توانم جواب بدهم. مغز آفلاین من روی داده‌های خودت کار می‌کند (برنامه، کارها، خرج‌ها، عادت‌ها، روزنگار).\n\nاگر می‌خواهی سؤال عمومی هم بپرسی: تنظیمات → مغز برنامه → یک کلید API (OpenAI / OpenRouter / Groq / Ollama) وارد کن — همان لحظه فعال می‌شوم.\n\nتا آن موقع این‌ها را می‌توانم انجام بدهم:\n· «فردا ساعت ۹ جلسه با تیم»\n· «خرج ناهار ۱۵۰ هزار»\n· «برنامه امروز من چیه؟»`
              : `I can’t answer that one without a connected model. My offline brain works on your own data (agenda, tasks, spend, habits, journal).\n\nFor open questions: Settings → Assistant brain → paste an API key (OpenAI / OpenRouter / Groq / Ollama).\n\nMeanwhile I can do:\n· “meeting with team tomorrow 9am”\n· “spent 150 on lunch”\n· “what’s on today?”`,
          ts: new Date().toISOString(),
        });
      }
      setBusy(false);
      return;
    }

    const history: ChatTurn[] = [
      ...chat
        .slice(-10)
        .filter((m) => m.role !== 'system' && !m.error)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
      { role: 'user', content: q },
    ];
    const id = pushMsg({ role: 'assistant', text: '', ts: new Date().toISOString(), pending: true });
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      await streamChat({
        config: llm,
        settings: state.settings,
        messages: history,
        withData,
        state,
        signal: controller.signal,
        onDelta: (piece) => {
          acc += piece;
          patch('chat', id, { text: acc, pending: true } as never);
          logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
        },
      });
      patch('chat', id, { text: acc || (lang === 'fa' ? 'پاسخی نیامد.' : 'No reply came.'), pending: false } as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patch('chat', id, { text: (lang === 'fa' ? 'مدل پاسخ نداد: ' : 'Model error: ') + msg, error: true, pending: false } as never);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const runActions = () => {
    const parsed2 = parse(draft || '', { now: new Date() });
    const acts = parsed2.intents.filter((i) => i.kind !== 'ask');
    if (!acts.length) return;
    const res = applyAll(acts, { add, patch, remove, state, go, startTimer: (m, l) => push('⏱ ' + m + ' ' + (l ?? '')) });
    push(res.lines.join('\n') || '—', 'success');
    setDraft('');
  };

  const toggleMic = () => {
    if (!micSupported) return push(lang === 'fa' ? 'مرورگر شما ورود صوتی ندارد (Chrome/Edge پیشنهاد می‌شود)' : 'No speech input in this browser (try Chrome/Edge)', 'warn');
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = createRecognizer(lang, (txt, final) => {
      setDraft(txt);
      if (final) {
        setListening(false);
        recRef.current?.stop();
      }
    });
    recRef.current = rec;
    if (rec) {
      rec.start();
      setListening(true);
    }
  };

  const pendingActions = useMemo(() => (draft.trim() ? parse(draft, { now: new Date() }).intents.filter((i) => i.kind !== 'ask') : []), [draft]);

  if (!open) return null;

  return (
    <div className="chat-dock" role="dialog" aria-label={lang === 'fa' ? 'دستیار' : 'assistant'}>
      <div className="sheet-head" style={{ padding: '8px 10px 8px 8px' }}>
        <span className="brand-mark" style={{ width: 28, height: 28, borderRadius: 9 }}>
          <Icon name="spark" size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>{lang === 'fa' ? 'دستیار من' : 'My Assistant'}</b>
          <div className="tiny" style={{ marginTop: -2 }}>
            {llm.enabled && llm.apiKey ? `🟢 ${llm.model}` : lang === 'fa' ? '🟡 مغز آفلاین — داده‌های خودت' : '🟡 offline brain · your data'}
          </div>
        </div>
        <span className="spacer" />
        <button
          className={`icon-btn ${withData ? 'on' : ''}`}
          title={lang === 'fa' ? 'استفاده از داده‌هایم برای مدل' : 'share my data with the model'}
          onClick={() => setWithData((v) => !v)}
          disabled={!llm.enabled}
        >
          <Icon name="tasks" size={16} />
        </button>
        <button className="icon-btn" title={lang === 'fa' ? 'پاک‌کردن گفت‌وگو' : 'clear'} onClick={() => chat.forEach((m) => remove('chat', m.id))}>
          <Icon name="reset" size={16} />
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="chat-log" ref={logRef}>
        {!chat.length ? (
          <div className="col" style={{ gap: 8 }}>
            <div className="msg assistant">
              <div className="bubble">
                {(lang === 'fa'
                  ? `سلام${state.settings.name ? ' ' + state.settings.name : ''} 👋\nمن آفلاین هم کار می‌کنم: می‌توانم برایت کار بسازم، یادآوری بگذارم، خرج ثبت کنم، روزت را برنامه‌ریزی کنم و از داده‌هایت گزارش بدهم.\n\nیک مثال: «فردا ساعت ۱۰ ارائه دارم، یادم باشه اسلایدها را بفرستم» — بگو تا انجامش بدهم.`
                  : `Hi${state.settings.name ? ' ' + state.settings.name : ''} 👋\nI work offline too: I can create tasks, set reminders, log spending, plan your day and report on your data.\n\nTry: “presentation tomorrow at 10, remind me to send the slides”.`)}
              </div>
            </div>
            <div className="row tight" style={{ flexWrap: 'wrap' }}>
              {suggestions.map((s) => (
                <button key={s} className="chip clickable" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chat.map((m) =>
          m.role === 'system' ? (
            <div key={m.id} className="tiny center" style={{ padding: '4px 0' }}>
              — {m.text} —
            </div>
          ) : (
            <div key={m.id} className={`msg ${m.role} ${m.error ? 'error' : ''}`}>
              <div className="bubble">
                {m.text || (m.pending ? <span className="typing">
                  <i />
                  <i />
                  <i />
                </span> : '')}
                {m.pending && m.text ? <span style={{ opacity: 0.55 }}>▍</span> : null}
              </div>
              {m.role === 'assistant' && m.text && !m.pending ? (
                <div className="row tight" style={{ opacity: 0.65 }}>
                  <button className="icon-btn" title="speak" onClick={() => speak(m.text, lang)}>
                    <Icon name="speaker" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title="copy"
                    onClick={() => {
                      navigator.clipboard?.writeText(m.text);
                      push('✓', 'success');
                    }}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                  <span className="tiny">{localizeDigits(new Date(m.ts).toLocaleTimeString(lang === 'fa' ? 'en-GB' : 'en-US', { hour: '2-digit', minute: '2-digit' }), lang)}</span>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>

      {pendingActions.length ? (
        <div className="row tight" style={{ padding: '6px 10px', borderTop: '1px dashed var(--line)', background: 'var(--surface-2)' }}>
          <span className="tiny">⚡ {lang === 'fa' ? 'می‌توانم این را انجام بدهم:' : 'I can do this:'}</span>
          {pendingActions.slice(0, 2).map((a, i) => (
            <span key={i} className="chip">
              {a.kind}
            </span>
          ))}
          <span className="spacer" />
          <button className="btn sm primary" onClick={runActions}>
            {lang === 'fa' ? 'ثبت کن' : 'do it'}
          </button>
        </div>
      ) : null}

      <div className="chat-input">
        <button className={`icon-btn ${listening ? 'on danger' : ''}`} onClick={toggleMic} title={lang === 'fa' ? 'شفا بده' : 'dictate'} disabled={!micSupported && false}>
          <Icon name="mic" size={17} />
        </button>
        <textarea
          ref={inputRef}
          className="textarea"
          style={{ minHeight: 40, maxHeight: 140, resize: 'none', padding: '9px 10px' }}
          rows={1}
          value={draft}
          placeholder={lang === 'fa' ? 'بگو… یا کاری را برای ثبت بنویس' : 'Say anything — or ask me to log something'}
          onChange={(e) => {
            setDraft(e.target.value);
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = Math.min(140, e.currentTarget.scrollHeight) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <button className="icon-btn" title="system prompt" onClick={() => setShowPrompt((v) => !v)}>
          <Icon name="gear" size={16} />
        </button>
        <button className="btn primary" style={{ height: 38 }} onClick={() => send(draft)} disabled={busy || !draft.trim()}>
          {busy ? (
            <span
              className="typing"
              onClick={(e) => {
                e.preventDefault();
                abortRef.current?.abort();
              }}
            >
              <i />
              <i />
              <i />
            </span>
          ) : (
            <Icon name="send" size={16} />
          )}
        </button>
      </div>

      {showPrompt ? (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--line)' }} className="col">
          <div className="row between">
            <span className="tiny">{lang === 'fa' ? 'دستور سیستم (این نسخهٔ گفت‌وگو)' : 'System prompt (this chat)'}</span>
            <button className="icon-btn" onClick={() => setShowPrompt(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <textarea className="textarea mono" style={{ minHeight: 90, fontSize: 11.5 }} readOnly value={buildSystemPrompt(state.settings, withData ? '«snapshot داده‌های تو اینجا می‌آید»' : '')} />
          <div className="tiny">{lang === 'fa' ? 'ویرایشش از تنظیمات → مغز برنامه.' : 'Edit it in Settings → Assistant brain.'}</div>
        </div>
      ) : null}
    </div>
  );
}
