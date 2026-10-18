// calendar-session: training sessions with the trainer's own Google Calendar + Meet.
//   GET  …/calendar-session/callback        Google sends the trainer back here after "Allow"
//   POST { action: 'status' | 'auth_url' | 'disconnect' }
//   POST { action: 'create', … }             one session or a repeating series
//   POST { action: 'update', session_id, scope: 'one' | 'series', … }
//   POST { action: 'cancel', session_id, scope: 'one' | 'series' }
// Trainers only. Sessions, attendees and Google events are kept in step here; the app only
// reads sessions and marks attendance.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import {
  accessTokenFor,
  authUrl,
  decryptToken,
  deleteEvent,
  encryptToken,
  exchangeCode,
  googleConfigured,
  insertEvent,
  instances,
  meetLink,
  patchEvent,
  readState,
  revoke,
} from '../_shared/google.ts';
import { handleJson, HttpError } from '../_shared/http.ts';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://fitcoach-ten-nu.vercel.app').replace(
  /\/$/,
  '',
);
const MAX_OCCURRENCES = 60;

// ---------------------------------------------------------------------------
// Time helpers (local date/time in an IANA zone ↔ UTC)
// ---------------------------------------------------------------------------
function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minutes the zone is ahead of UTC at a given instant. */
function offsetMin(utcMs: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2026-10-20" + "18:30" in Asia/Kolkata → UTC Date (handles daylight saving). */
function localToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  let utc = guess - offsetMin(guess, tz) * 60_000;
  utc = guess - offsetMin(utc, tz) * 60_000;
  return new Date(utc);
}

const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Dates of every session in a series (first = first matching day on/after the start). */
function occurrenceDates(r: {
  start_date: string;
  repeat: 'daily' | 'weekly';
  weekdays: number[];
  ends_after?: number | null;
  ends_on?: string | null;
}): string[] {
  const out: string[] = [];
  const limit = Math.min(r.ends_after ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  for (let i = 0; i < 400 && out.length < limit; i++) {
    const day = addDays(r.start_date, i);
    if (r.ends_on && day > r.ends_on) break;
    if (r.repeat === 'daily' || r.weekdays.includes(isoWeekday(day))) out.push(day);
  }
  return out;
}

function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zone = z.string().min(1).max(60).refine(validZone, 'Unknown time zone');
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const Create = z.object({
  action: z.literal('create'),
  title: z.string().trim().min(1).max(80),
  type: z.enum(['in_person', 'online']),
  location: text(200),
  notes: text(1000),
  duration_min: z.number().int().min(5).max(480),
  time_zone: zone,
  start_date: ymd,
  start_time: hhmm,
  repeat: z.enum(['none', 'daily', 'weekly']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  ends_after: z.number().int().min(1).max(MAX_OCCURRENCES).nullish(),
  ends_on: ymd.nullish(),
  client_ids: z.array(z.string().uuid()).min(1).max(50),
  // google = make a Meet link in the trainer's Google Calendar; link = trainer pastes one
  meet: z.enum(['google', 'link']).default('google'),
  meet_url: z.string().url().startsWith('https://').max(300).nullish(),
  send_invite: z.boolean().default(true),
});

const Update = z.object({
  action: z.literal('update'),
  session_id: z.string().uuid(),
  scope: z.enum(['one', 'series']),
  title: z.string().trim().min(1).max(80),
  location: text(200),
  notes: text(1000),
  client_ids: z.array(z.string().uuid()).min(1).max(50),
  meet_url: z.string().url().startsWith('https://').max(300).nullish(),
  // only for scope 'one'
  start_date: ymd.optional(),
  start_time: hhmm.optional(),
  time_zone: zone.optional(),
  duration_min: z.number().int().min(5).max(480).optional(),
});

const Cancel = z.object({
  action: z.literal('cancel'),
  session_id: z.string().uuid(),
  scope: z.enum(['one', 'series']),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const p = schema.safeParse(body);
  if (!p.success) {
    throw new HttpError(400, p.error.issues[0]?.message ?? 'Invalid input', 'invalid_input');
  }
  return p.data;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
interface ClientRow {
  id: string;
  email: string;
  timezone: string;
}

/** The given clients, all mapped to this trainer and active. */
async function myClients(
  db: SupabaseClient,
  trainerId: string,
  ids: string[],
): Promise<ClientRow[]> {
  const unique = [...new Set(ids)];
  const { data, error } = await db
    .from('trainer_clients')
    .select('client_id, profiles!trainer_clients_client_id_fkey(id, email, timezone, is_active)')
    .eq('trainer_id', trainerId)
    .in('client_id', unique);
  if (error) throw error;
  const rows = (data ?? [])
    .map((r) => r.profiles as unknown as ClientRow & { is_active: boolean })
    .filter((p) => p?.is_active);
  if (rows.length !== unique.length) {
    throw new HttpError(403, 'You can only invite your own active clients.', 'forbidden');
  }
  return rows;
}

async function loadSession(db: SupabaseClient, trainerId: string, id: string) {
  const { data, error } = await db
    .from('sessions')
    .select('*, session_series(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.trainer_id !== trainerId)
    throw new HttpError(404, 'Session not found', 'not_found');
  return data;
}

async function setAttendees(db: SupabaseClient, sessionIds: string[], clientIds: string[]) {
  if (sessionIds.length === 0) return;
  // Keep attendance already marked; add new people; remove people taken off.
  const { error: delErr } = await db
    .from('session_attendees')
    .delete()
    .in('session_id', sessionIds)
    .not('client_id', 'in', `(${clientIds.join(',')})`);
  if (delErr) throw delErr;
  const rows = sessionIds.flatMap((session_id) =>
    clientIds.map((client_id) => ({ session_id, client_id })),
  );
  const { error } = await db
    .from('session_attendees')
    .upsert(rows, { onConflict: 'session_id,client_id', ignoreDuplicates: true });
  if (error) throw error;
}

function eventBody(s: {
  title: string;
  type: string;
  location: string | null;
  notes: string | null;
  meetUrl: string | null;
  startUtc: Date;
  duration_min: number;
  time_zone: string;
  emails: string[] | null;
}) {
  const end = new Date(s.startUtc.getTime() + s.duration_min * 60_000);
  const lines = [s.notes, s.meetUrl ? `Join: ${s.meetUrl}` : null, 'Scheduled with FitCoach.'];
  return {
    summary: s.title,
    location: s.type === 'in_person' ? (s.location ?? undefined) : (s.meetUrl ?? undefined),
    description: lines.filter(Boolean).join('\n\n'),
    start: { dateTime: s.startUtc.toISOString(), timeZone: s.time_zone },
    end: { dateTime: end.toISOString(), timeZone: s.time_zone },
    ...(s.emails ? { attendees: s.emails.map((email) => ({ email })) } : {}),
    guestsCanInviteOthers: false,
  };
}

async function notify(
  db: SupabaseClient,
  clients: ClientRow[],
  title: (c: ClientRow) => string,
  body: (c: ClientRow) => string,
  tag: string,
) {
  // Each client gets the time in their own time zone.
  await Promise.all(
    clients.map((c) =>
      sendToUsers(db, [c.id], { title: title(c), body: body(c), url: '/today', tag }).catch(
        () => undefined,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function create(db: SupabaseClient, trainerId: string, input: z.infer<typeof Create>) {
  const clients = await myClients(db, trainerId, input.client_ids);
  if (input.repeat === 'weekly' && input.weekdays.length === 0) {
    throw new HttpError(400, 'Pick the days of the week.', 'invalid_input');
  }
  const dates =
    input.repeat === 'none'
      ? [input.start_date]
      : occurrenceDates({ ...input, repeat: input.repeat });
  if (dates.length === 0)
    throw new HttpError(400, 'No sessions fall in those dates.', 'invalid_input');
  const starts = dates.map((d) => localToUtc(d, input.start_time, input.time_zone));
  if (starts[0]!.getTime() < Date.now() - 5 * 60_000) {
    throw new HttpError(400, 'The first session is in the past.', 'invalid_input');
  }

  const online = input.type === 'online';
  const useGoogleMeet = online && input.meet === 'google';
  if (online && input.meet === 'link' && !input.meet_url) {
    throw new HttpError(400, 'Paste the Meet / video link.', 'invalid_input');
  }
  const needGoogle = useGoogleMeet || input.send_invite;

  // 1. Google Calendar event (one recurring event for a series → one Meet link for all).
  let eventId: string | null = null;
  let meetUrl: string | null = online && input.meet === 'link' ? (input.meet_url ?? null) : null;
  const instanceIds = new Map<number, string>();
  let token: string | null = null;
  if (needGoogle) {
    token = await accessTokenFor(db, trainerId);
    const body = {
      ...eventBody({
        ...input,
        meetUrl,
        startUtc: starts[0]!,
        emails: input.send_invite ? clients.map((c) => c.email) : null,
      }),
      ...(input.repeat === 'none'
        ? {}
        : {
            recurrence: [
              `RRULE:FREQ=${input.repeat === 'daily' ? 'DAILY' : 'WEEKLY'}` +
                (input.repeat === 'weekly'
                  ? `;BYDAY=${[...new Set(input.weekdays)]
                      .sort()
                      .map((w) => BYDAY[w - 1])
                      .join(',')}`
                  : '') +
                `;COUNT=${dates.length}`,
            ],
          }),
      ...(useGoogleMeet
        ? {
            conferenceData: {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }
        : {}),
    };
    const event = await insertEvent(token, body, input.send_invite);
    eventId = event.id;
    if (useGoogleMeet) {
      meetUrl = meetLink(event);
      if (!meetUrl) {
        await deleteEvent(token, event.id, false);
        throw new HttpError(502, "Google didn't create a Meet link. Try again.", 'google_error');
      }
    }
    if (input.repeat !== 'none') {
      for (const inst of await instances(token, event.id)) {
        const t = inst.originalStartTime?.dateTime;
        if (t) instanceIds.set(new Date(t).getTime(), inst.id);
      }
    }
  }

  // 2. Database rows. If this fails, take the Google event back out.
  try {
    let seriesId: string | null = null;
    if (input.repeat !== 'none') {
      const { data, error } = await db
        .from('session_series')
        .insert({
          trainer_id: trainerId,
          title: input.title,
          type: input.type,
          location: input.location,
          notes: input.notes,
          duration_min: input.duration_min,
          time_zone: input.time_zone,
          start_date: dates[0],
          start_time: input.start_time,
          repeat: input.repeat,
          weekdays: input.weekdays,
          ends_after: input.ends_after ?? null,
          ends_on: input.ends_on ?? null,
          meet_url: meetUrl,
          calendar_event_id: eventId,
          send_invite: input.send_invite,
        })
        .select('id')
        .single();
      if (error) throw error;
      seriesId = data.id;
    }
    const { data: rows, error } = await db
      .from('sessions')
      .insert(
        starts.map((s) => ({
          trainer_id: trainerId,
          series_id: seriesId,
          title: input.title,
          starts_at: s.toISOString(),
          duration_min: input.duration_min,
          time_zone: input.time_zone,
          type: input.type,
          location: input.location,
          notes: input.notes,
          meet_url: meetUrl,
          calendar_event_id: seriesId ? (instanceIds.get(s.getTime()) ?? null) : eventId,
          send_invite: input.send_invite,
        })),
      )
      .select('id');
    if (error) throw error;
    await setAttendees(
      db,
      rows.map((r) => r.id),
      clients.map((c) => c.id),
    );
    await notify(
      db,
      clients,
      () => (dates.length > 1 ? `New sessions: ${input.title}` : `New session: ${input.title}`),
      (c) =>
        `${dates.length > 1 ? 'Starts' : 'On'} ${when(starts[0]!.toISOString(), c.timezone || 'Asia/Kolkata')}` +
        (dates.length > 1 ? ` · ${dates.length} sessions` : ''),
      `session-new-${rows[0]!.id}`,
    );
    return { session_ids: rows.map((r) => r.id), meet_url: meetUrl, sessions: rows.length };
  } catch (err) {
    if (token && eventId)
      await deleteEvent(token, eventId, input.send_invite).catch(() => undefined);
    throw err;
  }
}

async function update(db: SupabaseClient, trainerId: string, input: z.infer<typeof Update>) {
  const s = await loadSession(db, trainerId, input.session_id);
  const clients = await myClients(db, trainerId, input.client_ids);
  const series = s.session_series as { id: string; calendar_event_id: string | null } | null;
  const meetUrl = s.type === 'online' ? (input.meet_url ?? s.meet_url) : null;

  if (input.scope === 'series' && series) {
    // Title, place, notes and people for this and all later sessions of the series.
    const { data: later, error } = await db
      .from('sessions')
      .update({
        title: input.title,
        location: input.location,
        notes: input.notes,
        meet_url: meetUrl,
      })
      .eq('series_id', series.id)
      .gte('starts_at', s.starts_at)
      .eq('status', 'scheduled')
      .select('id');
    if (error) throw error;
    await db
      .from('session_series')
      .update({
        title: input.title,
        location: input.location,
        notes: input.notes,
        meet_url: meetUrl,
      })
      .eq('id', series.id);
    await setAttendees(
      db,
      later.map((r) => r.id),
      clients.map((c) => c.id),
    );
    if (series.calendar_event_id) {
      const token = await accessTokenFor(db, trainerId);
      const lines = [input.notes, meetUrl ? `Join: ${meetUrl}` : null, 'Scheduled with FitCoach.'];
      await patchEvent(
        token,
        series.calendar_event_id,
        {
          summary: input.title,
          location: s.type === 'in_person' ? input.location : meetUrl,
          description: lines.filter(Boolean).join('\n\n'),
          ...(s.send_invite ? { attendees: clients.map((c) => ({ email: c.email })) } : {}),
        },
        s.send_invite,
      );
    }
    return { updated: later.length };
  }

  // One session: everything, including the time.
  const tz = input.time_zone ?? s.time_zone;
  const startUtc =
    input.start_date && input.start_time
      ? localToUtc(input.start_date, input.start_time, tz)
      : new Date(s.starts_at);
  const duration = input.duration_min ?? s.duration_min;
  const { error } = await db
    .from('sessions')
    .update({
      title: input.title,
      location: input.location,
      notes: input.notes,
      meet_url: meetUrl,
      starts_at: startUtc.toISOString(),
      time_zone: tz,
      duration_min: duration,
    })
    .eq('id', s.id);
  if (error) throw error;
  await setAttendees(
    db,
    [s.id],
    clients.map((c) => c.id),
  );
  if (s.calendar_event_id) {
    const token = await accessTokenFor(db, trainerId);
    await patchEvent(
      token,
      s.calendar_event_id,
      eventBody({
        title: input.title,
        type: s.type,
        location: input.location,
        notes: input.notes,
        meetUrl,
        startUtc,
        duration_min: duration,
        time_zone: tz,
        emails: s.send_invite ? clients.map((c) => c.email) : null,
      }),
      s.send_invite,
    );
  }
  if (startUtc.toISOString() !== new Date(s.starts_at).toISOString()) {
    await notify(
      db,
      clients,
      () => `Session moved: ${input.title}`,
      (c) => `Now ${when(startUtc.toISOString(), c.timezone || 'Asia/Kolkata')}`,
      `session-${s.id}`,
    );
  }
  return { updated: 1 };
}

async function cancel(db: SupabaseClient, trainerId: string, input: z.infer<typeof Cancel>) {
  const s = await loadSession(db, trainerId, input.session_id);
  const series = s.session_series as { id: string; calendar_event_id: string | null } | null;

  const { data: people } = await db
    .from('session_attendees')
    .select('profiles!session_attendees_client_id_fkey(id, email, timezone)')
    .eq('session_id', s.id);
  const clients = (people ?? []).map((p) => p.profiles as unknown as ClientRow).filter(Boolean);

  if (input.scope === 'series' && series) {
    // Cancel this and all later sessions; earlier ones (and their attendance) stay.
    const { data: later, error } = await db
      .from('sessions')
      .update({ status: 'cancelled' })
      .eq('series_id', series.id)
      .gte('starts_at', s.starts_at)
      .eq('status', 'scheduled')
      .select('id');
    if (error) throw error;
    if (series.calendar_event_id) {
      const token = await accessTokenFor(db, trainerId);
      const { count: earlier } = await db
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', series.id)
        .lt('starts_at', s.starts_at);
      if (!earlier) {
        await deleteEvent(token, series.calendar_event_id, s.send_invite);
      } else {
        // End the Google series just before this session.
        const { data: ser } = await db
          .from('session_series')
          .select('*')
          .eq('id', series.id)
          .single();
        const until = new Date(new Date(s.starts_at).getTime() - 60_000)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, '');
        const rule =
          `RRULE:FREQ=${ser.repeat === 'daily' ? 'DAILY' : 'WEEKLY'}` +
          (ser.repeat === 'weekly'
            ? `;BYDAY=${[...new Set(ser.weekdays as number[])]
                .sort()
                .map((w) => BYDAY[w - 1])
                .join(',')}`
            : '') +
          `;UNTIL=${until}`;
        await patchEvent(token, series.calendar_event_id, { recurrence: [rule] }, s.send_invite);
      }
    }
    await notify(
      db,
      clients,
      () => `Sessions cancelled: ${s.title}`,
      (c) => `From ${when(s.starts_at, c.timezone || 'Asia/Kolkata')} onwards`,
      `session-${s.id}`,
    );
    return { cancelled: later.length };
  }

  const { error } = await db.from('sessions').update({ status: 'cancelled' }).eq('id', s.id);
  if (error) throw error;
  if (s.calendar_event_id) {
    const token = await accessTokenFor(db, trainerId);
    await deleteEvent(token, s.calendar_event_id, s.send_invite);
  }
  await notify(
    db,
    clients,
    () => `Session cancelled: ${s.title}`,
    (c) => when(s.starts_at, c.timezone || 'Asia/Kolkata'),
    `session-${s.id}`,
  );
  return { cancelled: 1 };
}

// ---------------------------------------------------------------------------
// OAuth callback (GET): store the token, send the trainer to a "connected" page
// ---------------------------------------------------------------------------
async function callback(url: URL): Promise<Response> {
  const done = (result: string) =>
    Response.redirect(`${APP_URL}/google-connected.html?result=${encodeURIComponent(result)}`, 302);
  try {
    if (url.searchParams.get('error')) return done('denied');
    const code = url.searchParams.get('code');
    const uid = await readState(url.searchParams.get('state') ?? '');
    if (!code || !uid) return done('expired');
    const db = adminClient();
    const { data: who } = await db
      .from('profiles')
      .select('role, is_active')
      .eq('id', uid)
      .maybeSingle();
    if (!who || !who.is_active || who.role !== 'trainer') return done('not_trainer');
    const t = await exchangeCode(code).catch((e: Error) => {
      throw new Error(
        e.message === 'calendar_not_allowed' ? 'calendar_not_allowed' : 'exchange_failed',
      );
    });
    const { data: old } = await db
      .from('integration_tokens')
      .select('refresh_token_encrypted')
      .eq('owner_id', uid)
      .eq('provider', 'google_calendar')
      .maybeSingle();
    const { error } = await db.from('integration_tokens').upsert(
      {
        owner_id: uid,
        provider: 'google_calendar',
        refresh_token_encrypted: await encryptToken(t.refreshToken),
        google_email: t.email,
        scope: t.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,provider' },
    );
    if (error) throw error;
    // A different Google account replaced an older connection: let the old one go.
    if (old) {
      const prev = await decryptToken(old.refresh_token_encrypted).catch(() => null);
      if (prev && prev !== t.refreshToken) await revoke(prev);
    }
    return done('ok');
  } catch (err) {
    const reason =
      err instanceof Error && err.message === 'calendar_not_allowed'
        ? 'calendar_not_allowed'
        : 'failed';
    console.error('Google connect failed:', err instanceof Error ? err.message : String(err));
    return done(reason);
  }
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname.endsWith('/callback')) return await callback(url);

  return await handleJson(req, async () => {
    const db = adminClient();
    const caller = await requireCaller(req, db);
    if (caller.role !== 'trainer') throw new HttpError(403, 'Trainers only', 'forbidden');
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    switch (body.action) {
      case 'status': {
        const { data } = await db
          .from('integration_tokens')
          .select('google_email')
          .eq('owner_id', caller.id)
          .eq('provider', 'google_calendar')
          .maybeSingle();
        return {
          configured: googleConfigured(),
          connected: Boolean(data),
          email: data?.google_email ?? null,
        };
      }
      case 'auth_url':
        return { url: await authUrl(caller.id) };
      case 'disconnect': {
        const { data } = await db
          .from('integration_tokens')
          .select('refresh_token_encrypted')
          .eq('owner_id', caller.id)
          .eq('provider', 'google_calendar')
          .maybeSingle();
        if (data) {
          const t = await decryptToken(data.refresh_token_encrypted).catch(() => null);
          if (t) await revoke(t);
          await db
            .from('integration_tokens')
            .delete()
            .eq('owner_id', caller.id)
            .eq('provider', 'google_calendar');
        }
        return { connected: false };
      }
      case 'create':
        return await create(db, caller.id, parse(Create, body));
      case 'update':
        return await update(db, caller.id, parse(Update, body));
      case 'cancel':
        return await cancel(db, caller.id, parse(Cancel, body));
      default:
        throw new HttpError(400, 'Unknown action', 'invalid_input');
    }
  });
});
