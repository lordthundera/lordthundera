import type { LLMConfig, Settings } from '../store/store';
import { dataSnapshot } from './brain';

/* ============================================================================
   Optional connection to any OpenAI-compatible chat-completions endpoint.
   The key lives only in this browser (localStorage) and is sent only to the
   endpoint you type in Settings. Without it, the assistant still works fully
   offline using the local brain.
   ========================================================================== */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(settings: Settings, data: string): string {
  const custom = settings.llm.systemPrompt.trim();
  const base = `You are the user's private personal assistant inside a local-first app.
Reply in the user's language (فارسی if they write Persian, else English). Be concrete, warm, and short (max ~120 words unless asked for detail).
You know their live data below. Use it instead of asking for it. When you propose an action, phrase it as a one-line command they can run, e.g. «ثبت کار: ... فردا ساعت ۹».
Never invent facts about them. If the answer needs the outside world (prices, news, weather), say you have no network access and suggest what to check.
TODAY: ${new Date().toString()}
<data>
${data}
</data>${custom ? `\n\nAdditional instructions from the user:\n${custom}` : ''}`;
  return base;
}

export interface StreamOptions {
  config: LLMConfig;
  settings: Settings;
  messages: ChatTurn[];
  withData: boolean;
  state: Parameters<typeof dataSnapshot>[0];
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const { config, settings, messages, withData, state, signal, onDelta } = opts;
  if (!config.apiKey) throw new Error('API key تنظیم نشده — به تنظیمات → مدل زبانی برو.');
  if (!/^https?:\/\//i.test(config.endpoint)) throw new Error('نشانی endpoint نامعتبر است.');

  const payload = {
    model: config.model,
    temperature: config.temperature,
    stream: true,
    messages: [
      { role: 'system', content: buildSystemPrompt(settings, withData ? dataSnapshot(state) : '') },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 240)}` : ''}`);
  }
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('event-stream') || !res.body) {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? '';
    onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const piece = j.choices?.[0]?.delta?.content ?? '';
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch {
        /* ignore malformed keep-alive lines */
      }
    }
  }
  return full;
}

export async function testConnection(config: LLMConfig): Promise<string> {
  if (!config.apiKey) throw new Error('کلید API خالی است.');
  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping — reply with one word' }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  try {
    const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || 'پاسخ آمد ✓';
  } catch {
    return 'پاسخ آمد ✓';
  }
}
