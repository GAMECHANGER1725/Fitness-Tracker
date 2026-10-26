// AI calls with two providers and the user's own keys (the same ones Fuel Log uses):
//   DeepSeek V4.1 Flash through TokenHarbor (OpenAI-style chat API, free model)
//   Google Gemini (its own generateContent API)
// Copied from Fuel Log's ai.ts without the food-photo parts; keep the two in step.
// Whichever is first in the settings is tried first; when it hits its limit, is busy or rejects the key,
// the same request goes to the other one. Requests go straight from the phone to the provider.

export type Provider = 'deepseek' | 'gemini';
export const PROVIDER_NAME: Record<Provider, string> = { deepseek: 'DeepSeek', gemini: 'Gemini' };

export const AI_MODELS = [{ id: 'deepseek-v4.1-flash:free', label: 'DeepSeek V4.1 Flash', hint: 'Free on TokenHarbor' }];
export const DEFAULT_MODEL = AI_MODELS[0].id;
export const GEMINI_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)', hint: 'Best balance, always up to date' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite', hint: 'Faster, more free uses' },
];
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;
const GEMINI_LITE = 'gemini-flash-lite-latest';
const API = 'https://tokenharbor.ai/v1/chat/completions';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** The AI settings every call needs (Settings has all of these). */
export interface AiConfig {
  aiKey: string;
  aiModel: string;
  geminiKey: string;
  geminiModel: string;
  aiFirst: Provider;
}

/** Just the AI fields, e.g. to keep them through a reset. */
export const aiOf = ({ aiKey, aiModel, geminiKey, geminiModel, aiFirst }: AiConfig): AiConfig => ({ aiKey, aiModel, geminiKey, geminiModel, aiFirst });

export const hasAi = (c: Pick<AiConfig, 'aiKey' | 'geminiKey'>) => !!(c.aiKey.trim() || c.geminiKey.trim());

export interface Attempt {
  provider: Provider;
  key: string;
  model: string;
}

/** The order to try: the first provider, then the other; Gemini also gets one go on Flash-Lite, which has more free uses. */
export function attempts(c: AiConfig): Attempt[] {
  const ds: Attempt[] = c.aiKey.trim() ? [{ provider: 'deepseek', key: c.aiKey.trim(), model: c.aiModel || DEFAULT_MODEL }] : [];
  const gm = c.geminiModel || DEFAULT_GEMINI_MODEL;
  const ge: Attempt[] = c.geminiKey.trim()
    ? [{ provider: 'gemini', key: c.geminiKey.trim(), model: gm }, ...(gm === GEMINI_LITE ? [] : [{ provider: 'gemini' as const, key: c.geminiKey.trim(), model: GEMINI_LITE }])]
    : [];
  return c.aiFirst === 'gemini' ? [...ge, ...ds] : [...ds, ...ge];
}

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface Msg {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}
/** A chat request without the model, which `complete` adds. `json` asks for a JSON-only reply where the provider supports it. */
export interface Body {
  messages: Msg[];
  json?: boolean;
}

/** The model has no schema mode here, so the schema goes in the prompt and the reply is parsed leniently. */
export const jsonRule = (schema: object) => `Reply with ONLY one JSON object, no other text and no code fences, matching this JSON Schema:\n${JSON.stringify(schema)}`;

/** The same request in Gemini's generateContent format: system text becomes the system instruction, images inline data. */
export function toGemini(body: Body) {
  const parts = (content: string | Part[]) =>
    typeof content === 'string'
      ? [{ text: content }]
      : content.map((p) => {
          if (p.type === 'text') return { text: p.text };
          const m = /^data:([^;]+);base64,(.*)$/.exec(p.image_url.url);
          return { inline_data: { mime_type: m?.[1] ?? 'image/jpeg', data: m?.[2] ?? '' } };
        });
  const system = body.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
  return {
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents: body.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: parts(m.content) })),
    ...(body.json ? { generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } } : {}),
  };
}

/** The answer text from a Gemini reply, without its thinking parts. */
export function extractGeminiText(json: unknown): string {
  const ps = (json as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })?.candidates?.[0]?.content?.parts;
  return Array.isArray(ps) ? ps.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim() : '';
}

/** The answer text from a chat completion (the model's thinking comes separately and is ignored). */
export function extractText(json: unknown): string {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  return Array.isArray(c) ? c.map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : '')).join('').trim() : '';
}

/** The JSON object in a reply, even with code fences or a sentence around it. Throws if there is none. */
export function parseJson(text: string): unknown {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON');
  return JSON.parse(text.slice(a, b + 1));
}

export type AiErrorKind = 'no-key' | 'bad-key' | 'rate-limit' | 'busy' | 'offline' | 'blocked' | 'bad-reply' | 'error';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    /** Every provider that was tried, in order (set by `complete`). */
    public tried: Provider[] = [],
  ) {
    super(message);
  }
}

export function errorFromResponse(status: number, body: unknown): AiError {
  const err = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string; code?: string; status?: string } } | null;
  const message = err?.error?.message ?? `HTTP ${status}`;
  // 402 / "insufficient balance" is how a used-up free allowance can come back.
  if (status === 429 || status === 402 || err?.error?.status === 'RESOURCE_EXHAUSTED' || /quota|rate.?limit|insufficient (balance|credit)/i.test(message))
    return new AiError('rate-limit', message);
  if (status >= 500) return new AiError('busy', message);
  if (status === 401 || status === 403 || /api key/i.test(message)) return new AiError('bad-key', message);
  return new AiError('error', message);
}

/** Errors worth trying the other provider for: the next one may well work. */
const switchable = (e: unknown) => e instanceof AiError && (e.kind === 'rate-limit' || e.kind === 'busy' || e.kind === 'bad-key' || e.kind === 'error');

const names = (ps: Provider[]) => [...new Set(ps)].map((p) => PROVIDER_NAME[p]).join(' and ');

/** A message for the user. `backup` adds where to put the other key when only one provider was tried. */
export function friendlyError(e: unknown, backup = true): string {
  const kind = e instanceof AiError ? e.kind : 'error';
  const tried = e instanceof AiError ? [...new Set(e.tried)] : [];
  const who = tried.length ? names(tried) : 'The AI';
  // With only one key, say where the backup goes.
  const tip = backup && tried.length === 1 ? ` Add a ${tried[0] === 'deepseek' ? 'Gemini' : 'TokenHarbor'} key in Profile → AI as a backup.` : '';
  switch (kind) {
    case 'no-key': return 'Add a TokenHarbor (DeepSeek) or Gemini key in Fuel Log or in Profile → AI first.';
    case 'bad-key': return `${tried.length ? PROVIDER_NAME[tried[tried.length - 1]] : 'The AI'} didn’t accept your API key. Check it in Profile → AI (or in Fuel Log).${tip}`;
    case 'rate-limit': return `${tried.length > 1 ? `Both ${who} have` : `${who} has`} hit the limit for now. Try again later.${tip}`;
    case 'busy': return `${who} ${tried.length > 1 ? 'are' : 'is'} busy right now. Try again in a moment.${tip}`;
    case 'offline': return 'You’re offline. AI features need the internet.';
    case 'blocked': return 'The AI gave an empty answer. Try again.';
    case 'bad-reply': return 'The AI’s answer didn’t make sense. Try again.';
    default: return `Something went wrong${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

async function post(url: string, headers: Record<string, string>, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(navigator.onLine === false ? 'offline' : 'error', 'Network error');
  }
  if (!res.ok) {
    let b: unknown = null;
    try {
      b = await res.json();
    } catch {
      /* not JSON */
    }
    throw errorFromResponse(res.status, b);
  }
  return res.json();
}

/** One request to one provider. Returns the answer text. */
export async function call(a: Attempt, body: Body, signal?: AbortSignal): Promise<string> {
  const text =
    a.provider === 'gemini'
      ? extractGeminiText(await post(`${GEMINI_API}/${encodeURIComponent(a.model)}:generateContent`, { 'x-goog-api-key': a.key }, toGemini(body), signal))
      : extractText(await post(API, { Authorization: `Bearer ${a.key}` }, { model: a.model, messages: body.messages }, signal));
  if (!text) throw new AiError('blocked', 'Empty reply');
  return text;
}

/** One chat request, moving on to the next provider when one is out of uses. Returns [answer text, model used]. */
export async function complete(cfg: AiConfig, body: Body, signal?: AbortSignal): Promise<[string, string]> {
  const list = attempts(cfg);
  if (!list.length) throw new AiError('no-key', 'No key');
  const tried: Provider[] = [];
  const badKey = new Set<Provider>();
  let last: unknown;
  for (const a of list) {
    // A rejected Gemini key won't work on Flash-Lite either.
    if (badKey.has(a.provider)) continue;
    tried.push(a.provider);
    try {
      return [await call(a, body, signal), a.model];
    } catch (e) {
      last = e;
      if (!switchable(e)) break;
      if ((e as AiError).kind === 'bad-key') badKey.add(a.provider);
    }
  }
  if (last instanceof AiError) last.tried = tried;
  throw last;
}

/** Check one provider's key on its own, without falling back to the other. */
export async function testKey(provider: Provider, key: string, model: string): Promise<void> {
  if (!key.trim()) throw new AiError('no-key', 'No key', [provider]);
  try {
    await call({ provider, key: key.trim(), model }, { messages: [{ role: 'user', content: 'Reply with OK.' }] });
  } catch (e) {
    // An accepted request with an empty reply still proves the key works.
    if (e instanceof AiError && e.kind === 'blocked') return;
    if (e instanceof AiError) e.tried = [provider];
    throw e;
  }
}
