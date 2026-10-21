// Minimal Gemini client (generateContent with JSON output). Key and models come from secrets:
//   GEMINI_API_KEY, GEMINI_MODEL (main model), GEMINI_FALLBACK_MODELS (optional, comma-
//   separated backups). Each Google model has its own free daily quota, so when the main
//   model's quota is used up the next model is tried automatically.
import { adminClient } from './auth.ts';
import { HttpError } from './http.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Add one answer's token counts to the App health numbers (never fails the request). */
async function recordTokens(
  feature: string,
  model: string,
  usage: Record<string, number> | undefined,
) {
  try {
    const input = usage?.promptTokenCount ?? 0;
    const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    await adminClient().rpc('record_ai_tokens', {
      feat: feature,
      model_name: model,
      input_t: input,
      output_t: output,
      total_t: usage?.totalTokenCount ?? input + output,
    });
  } catch (err) {
    console.error('Could not record AI tokens:', err instanceof Error ? err.message : String(err));
  }
}

/** How long each model took on the last call, e.g. "gemini-x 503 9.1s". For diagnosing speed. */
export let lastTimings: string[] = [];

/** Models whose daily quota ran out (or that are overloaded), skipped until this time (per running server). */
const exhaustedUntil = new Map<string, number>();

function modelList(): string[] {
  const main = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  const backups = (Deno.env.get('GEMINI_FALLBACK_MODELS') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([main, ...backups])];
}

/** Which Google quota a 429 hit, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier=20". */
async function quotaOf(res: Response): Promise<string> {
  const err = await res.json().catch(() => null);
  const violation = (err?.error?.details ?? [])
    .flatMap(
      (d: { violations?: { quotaId?: string; quotaValue?: string }[] }) => d.violations ?? [],
    )
    .at(0);
  return violation ? `${violation.quotaId ?? '?'}=${violation.quotaValue ?? '?'}` : 'unknown';
}

export async function generateJson(opts: {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  temperature?: number;
  /** Label for App health (e.g. 'meal-photo', 'weekly-summary'). */
  feature: string;
}): Promise<unknown> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key)
    throw new HttpError(
      503,
      'AI is not set up yet. Please enter the meal manually.',
      'ai_not_configured',
    );

  let thinking = true; // switched off if a model doesn't accept the setting
  const request = (model: string) =>
    fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: opts.parts }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: opts.schema,
          // Little step-by-step "thinking": food estimates don't need it and it was
          // making answers take 20+ seconds.
          ...(thinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

  let res: Response | null = null;
  let model = '';
  let lastQuota = 'unknown';
  const now = Date.now();
  const models = modelList().filter((m) => (exhaustedUntil.get(m) ?? 0) < now);
  lastTimings = [];
  try {
    for (const m of models.length ? models : modelList()) {
      model = m;
      const t0 = Date.now();
      res = await request(m);
      if (res.status === 400 && thinking) {
        const msg = await res.clone().text();
        if (/thinking/i.test(msg)) {
          thinking = false;
          res = await request(m);
        }
      }
      lastTimings.push(`${m} ${res.status} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (res.status === 429) {
        lastQuota = await quotaOf(res);
        if (/PerDay/i.test(lastQuota)) {
          // Daily quota used up: go straight to the next model, skip this one for a while.
          console.error('Gemini daily quota used up for', m, lastQuota);
          exhaustedUntil.set(m, Date.now() + 30 * 60_000);
          continue;
        }
        // Too many at this moment: wait a little (randomised) and retry once.
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
        res = await request(m);
        if (res.status === 429) {
          lastQuota = await quotaOf(res);
          continue;
        }
      }
      if (res.status === 503 || res.status === 500) {
        // Google says the model is overloaded ("high demand"): use the next model now and
        // leave this one alone for a couple of minutes.
        console.error('Gemini model busy:', m, res.status);
        lastQuota = `busy_${res.status}`;
        exhaustedUntil.set(m, Date.now() + 2 * 60_000);
        continue;
      }
      if (res.status === 404) {
        // A backup model name that doesn't exist (any more): try the next one.
        console.error('Gemini model not found:', m);
        continue;
      }
      break;
    }
  } catch {
    throw new HttpError(504, 'The AI took too long. Please try again.', 'ai_timeout');
  }

  if (!res || [429, 404, 500, 503].includes(res.status)) {
    console.error('Gemini: no model available', lastQuota);
    throw new HttpError(
      429,
      'The AI is busy right now. Try again in a minute, or enter the meal manually.',
      `ai_rate_limited ${lastQuota}`,
    );
  }
  if (!res.ok) {
    // Google's error status/message never contain the key; the request body is not logged.
    const err = await res.json().catch(() => null);
    const googleStatus: string = err?.error?.status ?? 'UNKNOWN';
    if (/api key/i.test(String(err?.error?.message ?? ''))) {
      console.error('Gemini rejected the API key');
      throw new HttpError(
        503,
        "The AI isn't set up correctly. Please enter the meal manually and tell the admin.",
        'ai_bad_key',
      );
    }
    console.error(
      'Gemini error',
      res.status,
      googleStatus,
      String(err?.error?.message ?? '').slice(0, 300),
    );
    throw new HttpError(
      502,
      'The AI could not read this meal. Try again or enter it manually.',
      `ai_error_${res.status}_${googleStatus}: ${String(err?.error?.message ?? '').slice(0, 160)}`,
    );
  }

  const body = await res.json();
  await recordTokens(opts.feature, model, body?.usageMetadata);
  const text: string | undefined = body?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) {
    throw new HttpError(
      502,
      'The AI could not read this meal. Try again or enter it manually.',
      'ai_empty',
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(
      502,
      'The AI gave an unreadable answer. Try again or enter it manually.',
      'ai_bad_json',
    );
  }
}
