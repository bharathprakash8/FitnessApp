// Minimal Gemini client (generateContent with JSON output). Key and model come from secrets.
import { adminClient } from './auth.ts';
import { HttpError } from './http.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Add one answer's token counts to the App health numbers (never fails the request). */
async function recordTokens(feature: string, usage: Record<string, number> | undefined) {
  try {
    const input = usage?.promptTokenCount ?? 0;
    const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    await adminClient().rpc('record_ai_tokens', {
      feat: feature,
      input_t: input,
      output_t: output,
      total_t: usage?.totalTokenCount ?? input + output,
    });
  } catch (err) {
    console.error('Could not record AI tokens:', err instanceof Error ? err.message : String(err));
  }
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
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  if (!key)
    throw new HttpError(
      503,
      'AI is not set up yet. Please enter the meal manually.',
      'ai_not_configured',
    );

  const request = () =>
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
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

  let res: Response;
  try {
    res = await request();
    // Google's free tier allows only a few requests per second; when several people ask at
    // the same moment, wait a little (randomised so they don't collide again) and retry once.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      res = await request();
    }
  } catch {
    throw new HttpError(504, 'The AI took too long. Please try again.', 'ai_timeout');
  }

  if (res.status === 429) {
    // Which Google quota was hit (e.g. requests per minute) – no secrets in here.
    const err = await res.json().catch(() => null);
    const violation = (err?.error?.details ?? [])
      .flatMap(
        (d: { violations?: { quotaId?: string; quotaValue?: string }[] }) => d.violations ?? [],
      )
      .at(0);
    const quota = violation
      ? `${violation.quotaId ?? '?'}=${violation.quotaValue ?? '?'}`
      : 'unknown';
    console.error('Gemini rate limited', quota);
    throw new HttpError(
      429,
      'The AI is busy right now. Try again in a minute, or enter the meal manually.',
      `ai_rate_limited ${quota}`,
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
  await recordTokens(opts.feature, body?.usageMetadata);
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
