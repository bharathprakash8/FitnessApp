// Google OAuth (trainer's own account) + Calendar API helpers. Secrets:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET – the OAuth client in Google Cloud
//   GOOGLE_TOKEN_KEY – base64 of 32 random bytes; encrypts refresh tokens and signs `state`
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './http.ts';

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export function googleConfigured(): boolean {
  return Boolean(
    Deno.env.get('GOOGLE_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CLIENT_SECRET') &&
    Deno.env.get('GOOGLE_TOKEN_KEY'),
  );
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v)
    throw new HttpError(
      503,
      'Google Calendar is not set up yet. Ask the admin.',
      'google_not_configured',
    );
  return v;
}

export const redirectUri = () =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-session/callback`;

// ---------------------------------------------------------------------------
// Crypto: AES-GCM for refresh tokens, HMAC for the OAuth state
// ---------------------------------------------------------------------------
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) =>
  b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/'));

function keyBytes(): Uint8Array {
  const raw = unb64(env('GOOGLE_TOKEN_KEY').trim());
  if (raw.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes (base64)');
  return raw;
}

async function aesKey() {
  return await crypto.subtle.importKey('raw', keyBytes(), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function hmacKey() {
  return await crypto.subtle.importKey(
    'raw',
    keyBytes(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await aesKey(),
      new TextEncoder().encode(plain),
    ),
  );
  return `v1.${b64(iv)}.${b64(data)}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [v, iv, data] = stored.split('.');
  if (v !== 'v1' || !iv || !data) throw new Error('Unknown token format');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) },
    await aesKey(),
    unb64(data),
  );
  return new TextDecoder().decode(plain);
}

/** Signed, short-lived state so the callback knows which trainer started the connect. */
export async function makeState(uid: string): Promise<string> {
  const payload = new TextEncoder().encode(
    JSON.stringify({ uid, exp: Date.now() + 15 * 60_000, n: crypto.randomUUID() }),
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), payload));
  return `${b64url(payload)}.${b64url(sig)}`;
}

export async function readState(state: string): Promise<string | null> {
  const [p, s] = state.split('.');
  if (!p || !s) return null;
  const payload = unb64url(p);
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64url(s), payload);
  if (!ok) return null;
  const { uid, exp } = JSON.parse(new TextDecoder().decode(payload)) as {
    uid: string;
    exp: number;
  };
  return exp > Date.now() ? uid : null;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export async function authUrl(uid: string): Promise<string> {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on a reconnect.
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state: await makeState(uid),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      ...params,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) return { access_token: '', error: body.error ?? `http_${res.status}` };
  return body;
}

/** Exchange the callback code; returns what we store. Throws a short reason on failure. */
export async function exchangeCode(code: string) {
  const t = await tokenRequest({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
  });
  if (t.error || !t.refresh_token) throw new Error(t.error ?? 'no_refresh_token');
  if (!(t.scope ?? '').split(' ').includes(CALENDAR_SCOPE)) throw new Error('calendar_not_allowed');
  // The id_token comes straight from Google over TLS; only its email claim is used.
  let email: string | null = null;
  try {
    const part = t.id_token?.split('.')[1];
    if (part)
      email =
        (JSON.parse(new TextDecoder().decode(unb64url(part))) as { email?: string }).email ?? null;
  } catch {
    /* email is just for display */
  }
  return { refreshToken: t.refresh_token, scope: t.scope ?? '', email };
}

export async function revoke(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
  }).catch(() => undefined);
}

/** A fresh access token for the trainer, or an HttpError asking them to (re)connect. */
export async function accessTokenFor(db: SupabaseClient, ownerId: string): Promise<string> {
  const { data: row, error } = await db
    .from('integration_tokens')
    .select('refresh_token_encrypted')
    .eq('owner_id', ownerId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new HttpError(409, 'Connect your Google account first.', 'google_not_connected');
  const t = await tokenRequest({
    refresh_token: await decryptToken(row.refresh_token_encrypted),
    grant_type: 'refresh_token',
  });
  if (t.error === 'invalid_grant') {
    // Revoked by the trainer or expired: forget it so the app asks to reconnect.
    await db
      .from('integration_tokens')
      .delete()
      .eq('owner_id', ownerId)
      .eq('provider', 'google_calendar');
    throw new HttpError(
      409,
      'Your Google connection has expired. Please connect again.',
      'google_not_connected',
    );
  }
  if (t.error || !t.access_token)
    throw new HttpError(502, 'Google did not respond. Try again.', 'google_error');
  return t.access_token;
}

// ---------------------------------------------------------------------------
// Calendar API (the trainer's primary calendar)
// ---------------------------------------------------------------------------
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface GEvent {
  id: string;
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType: string; uri: string }[];
  };
  originalStartTime?: { dateTime?: string };
  status?: string;
}

async function call<T>(token: string, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === 'DELETE' && (res.status === 404 || res.status === 410)) return undefined as T;
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error('Google Calendar error', res.status, detail?.error?.message ?? '');
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(
        409,
        'Google refused the request. Please connect your Google account again.',
        'google_not_connected',
      );
    }
    throw new HttpError(
      502,
      'Google Calendar had a problem. Try again in a minute.',
      'google_error',
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const meetLink = (e: GEvent) =>
  e.hangoutLink ??
  e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
  null;

export async function insertEvent(token: string, event: unknown, notify: boolean): Promise<GEvent> {
  const q = `?conferenceDataVersion=1&sendUpdates=${notify ? 'all' : 'none'}`;
  let e = await call<GEvent>(token, 'POST', API + q, event);
  // The Meet link is usually ready at once; if not, look again shortly.
  for (let i = 0; i < 3 && !meetLink(e) && e.conferenceData?.createRequest; i++) {
    await new Promise((r) => setTimeout(r, 800));
    e = await call<GEvent>(token, 'GET', `${API}/${encodeURIComponent(e.id)}`);
  }
  return e;
}

export const patchEvent = (token: string, id: string, patch: unknown, notify: boolean) =>
  call<GEvent>(
    token,
    'PATCH',
    `${API}/${encodeURIComponent(id)}?conferenceDataVersion=1&sendUpdates=${notify ? 'all' : 'none'}`,
    patch,
  );

export const deleteEvent = (token: string, id: string, notify: boolean) =>
  call<void>(
    token,
    'DELETE',
    `${API}/${encodeURIComponent(id)}?sendUpdates=${notify ? 'all' : 'none'}`,
  );

export async function instances(token: string, id: string): Promise<GEvent[]> {
  const r = await call<{ items?: GEvent[] }>(
    token,
    'GET',
    `${API}/${encodeURIComponent(id)}/instances?maxResults=100`,
  );
  return r.items ?? [];
}
