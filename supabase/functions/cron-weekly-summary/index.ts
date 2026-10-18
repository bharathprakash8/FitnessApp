// cron-weekly-summary
// - pg_cron, Monday 06:00 IST (x-cron-secret): for every active client, gather last week's
//   numbers (Mon–Sun in the client's time zone), ask Gemini for a short summary for the
//   trainer and save it as a draft. Trainers get one notification each.
// - Trainer (JWT):
//   { action: 'generate', client_id }   summary of the last 7 days now (replaces a draft)
//   { action: 'share' | 'unshare', summary_id }   share with the client (push) / take back
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import { generateJson } from '../_shared/gemini.ts';
import { handleJson, HttpError } from '../_shared/http.ts';

const SYSTEM = `Write a short, encouraging, factual summary for a personal trainer about one client's past week, using only the numbers provided. 4–6 lines. Mention consistency, nutrition vs target, activity, and one thing to focus on next week. Do not give medical advice or diagnose. If intake is far below target or falling sharply, add a neutral note for the trainer to check in. Use simple Indian English. Numbers that are null were not recorded – say so briefly instead of guessing. Return only JSON matching the schema.`;

const SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
};

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------------------------------------------------------------------
// Dates (YYYY-MM-DD in the client's time zone)
// ---------------------------------------------------------------------------
const todayIn = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Monday–Sunday of the week before the one containing `today`. */
function lastWeek(today: string) {
  const monday = addDays(today, 1 - isoWeekday(today));
  return { start: addDays(monday, -7), end: addDays(monday, -1) };
}

const round = (n: number | null, digits = 0) =>
  n === null || !Number.isFinite(n) ? null : Number(n.toFixed(digits));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------------------------------------------------------------------------
// The week's numbers
// ---------------------------------------------------------------------------
interface ClientInfo {
  id: string;
  full_name: string | null;
  timezone: string;
}

const zoneOf = (c: ClientInfo) => c.timezone || 'Asia/Kolkata';

async function weekStats(db: SupabaseClient, c: ClientInfo, start: string, end: string) {
  const [meals, target, logs, plan, activity, weights, sessions, water] = await Promise.all([
    db
      .from('meal_logs')
      .select('eaten_on, total_calories, protein_g')
      .eq('client_id', c.id)
      .gte('eaten_on', start)
      .lte('eaten_on', end),
    db
      .from('targets')
      .select('calories, protein_g')
      .eq('client_id', c.id)
      .lte('effective_from', end)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('workout_logs')
      .select('performed_on, source')
      .eq('client_id', c.id)
      .gte('performed_on', start)
      .lte('performed_on', end),
    db
      .from('plan_assignments')
      .select('workout_plans(name, plan_days(id))')
      .eq('client_id', c.id)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('activity_daily')
      .select('activity_date, active_calories, resting_calories, steps, sleep_minutes')
      .eq('client_id', c.id)
      .gte('activity_date', start)
      .lte('activity_date', end),
    db
      .from('measurements')
      .select('measured_on, weight_kg')
      .eq('client_id', c.id)
      .not('weight_kg', 'is', null)
      .lte('measured_on', end)
      .order('measured_on', { ascending: false })
      .limit(30),
    db
      .from('session_attendees')
      .select('status, sessions!inner(starts_at, status)')
      .eq('client_id', c.id)
      .eq('sessions.status', 'scheduled')
      .gte('sessions.starts_at', `${addDays(start, -1)}T00:00:00Z`)
      .lte('sessions.starts_at', `${addDays(end, 1)}T23:59:59Z`),
    db
      .from('habits_daily')
      .select('water_ml')
      .eq('client_id', c.id)
      .gte('habit_date', start)
      .lte('habit_date', end)
      .gt('water_ml', 0),
  ]);
  for (const r of [meals, target, logs, plan, activity, weights, sessions, water])
    if (r.error) throw r.error;

  // Food: per logged day
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const m of meals.data ?? []) {
    const d = byDay.get(m.eaten_on) ?? { kcal: 0, protein: 0 };
    d.kcal += m.total_calories;
    d.protein += Number(m.protein_g);
    byDay.set(m.eaten_on, d);
  }
  const days = [...byDay.values()];
  const avgKcal = avg(days.map((d) => d.kcal));
  const targetKcal = target.data?.calories ?? null;

  // Workouts
  const workoutDays = new Set((logs.data ?? []).map((l) => l.performed_on));
  const selfDays = new Set(
    (logs.data ?? []).filter((l) => l.source === 'self').map((l) => l.performed_on),
  );
  const planInfo = plan.data?.workout_plans as unknown as {
    name: string;
    plan_days: unknown[];
  } | null;

  // Activity (phone or manual entries)
  const act = activity.data ?? [];
  const active = act.map((a) => a.active_calories).filter((n): n is number => n !== null);
  const totals = act
    .filter((a) => a.active_calories !== null && a.resting_calories !== null)
    .map((a) => a.active_calories! + a.resting_calories!);
  const avgBurn = avg(totals);

  // Weight: last entry in the week vs last entry before it
  const w = weights.data ?? [];
  const endW = w.find((x) => x.measured_on >= start);
  const startW =
    w.find((x) => x.measured_on < start) ??
    (endW ? w.filter((x) => x.measured_on >= start).at(-1) : undefined);

  // Sessions in the period (attendance), by the client's own calendar day
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zoneOf(c) }).format(new Date(iso));
  const s = (sessions.data ?? []).filter((x) => {
    const d = dayOf((x.sessions as unknown as { starts_at: string }).starts_at);
    return d >= start && d <= end;
  });

  return {
    period: { start, end },
    food: {
      days_logged: byDay.size,
      days_without_logs: 7 - byDay.size,
      avg_kcal_on_logged_days: round(avgKcal),
      avg_protein_g: round(avg(days.map((d) => d.protein))),
      target_kcal: targetKcal,
      target_protein_g: target.data?.protein_g ?? null,
      pct_of_target: avgKcal !== null && targetKcal ? round((avgKcal / targetKcal) * 100) : null,
    },
    workouts: {
      days_with_workouts: workoutDays.size,
      plan_name: planInfo?.name ?? null,
      plan_days_per_rotation: planInfo ? planInfo.plan_days.length : null,
      self_workout_days: selfDays.size,
    },
    activity: {
      days_with_data: act.length,
      avg_active_kcal: round(avg(active)),
      avg_total_burn_kcal: round(avgBurn),
      avg_steps: round(avg(act.map((a) => a.steps).filter((n): n is number => n !== null))),
      avg_sleep_hours: round(
        avg(act.map((a) => a.sleep_minutes).filter((n): n is number => n !== null)) === null
          ? null
          : avg(act.map((a) => a.sleep_minutes).filter((n): n is number => n !== null))! / 60,
        1,
      ),
    },
    net_balance_kcal: avgKcal !== null && avgBurn !== null ? round(avgKcal - avgBurn) : null,
    weight: {
      start_kg: startW ? Number(startW.weight_kg) : null,
      end_kg: endW ? Number(endW.weight_kg) : null,
      change_kg:
        startW && endW ? round(Number(endW.weight_kg) - Number(startW.weight_kg), 1) : null,
    },
    water: {
      days_tracked: (water.data ?? []).length,
      avg_litres: round((avg((water.data ?? []).map((w) => w.water_ml)) ?? NaN) / 1000, 1),
    },
    sessions: {
      attended: s.filter((x) => x.status === 'present').length,
      missed: s.filter((x) => x.status === 'missed').length,
      not_marked: s.filter((x) => x.status === 'invited').length,
    },
  };
}

type Stats = Awaited<ReturnType<typeof weekStats>>;

/** Plain fallback when the AI is unavailable, so the trainer still gets the numbers. */
function plainSummary(name: string, s: Stats) {
  const lines = [
    `${name} logged food on ${s.food.days_logged} of 7 days` +
      (s.food.avg_kcal_on_logged_days !== null
        ? `, averaging ${s.food.avg_kcal_on_logged_days} kcal` +
          (s.food.target_kcal ? ` (target ${s.food.target_kcal})` : '')
        : '') +
      '.',
    `Workouts on ${s.workouts.days_with_workouts} days` +
      (s.workouts.self_workout_days ? ` (${s.workouts.self_workout_days} self)` : '') +
      '.',
    s.activity.avg_active_kcal !== null
      ? `Average active burn ${s.activity.avg_active_kcal} kcal over ${s.activity.days_with_data} days.`
      : 'No activity data from the phone this week.',
    s.weight.change_kg !== null
      ? `Weight change ${s.weight.change_kg > 0 ? '+' : ''}${s.weight.change_kg} kg.`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

async function writeSummary(c: ClientInfo, stats: Stats): Promise<string> {
  const name = (c.full_name || 'The client').split(' ')[0]!;
  try {
    const r = (await generateJson({
      system: SYSTEM,
      parts: [
        { text: `Client first name: ${name}\nWeek numbers (JSON):\n${JSON.stringify(stats)}` },
      ],
      schema: SCHEMA,
      temperature: 0.4,
      feature: 'weekly-summary',
    })) as { summary?: unknown };
    const text = typeof r.summary === 'string' ? r.summary.trim() : '';
    if (text.length >= 20) return text.slice(0, 2000);
  } catch (err) {
    console.error('Summary AI failed:', err instanceof Error ? err.message : String(err));
  }
  return plainSummary(name, stats);
}

// ---------------------------------------------------------------------------
// Scheduled run
// ---------------------------------------------------------------------------
async function runWeekly(db: SupabaseClient) {
  const { data: links, error } = await db
    .from('trainer_clients')
    .select(
      'trainer_id, profiles!trainer_clients_client_id_fkey(id, full_name, timezone, is_active, onboarded_at)',
    );
  if (error) throw error;
  let created = 0;
  const perTrainer = new Map<string, number>();
  for (const link of links ?? []) {
    const p = link.profiles as unknown as ClientInfo & {
      is_active: boolean;
      onboarded_at: string | null;
    };
    if (!p?.is_active || !p.onboarded_at) continue;
    const tz = p.timezone || 'Asia/Kolkata';
    const { start, end } = lastWeek(todayIn(tz));
    const { data: existing } = await db
      .from('weekly_summaries')
      .select('id')
      .eq('client_id', p.id)
      .eq('period_start', start)
      .maybeSingle();
    if (existing) continue;
    const stats = await weekStats(db, p, start, end);
    const text = await writeSummary(p, stats);
    const { error: insErr } = await db
      .from('weekly_summaries')
      .insert({ client_id: p.id, period_start: start, period_end: end, stats, summary_text: text });
    if (insErr) {
      console.error('Summary insert failed for a client:', insErr.message);
      continue;
    }
    created++;
    perTrainer.set(link.trainer_id, (perTrainer.get(link.trainer_id) ?? 0) + 1);
  }
  for (const [trainerId, n] of perTrainer) {
    await sendToUsers(db, [trainerId], {
      title: n === 1 ? '1 weekly summary is ready' : `${n} weekly summaries are ready`,
      body: 'Review, edit and share them with your clients.',
      url: '/trainer',
      tag: 'weekly-summaries',
    }).catch(() => undefined);
  }
  return { created };
}

// ---------------------------------------------------------------------------
// Trainer actions
// ---------------------------------------------------------------------------
const Generate = z.object({ action: z.literal('generate'), client_id: z.string().uuid() });
const Share = z.object({ action: z.enum(['share', 'unshare']), summary_id: z.string().uuid() });

async function requireMyClient(db: SupabaseClient, trainerId: string, clientId: string) {
  const { data, error } = await db
    .from('trainer_clients')
    .select('profiles!trainer_clients_client_id_fkey(id, full_name, timezone)')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, 'This client is not assigned to you.', 'forbidden');
  return data.profiles as unknown as ClientInfo;
}

async function generateNow(db: SupabaseClient, trainerId: string, clientId: string) {
  const c = await requireMyClient(db, trainerId, clientId);
  // At most 30 on-demand summaries a day per trainer (Gemini free tier).
  const day = todayIn('Asia/Kolkata');
  const { data: count } = await db.rpc('bump_ai_usage', {
    uid: trainerId,
    day,
    feat: 'weekly-summary',
  });
  if (Number(count ?? 0) > 30)
    throw new HttpError(429, 'Too many summaries today. Try tomorrow.', 'rate_limited');

  const end = todayIn(c.timezone || 'Asia/Kolkata');
  const start = addDays(end, -6);
  const { data: existing } = await db
    .from('weekly_summaries')
    .select('id, status')
    .eq('client_id', c.id)
    .eq('period_start', start)
    .maybeSingle();
  if (existing?.status === 'shared') {
    throw new HttpError(
      409,
      'This summary is already shared. Take it back first to create it again.',
      'already_shared',
    );
  }
  const stats = await weekStats(db, c, start, end);
  const text = await writeSummary(c, stats);
  const { data, error } = await db
    .from('weekly_summaries')
    .upsert(
      {
        client_id: c.id,
        period_start: start,
        period_end: end,
        stats,
        summary_text: text,
        edited: false,
      },
      { onConflict: 'client_id,period_start' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return { summary_id: data.id };
}

async function setShared(db: SupabaseClient, trainerId: string, summaryId: string, share: boolean) {
  const { data: s, error } = await db
    .from('weekly_summaries')
    .select('id, client_id, summary_text, status')
    .eq('id', summaryId)
    .maybeSingle();
  if (error) throw error;
  if (!s) throw new HttpError(404, 'Summary not found', 'not_found');
  await requireMyClient(db, trainerId, s.client_id);
  if (share && !s.summary_text.trim())
    throw new HttpError(400, 'Write the summary first.', 'invalid_input');
  const { error: upErr } = await db
    .from('weekly_summaries')
    .update({
      status: share ? 'shared' : 'draft',
      shared_at: share ? new Date().toISOString() : null,
    })
    .eq('id', s.id);
  if (upErr) throw upErr;
  if (share && s.status !== 'shared') {
    await sendToUsers(db, [s.client_id], {
      title: 'Your weekly summary is ready 📈',
      body: 'See how your week went and what to focus on next.',
      url: '/me/summaries',
      tag: 'weekly-summary',
    }).catch(() => undefined);
  }
  return { status: share ? 'shared' : 'draft' };
}

// ---------------------------------------------------------------------------
Deno.serve((req) =>
  handleJson(req, async () => {
    const db = adminClient();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const given = req.headers.get('x-cron-secret') ?? '';
    if (given && cronSecret && sameSecret(given, cronSecret)) return await runWeekly(db);

    const caller = await requireCaller(req, db);
    if (caller.role !== 'trainer') throw new HttpError(403, 'Trainers only', 'forbidden');
    if (body.action === 'generate') {
      const p = Generate.safeParse(body);
      if (!p.success) throw new HttpError(400, 'Invalid input', 'invalid_input');
      return await generateNow(db, caller.id, p.data.client_id);
    }
    const p = Share.safeParse(body);
    if (!p.success) throw new HttpError(400, 'Unknown action', 'invalid_input');
    return await setShared(db, caller.id, p.data.summary_id, p.data.action === 'share');
  }),
);
