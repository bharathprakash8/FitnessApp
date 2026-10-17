// Firebase Cloud Messaging (HTTP v1) sender. Uses the FIREBASE_SERVICE_ACCOUNT_JSON secret.
import { decodeBase64, encodeBase64Url } from 'jsr:@std/encoding@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path inside the app to open when tapped, e.g. "/food". */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

let cached: { token: string; expires: number } | null = null;

function account(): ServiceAccount {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  return JSON.parse(raw);
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => encodeBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${encodeBase64Url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const body = await res.json();
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

/** Send to one device token. Returns 'ok', 'gone' (token no longer valid) or 'error'. */
async function sendOne(
  sa: ServiceAccount,
  bearer: string,
  token: string,
  platform: string,
  msg: PushMessage,
): Promise<'ok' | 'gone' | 'error'> {
  const appUrl = Deno.env.get('APP_URL') ?? 'https://fitcoach-ten-nu.vercel.app';
  const path = msg.url ?? '/today';
  const message: Record<string, unknown> = {
    token,
    notification: { title: msg.title, body: msg.body },
    data: { url: path, tag: msg.tag ?? '' },
  };
  if (platform === 'android') {
    message.android = {
      priority: 'HIGH',
      notification: {
        channel_id: 'reminders',
        tag: msg.tag,
        icon: 'ic_stat_notify',
        color: '#0e9f6e',
      },
    };
  } else {
    message.webpush = {
      headers: { Urgency: 'high', TTL: '3600' },
      notification: { icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: msg.tag },
      fcm_options: { link: `${appUrl}${path}` },
    };
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => null);
  const code: string =
    err?.error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode ??
    err?.error?.status ??
    '';
  // Only a token the device has dropped is removed – a malformed message must not wipe tokens.
  if (res.status === 404 || code === 'UNREGISTERED') return 'gone';
  console.error('FCM send failed', res.status, code);
  return 'error';
}

/** Send to every device of the given users; removes tokens that are no longer valid. */
export async function sendToUsers(
  db: SupabaseClient,
  userIds: string[],
  msg: PushMessage,
): Promise<{ sent: number; removed: number; failed: number; devices: number }> {
  const result = { sent: 0, removed: 0, failed: 0, devices: 0 };
  if (userIds.length === 0) return result;
  const { data: tokens, error } = await db
    .from('push_tokens')
    .select('id, token, platform')
    .in('user_id', userIds);
  if (error) throw error;
  result.devices = tokens.length;
  if (tokens.length === 0) return result;

  const sa = account();
  const bearer = await accessToken(sa);
  const gone: string[] = [];
  await Promise.all(
    tokens.map(async (t) => {
      const r = await sendOne(sa, bearer, t.token, t.platform, msg);
      if (r === 'ok') result.sent++;
      else if (r === 'gone') gone.push(t.id);
      else result.failed++;
    }),
  );
  if (gone.length) {
    await db.from('push_tokens').delete().in('id', gone);
    result.removed = gone.length;
  }
  return result;
}
