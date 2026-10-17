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
    // Log status only – never the key or the request body.
    console.error('Gemini error status', res.status);
    throw new HttpError(
      502,
      'The AI could not read this meal. Try again or enter it manually.',
      'ai_error',
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
