// AI router: one feature, an ordered list of models to try. Entries are 'groq:<model>' (Groq,
// fast, free tier with tight per-minute limits) or 'gemini' (our Gemini helper, which has its
// own list of backup models). A model that is busy, too slow, out of quota or returns
// unreadable JSON is skipped and the next one is tried. Chosen from the 26–27 Oct 2026
// comparison: Groq GPT-OSS 120B for chat and notes, Gemini for photos, voice and meals.
// Keys come from secrets (GROQ_API_KEY, GEMINI_API_KEY) and never reach the app.
import { generateJson, recordTokens, type Part } from './gemini.ts';
import { HttpError } from './http.ts';

const GROQ = 'https://api.groq.com/openai/v1/chat/completions';

/** Fast text answers (chat, notes, summaries): Groq first, Gemini as the safety net. */
export const TEXT_CHAIN = ['groq:openai/gpt-oss-120b', 'groq:qwen/qwen3.8-27b', 'gemini'];

/** Kannada text: Qwen writes poor Kannada, so GPT-OSS 120B then Gemini. */
export const KANNADA_CHAIN = ['groq:openai/gpt-oss-120b', 'gemini'];

/** Groq models skipped until this time after a limit or failure (per running server). */
const restUntil = new Map<string, number>();

type Schema = Record<string, unknown>;

/**
 * Our schemas (Gemini style) as a strict JSON Schema for Groq structured outputs: lower-case
 * types, every property required and no extra properties (Groq strict-mode rules).
 */
function strictSchema(schema: Schema): Schema {
  const out: Schema = { ...schema };
  if (typeof out.type === 'string') out.type = out.type.toLowerCase();
  if (out.properties && typeof out.properties === 'object') {
    const props = Object.fromEntries(
      Object.entries(out.properties as Record<string, Schema>).map(([k, v]) => [
        k,
        strictSchema(v),
      ]),
    );
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (out.items && typeof out.items === 'object') out.items = strictSchema(out.items as Schema);
  return out;
}

/** Reasoning settings per Groq model: little thinking = fast answers (Groq reasoning docs). */
const REASONING: Record<string, Schema> = {
  'openai/gpt-oss-120b': { reasoning_effort: 'low', include_reasoning: false },
  'qwen/qwen3.8-27b': { reasoning_effort: 'none' },
};

async function groq(
  model: string,
  opts: { system: string; parts: Part[]; schema: Record<string, unknown>; maxTokens: number },
  feature: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return null;
  const images = opts.parts.flatMap((p) =>
    'inline_data' in p
      ? [
          {
            type: 'image_url',
            image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` },
          },
        ]
      : [],
  );
  const text = opts.parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n');
  const res = await fetch(GROQ, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    // Groq docs: structured outputs (strict JSON Schema), max_completion_tokens, default
    // temperature for reasoning models, reasoning effort per model.
    body: JSON.stringify({
      model,
      max_completion_tokens: opts.maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: feature.replace(/[^a-z0-9_-]/gi, '_'),
          strict: true,
          schema: strictSchema(opts.schema),
        },
      },
      ...(REASONING[model] ?? {}),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: images.length ? [...images, { type: 'text', text }] : text },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  if (!res) {
    restUntil.set(model, Date.now() + 60_000);
    return null;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 429 = per-minute/day limit (wait as long as Groq says); 5xx = busy; 400 = the answer
    // didn't fit the schema – the next model is tried.
    console.error('Groq', model, res.status, String(body?.error?.message ?? '').slice(0, 160));
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after'));
      restUntil.set(model, Date.now() + (wait > 0 ? Math.min(wait, 3600) * 1000 : 60_000));
    } else if (res.status >= 500) {
      restUntil.set(model, Date.now() + 60_000);
    }
    return null;
  }
  const u = body?.usage ?? {};
  await recordTokens(feature, `groq:${model}`, {
    promptTokenCount: u.prompt_tokens ?? 0,
    candidatesTokenCount: u.completion_tokens ?? 0,
    totalTokenCount: u.total_tokens ?? 0,
  });
  const out = String(body?.choices?.[0]?.message?.content ?? '').replace(
    /^```(?:json)?\s*|\s*```$/g,
    '',
  );
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/**
 * Try each model in `chain` until one gives JSON that passes `accept` (usually a zod check).
 * Returns the answer and which model gave it.
 */
export async function generateJsonVia<T>(opts: {
  chain: string[];
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  feature: string;
  accept: (json: unknown) => T | null;
  /** Upper bound on the answer length for Groq (its free tier limits tokens per minute). */
  maxTokens?: number;
  timeoutMs?: number;
  /** Total time for the Gemini fallback (default 40 s). */
  budgetMs?: number;
}): Promise<{ data: T; model: string }> {
  let lastError: unknown = null;
  for (const entry of opts.chain) {
    if (entry === 'gemini') {
      try {
        const json = await generateJson({
          system: opts.system,
          parts: opts.parts,
          schema: opts.schema,
          feature: opts.feature,
          timeoutMs: opts.timeoutMs ?? 20_000,
          budgetMs: opts.budgetMs ?? 40_000,
          preferLite: true,
        });
        const data = opts.accept(json);
        if (data !== null) return { data, model: 'gemini' };
      } catch (err) {
        lastError = err;
      }
      continue;
    }
    const model = entry.replace(/^groq:/, '');
    if ((restUntil.get(model) ?? 0) > Date.now()) continue;
    const json = await groq(
      model,
      {
        system: opts.system,
        parts: opts.parts,
        schema: opts.schema,
        maxTokens: opts.maxTokens ?? 800,
      },
      opts.feature,
      opts.timeoutMs ?? 15_000,
    );
    const data = json === null ? null : opts.accept(json);
    if (data !== null) return { data, model: entry };
  }
  if (lastError instanceof HttpError) throw lastError;
  throw new HttpError(
    429,
    'The AI is busy right now. Please try again in a minute.',
    'ai_rate_limited',
  );
}
