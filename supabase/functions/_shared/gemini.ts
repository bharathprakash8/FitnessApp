// Minimal Gemini client (generateContent with JSON output). Key and model come from secrets.
import { HttpError } from './http.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function generateJson(opts: {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<unknown> {
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  if (!key)
    throw new HttpError(
      503,
      'AI is not set up yet. Please enter the meal manually.',
      'ai_not_configured',
    );

  let res: Response;
  try {
    res = await fetch(`${API}/${model}:generateContent`, {
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
  } catch {
    throw new HttpError(504, 'The AI took too long. Please try again.', 'ai_timeout');
  }

  if (res.status === 429) {
    throw new HttpError(
      429,
      'The AI is busy right now. Try again in a minute, or enter the meal manually.',
      'ai_rate_limited',
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
