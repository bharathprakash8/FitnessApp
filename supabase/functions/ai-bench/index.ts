// ai-bench – TEMPORARY, for comparing AI providers (Gemini vs Groq) on FitCoach's AI tasks.
// Remove when the comparison is done. Every call needs the x-test-secret header
// (TEST_USERS_SECRET). Keys stay on the server (GEMINI_API_KEY, GROQ_API_KEY).
//   { action: 'models', provider }                                   list the provider's models
//   { action: 'run', provider, model, task: 'json' | 'text', system, prompt, schema?,
//     image_paths? (meal-photos paths), temperature? }                one request, timed
//   { action: 'transcribe', provider, model, audio_b64, mime, language? }  speech to text
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ = 'https://api.groq.com/openai/v1';

function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function key(provider: string) {
  const k = Deno.env.get(provider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY');
  if (!k) throw new HttpError(503, `${provider} key not set`, 'no_key');
  return k;
}

interface Run {
  provider: 'gemini' | 'groq';
  model: string;
  task: 'json' | 'text';
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  image_paths?: string[];
  temperature?: number;
  max_tokens?: number;
}

async function images(paths: string[]) {
  const db = adminClient();
  const out: string[] = [];
  for (const p of paths) {
    const { data, error } = await db.storage.from('meal-photos').download(p);
    if (error || !data) throw new HttpError(404, `Photo not found: ${p}`, 'photo_missing');
    out.push(encodeBase64(new Uint8Array(await data.arrayBuffer())));
  }
  return out;
}

/** Plain JSON schema text (lower-case types) for providers without schema support. */
function schemaText(schema: Record<string, unknown>) {
  return JSON.stringify(schema).replace(
    /"type":"([A-Z]+)"/g,
    (_, t: string) => `"type":"${t.toLowerCase()}"`,
  );
}

async function runGemini(r: Run, imgs: string[]) {
  const parts: unknown[] = imgs.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } }));
  parts.push({ text: r.prompt });
  const body = (thinking: boolean) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: r.temperature ?? 0,
        ...(r.task === 'json'
          ? { responseMimeType: 'application/json', responseSchema: r.schema }
          : {}),
        ...(thinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
      },
    });
  const call = (thinking: boolean) =>
    fetch(`${GEMINI}/${r.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key('gemini') },
      body: body(thinking),
      signal: AbortSignal.timeout(60_000),
    });
  let res = await call(true);
  if (res.status === 400 && /thinking/i.test(await res.clone().text())) res = await call(false);
  const j = await res.json().catch(() => null);
  if (!res.ok) return { status: res.status, error: String(j?.error?.message ?? '').slice(0, 300) };
  const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  const u = j?.usageMetadata ?? {};
  return {
    status: 200,
    text,
    usage: {
      input: u.promptTokenCount ?? 0,
      output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      total: u.totalTokenCount ?? 0,
    },
  };
}

async function runGroq(r: Run, imgs: string[]) {
  const system =
    r.task === 'json' && r.schema
      ? `${r.system}\nReturn only a JSON object matching this JSON schema: ${schemaText(r.schema)}`
      : r.system;
  const content = imgs.length
    ? [
        ...imgs.map((d) => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${d}` },
        })),
        { type: 'text', text: r.prompt },
      ]
    : r.prompt;
  const res = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key('groq')}` },
    body: JSON.stringify({
      model: r.model,
      temperature: r.temperature ?? 0,
      ...(r.max_tokens ? { max_tokens: r.max_tokens } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      ...(r.task === 'json' ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) return { status: res.status, error: String(j?.error?.message ?? '').slice(0, 300) };
  const u = j?.usage ?? {};
  return {
    status: 200,
    text: String(j?.choices?.[0]?.message?.content ?? ''),
    usage: {
      input: u.prompt_tokens ?? 0,
      output: u.completion_tokens ?? 0,
      total: u.total_tokens ?? 0,
    },
  };
}

async function transcribe(b: {
  provider: string;
  model: string;
  audio_b64: string;
  mime: string;
  language?: string;
}) {
  if (b.provider === 'groq') {
    const form = new FormData();
    const ext = b.mime.split('/')[1]?.replace('mpeg', 'mp3').replace('x-m4a', 'm4a') ?? 'm4a';
    form.append('file', new Blob([decodeBase64(b.audio_b64)], { type: b.mime }), `clip.${ext}`);
    form.append('model', b.model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (b.language) form.append('language', b.language);
    const res = await fetch(`${GROQ}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key('groq')}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok)
      return { status: res.status, error: String(j?.error?.message ?? '').slice(0, 300) };
    return { status: 200, text: String(j?.text ?? '') };
  }
  const res = await fetch(`${GEMINI}/${b.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key('gemini') },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: b.mime, data: b.audio_b64 } },
            {
              text: 'Transcribe this voice note exactly, in the language and script it is spoken in (Kannada in Kannada script, English in English). Return only the words spoken.',
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) return { status: res.status, error: String(j?.error?.message ?? '').slice(0, 300) };
  const u = j?.usageMetadata ?? {};
  const text = (j?.candidates?.[0]?.content?.parts ?? [])
    // The dedicated transcribe models answer in parts[].audioTranscription.text.
    .map(
      (p: { text?: string; audioTranscription?: { text?: string } }) =>
        p.text ?? p.audioTranscription?.text ?? '',
    )
    .join('')
    .trim();
  return {
    status: 200,
    text,
    usage: { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 },
    ...(text ? {} : { raw: JSON.stringify(j).slice(0, 1500) }),
  };
}

serveJson(async (req) => {
  const secret = Deno.env.get('TEST_USERS_SECRET') ?? '';
  if (!secret || !sameSecret(req.headers.get('x-test-secret') ?? '', secret)) {
    throw new HttpError(401, 'Not allowed', 'unauthorized');
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t0 = Date.now();
  if (body.action === 'models') {
    const groq = body.provider === 'groq';
    const res = await fetch(groq ? `${GROQ}/models` : `${GEMINI}?pageSize=200`, {
      headers: groq
        ? { Authorization: `Bearer ${key('groq')}` }
        : { 'x-goog-api-key': key('gemini') },
    });
    const j = await res.json().catch(() => null);
    const list = groq
      ? (j?.data ?? []).map((m: { id: string }) => m.id)
      : (j?.models ?? []).map((m: { name: string }) => m.name.replace('models/', ''));
    return { status: res.status, models: list };
  }
  if (body.action === 'transcribe') {
    const out = await transcribe(body as Parameters<typeof transcribe>[0]);
    return { ...out, ms: Date.now() - t0 };
  }
  if (body.action === 'run') {
    const r = body as unknown as Run;
    const imgs = await images(r.image_paths ?? []);
    const t1 = Date.now();
    const out = r.provider === 'groq' ? await runGroq(r, imgs) : await runGemini(r, imgs);
    let json: unknown = null;
    if (r.task === 'json' && 'text' in out && out.text) {
      try {
        json = JSON.parse(out.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      } catch {
        json = null;
      }
    }
    return { ...out, json, ms: Date.now() - t1 };
  }
  throw new HttpError(400, 'Unknown action', 'invalid_input');
});
