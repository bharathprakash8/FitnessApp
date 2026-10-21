// health-sync: the iPhone Shortcut posts the day's Apple Health numbers here.
// Auth: X-Sync-Token header; its SHA-256 must match profiles.health_sync_token_hash.
// Body: { date?: "YYYY-MM-DD" | days_ago?: 0..6, active_calories, resting_calories?, steps?,
//         sleep_minutes?, worn_hours? }
// worn_hours: the hours (0–23) in which Apple Health has heart-rate data – i.e. the watch was
// worn. Sent as a list of numbers or as text like "7, 8, 9" (what Shortcuts produces).
import { encodeHex } from 'jsr:@std/encoding@1/hex';
import { z } from 'npm:zod@3';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const DAILY_LIMIT = 40; // 2 automatic runs × today + yesterday, plus "Sync now" taps

// Shortcuts often send numbers as text, sometimes with decimals or commas.
const amount = (max: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => Number(String(v).replace(/,/g, '').trim()))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= max, 'Number out of range')
    .transform((n) => Math.round(n));

const Body = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  days_ago: z.coerce.number().int().min(0).max(6).optional(),
  active_calories: amount(10000),
  resting_calories: amount(6000).optional(),
  steps: amount(200000).optional(),
  sleep_minutes: amount(1440).optional(),
  worn_hours: z
    .union([z.array(z.union([z.number(), z.string()])), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const parts = Array.isArray(v) ? v : v.split(/[^0-9]+/);
      const hours = parts
        .map((x) => String(x).trim())
        .filter((x) => x !== '') // "" = no heart-rate data = no watch that day
        .map(Number)
        .filter((n) => String(n) !== 'NaN' && Number.isInteger(n) && n >= 0 && n <= 23);
      return [...new Set(hours)].sort((a, b) => a - b);
    }),
});

async function sha256(text: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  );
}

function dayIn(timeZone: string, daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}

serveJson(async (req) => {
  const token = req.headers.get('x-sync-token')?.trim();
  if (!token || token.length < 20) throw new HttpError(401, 'Missing sync token', 'unauthorized');

  const db = adminClient();
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, is_active, timezone')
    .eq('health_sync_token_hash', await sha256(token))
    .maybeSingle();
  if (error) throw error;
  if (!profile || !profile.is_active || (profile.role !== 'client' && profile.role !== 'trainer')) {
    throw new HttpError(
      401,
      'Sync token not recognised. Set up iPhone sync again in the app.',
      'unauthorized',
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON', 'bad_request');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`,
      'invalid_input',
    );
  }
  const b = parsed.data;

  const tz = profile.timezone || 'Asia/Kolkata';
  const today = dayIn(tz);
  const earliest = dayIn(tz, 6);
  const date = b.date ?? dayIn(tz, b.days_ago ?? 0);
  if (date > today || date < earliest) {
    throw new HttpError(400, 'Only the last 7 days can be synced', 'date_out_of_range');
  }

  const { data: count } = await db.rpc('bump_ai_usage', {
    uid: profile.id,
    day: today,
    feat: 'health-sync',
  });
  if (Number(count ?? 0) > DAILY_LIMIT) {
    throw new HttpError(429, 'Too many syncs today – try again tomorrow', 'rate_limited');
  }

  const row = {
    client_id: profile.id,
    activity_date: date,
    active_calories: b.active_calories,
    resting_calories: b.resting_calories ?? null,
    steps: b.steps ?? null,
    sleep_minutes: b.sleep_minutes ?? null,
    worn_hours: b.worn_hours ?? null,
    source: 'apple_shortcut',
  };
  const { error: upErr } = await db
    .from('activity_daily')
    .upsert(row, { onConflict: 'client_id,activity_date' });
  if (upErr) throw upErr;

  return {
    saved: date,
    active_calories: row.active_calories,
    watch_worn_hours: row.worn_hours?.length ?? null,
  };
});
