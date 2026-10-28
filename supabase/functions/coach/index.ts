// coach: the AI coach (see the ai_coach migration).
// Head coach (Claude, header x-coach-key = COACH_API_KEY):
//   { action: 'digest' }                       everyone on the AI coach: day summary, meals to
//                                              check (1-hour photo links), open questions, playbook
//   { action: 'start_run' }                    → { run_id, mode }
//   { action: 'apply', run_id, actions: [] }   each action is checked against the safety rules;
//                                              dry_run = proposed only, live = small changes applied
//   { action: 'finish_run', run_id, report, people?, photos? }
// Scheduler (pg_cron, x-cron-secret): { action: 'tick' } morning/evening notes from the day coach
//   and a "head coach didn't run" alert for admins at 9 AM IST.
// Client (JWT, mapped to the AI coach): { action: 'ask', question }  "Ask the coach".
// The head coach key may also run 'setup' and 'note_now' (bootstrap and testing).
// Admin (JWT): setup | set_mode | approve | reject | undo | answer | save_playbook | note_now
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { generateJsonVia, KANNADA_CHAIN, TEXT_CHAIN } from '../_shared/ai.ts';
import { adminClient, requireCaller } from '../_shared/auth.ts';
import {
  activePlan,
  addDays,
  adminIds,
  ASK_SCHEMA,
  ASK_SYSTEM,
  calorieFloor,
  chatSummary,
  coachAccount,
  coachedPeople,
  coachMode,
  currentTarget,
  escalatedLine,
  isCoached,
  isRedFlag,
  latestWeight,
  mentionsSymptom,
  loadCoachedPerson,
  loadPerson,
  localDate,
  localMinutes,
  NOTE_SCHEMA,
  NOTE_SYSTEM,
  personSummary,
  playbookFor,
  redFlagReply,
  requiredTags,
  type CoachPerson,
} from '../_shared/coach.ts';
import { clientBackground } from '../_shared/background.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import { sameSecret } from '../_shared/util.ts';

type Db = SupabaseClient;
const IST = 'Asia/Kolkata';
const COACH_EMAIL = 'ai.coach@fitcoach.app';

const push = (db: Db, ids: string[], title: string, body: string, url: string, tag: string) =>
  sendToUsers(db, ids, { title, body: body.slice(0, 180), url, tag }).catch((e) =>
    console.error('push failed', e instanceof Error ? e.message : String(e)),
  );

// ---------------------------------------------------------------------------
// Actions from the head coach (also used for admin approvals)
// ---------------------------------------------------------------------------
const Item = z.object({
  name: z.string().trim().min(1).max(80),
  portion: z.string().trim().max(80).default(''),
  calories: z.number().min(0).max(5000),
  protein_g: z.number().min(0).max(500).default(0),
  carbs_g: z.number().min(0).max(1000).default(0),
  fat_g: z.number().min(0).max(500).default(0),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('check_meal'), meal_id: uuid }),
  z.object({
    kind: z.literal('correct_meal'),
    meal_id: uuid,
    items: z.array(Item).min(1).max(20),
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({
    kind: z.literal('day_plan'),
    client_id: uuid,
    date: day,
    plan: z.enum(['workout', 'light', 'rest']),
    plan_day_id: uuid.nullable().optional(),
    note: z.string().trim().max(500).optional(),
    kcal_adjust: z.number().int().min(-200).max(200).default(0),
  }),
  z.object({
    kind: z.literal('note'),
    client_id: uuid,
    date: day,
    text: z.string().trim().min(1).max(1500),
  }),
  z.object({ kind: z.literal('answer'), query_id: uuid, text: z.string().trim().min(1).max(2000) }),
  z.object({
    kind: z.literal('playbook'),
    client_id: uuid.nullable(),
    body: z.string().max(20000),
  }),
  z.object({
    kind: z.literal('target'),
    client_id: uuid,
    calories: z.number().int(),
    protein_g: z.number().int(),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    kind: z.literal('assign_plan'),
    client_id: uuid,
    plan_id: uuid,
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    kind: z.literal('flag'),
    client_id: uuid.nullable().optional(),
    text: z.string().trim().min(1).max(1000),
  }),
]);
type ActionInput = z.infer<typeof Action>;

/** Always waits for the admin's OK, even in live mode. */
const NEEDS_APPROVAL = new Set(['target', 'assign_plan']);

interface Ctx {
  db: Db;
  coachId: string;
  people: Map<string, CoachPerson>;
}

class Refused extends Error {}

async function personOf(ctx: Ctx, clientId: string) {
  const known = ctx.people.get(clientId);
  if (known) return known;
  const p = await loadCoachedPerson(ctx.db, ctx.coachId, clientId);
  if (!p) throw new Refused('This person is not on the AI coach');
  ctx.people.set(clientId, p);
  return p;
}

const totalsOf = (items: z.infer<typeof Item>[]) => ({
  total_calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
  protein_g: Math.round(items.reduce((s, i) => s + i.protein_g, 0) * 10) / 10,
  carbs_g: Math.round(items.reduce((s, i) => s + i.carbs_g, 0) * 10) / 10,
  fat_g: Math.round(items.reduce((s, i) => s + i.fat_g, 0) * 10) / 10,
});

/**
 * Check one action against the safety rules and, when `apply` is true, carry it out.
 * Returns the row to store in coach_actions (kind may change: a big correction becomes a
 * suggestion the person accepts or not).
 */
async function runAction(ctx: Ctx, a: ActionInput, apply: boolean) {
  const { db } = ctx;
  const now = new Date().toISOString();

  switch (a.kind) {
    case 'check_meal':
    case 'correct_meal': {
      const { data: meal } = await db
        .from('meal_logs')
        .select(
          'id, client_id, items, total_calories, protein_g, carbs_g, fat_g, edited, coach_original',
        )
        .eq('id', a.meal_id)
        .maybeSingle();
      if (!meal) throw new Refused('Meal not found');
      await personOf(ctx, meal.client_id);
      const before = {
        items: meal.items,
        total_calories: meal.total_calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
      };
      if (a.kind === 'check_meal') {
        if (apply) await db.from('meal_logs').update({ coach_checked_at: now }).eq('id', meal.id);
        return { kind: a.kind, client_id: meal.client_id, target_id: meal.id, before: null };
      }
      const t = totalsOf(a.items);
      const diff = Math.abs(t.total_calories - Number(meal.total_calories));
      // Big = more than 300 kcal, or more than 150 kcal and over 60% of the meal.
      const big =
        diff > 300 || (diff > 150 && meal.total_calories > 0 && diff / meal.total_calories > 0.6);
      // The person's own edits, and big changes, are only suggested.
      if (meal.edited || big) {
        if (apply) {
          await db
            .from('meal_logs')
            .update({
              coach_suggestion: { items: a.items, ...t, reason: a.reason },
              coach_checked_at: now,
            })
            .eq('id', meal.id);
        }
        return { kind: 'suggest_meal', client_id: meal.client_id, target_id: meal.id, before };
      }
      if (apply) {
        await db
          .from('meal_logs')
          .update({
            items: a.items,
            ...t,
            coach_original: meal.coach_original ?? before,
            coach_reason: a.reason,
            coach_checked_at: now,
            coach_suggestion: null,
          })
          .eq('id', meal.id);
      }
      return { kind: a.kind, client_id: meal.client_id, target_id: meal.id, before };
    }

    case 'day_plan': {
      const p = await personOf(ctx, a.client_id);
      const today = localDate(p.timezone || IST);
      if (a.date !== today && a.date !== addDays(today, 1)) {
        throw new Refused('A day plan can only be for today or tomorrow');
      }
      if (a.plan_day_id) {
        const plan = await activePlan(db, p.id);
        const dayRow = plan?.days.find((d) => d.id === a.plan_day_id);
        if (!dayRow) throw new Refused('That workout day is not in their active plan');
        const need = requiredTags(p, today);
        const unsafe = dayRow.exercises.filter((e) => need.some((t) => !e.tags.includes(t)));
        if (unsafe.length) {
          throw new Refused(
            `Not safe for this person (${need.join(', ')}): ${unsafe.map((e) => e.name).join(', ')}`,
          );
        }
      }
      const { data: prev } = await db
        .from('coach_day_plans')
        .select('*')
        .eq('client_id', p.id)
        .eq('plan_date', a.date)
        .maybeSingle();
      if (apply) {
        await db.from('coach_day_plans').upsert({
          client_id: p.id,
          plan_date: a.date,
          kind: a.plan,
          plan_day_id: a.plan_day_id ?? null,
          note: a.note ?? null,
          kcal_adjust: a.kcal_adjust,
          status: 'active',
        });
      }
      return { kind: a.kind, client_id: p.id, target_id: a.date, before: prev };
    }

    case 'note': {
      const p = await personOf(ctx, a.client_id);
      const today = localDate(p.timezone || IST);
      if (a.date !== today) throw new Refused('Notes are for today only');
      const { data: prev } = await db
        .from('coach_notes')
        .select('body, status')
        .eq('client_id', p.id)
        .eq('note_date', a.date)
        .eq('kind', 'head')
        .maybeSingle();
      if (apply) {
        await db.from('coach_notes').upsert(
          {
            client_id: p.id,
            note_date: a.date,
            kind: 'head',
            body: a.text,
            source: 'claude',
            status: 'shared',
          },
          { onConflict: 'client_id,note_date,kind' },
        );
        await push(
          db,
          [p.id],
          p.language === 'kn' ? 'ನಿಮ್ಮ ಕೋಚ್‌ನ ಇಂದಿನ ಸಂದೇಶ 🌞' : "Your coach's note for today 🌞",
          a.text,
          '/today',
          'coach-note',
        );
      }
      return { kind: a.kind, client_id: p.id, target_id: a.date, before: prev };
    }

    case 'answer': {
      const { data: q } = await db
        .from('coach_queries')
        .select('id, client_id, follow_up, status')
        .eq('id', a.query_id)
        .maybeSingle();
      if (!q) throw new Refused('Question not found');
      const p = await personOf(ctx, q.client_id);
      if (apply) {
        await db
          .from('coach_queries')
          .update({
            follow_up: a.text,
            follow_up_by: 'claude',
            followed_up_at: now,
            status: 'resolved',
          })
          .eq('id', q.id);
        await push(
          db,
          [p.id],
          p.language === 'kn' ? 'ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರ 💬' : 'Your coach answered 💬',
          a.text,
          '/coach',
          'coach-answer',
        );
      }
      return { kind: a.kind, client_id: p.id, target_id: q.id, before: q };
    }

    case 'playbook': {
      if (a.client_id) await personOf(ctx, a.client_id);
      const q = db.from('coach_playbook').select('id, body');
      const { data: prev } = await (
        a.client_id ? q.eq('client_id', a.client_id) : q.is('client_id', null)
      ).maybeSingle();
      if (apply) {
        if (prev) {
          await db
            .from('coach_playbook')
            .update({ body: a.body, updated_by: 'claude', updated_at: now })
            .eq('id', prev.id);
        } else {
          await db
            .from('coach_playbook')
            .insert({ client_id: a.client_id, body: a.body, updated_by: 'claude' });
        }
      }
      return {
        kind: a.kind,
        client_id: a.client_id,
        target_id: a.client_id ?? 'shared',
        before: prev ? { body: prev.body } : null,
      };
    }

    case 'target': {
      const p = await personOf(ctx, a.client_id);
      const today = localDate(p.timezone || IST);
      const cur = await currentTarget(db, p.id, today);
      const floor = calorieFloor(p);
      if (a.calories < floor) throw new Refused(`Calories below the safe floor (${floor} kcal)`);
      if (cur && Math.abs(a.calories - cur.calories) > cur.calories * 0.1 + 1) {
        throw new Refused('A target may change by at most 10% at a time');
      }
      const weight = (await latestWeight(db, p.id))[0]?.weight_kg;
      if (weight && (a.protein_g < weight * 0.8 - 1 || a.protein_g > weight * 2.5)) {
        throw new Refused('Protein must be between 0.8 and 2.5 g per kg of body weight');
      }
      let after: Record<string, unknown> = {};
      if (apply) {
        const fat = Math.round((a.calories * 0.25) / 9);
        const carbs = Math.max(0, Math.round((a.calories - a.protein_g * 4 - fat * 9) / 4));
        const { data: row, error } = await db
          .from('targets')
          .insert({
            client_id: p.id,
            calories: a.calories,
            protein_g: a.protein_g,
            carbs_g: carbs,
            fat_g: fat,
            water_ml: cur?.water_ml ?? null,
            effective_from: today,
            set_by: ctx.coachId,
          })
          .select('id')
          .single();
        if (error) throw error;
        after = { target_row_id: row.id };
      }
      return { kind: a.kind, client_id: p.id, target_id: p.id, before: cur, extra: after };
    }

    case 'assign_plan': {
      const p = await personOf(ctx, a.client_id);
      // Assisted clients: their trainer owns the plan – the coach only picks days in it.
      if (p.supervisor) throw new Refused(`${p.supervisor.name} manages this person's plan`);
      // Assisted clients: their trainer owns the plan – the coach only picks days in it.
      if (p.supervisor) throw new Refused();
      const { data: plan } = await db
        .from('workout_plans')
        .select('id, trainer_id')
        .eq('id', a.plan_id)
        .maybeSingle();
      if (!plan || plan.trainer_id !== ctx.coachId) throw new Refused('Only the coach’s own plans');
      const { data: ex } = await db
        .from('plan_days')
        .select('plan_exercises(exercises(name, safety_tags))')
        .eq('plan_id', plan.id);
      const need = requiredTags(p, localDate(p.timezone || IST));
      // deno-lint-ignore no-explicit-any
      const unsafe = ((ex ?? []) as any[])
        .flatMap((d) => d.plan_exercises ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((pe: any) => need.some((t) => !(pe.exercises?.safety_tags ?? []).includes(t)))
        // deno-lint-ignore no-explicit-any
        .map((pe: any) => pe.exercises?.name);
      if (unsafe.length) throw new Refused(`Plan not safe for this person: ${unsafe.join(', ')}`);
      const current = await activePlan(db, p.id);
      if (apply) {
        const { error } = await db
          .from('plan_assignments')
          .insert({ plan_id: plan.id, client_id: p.id, is_active: true, assigned_by: ctx.coachId });
        if (error) throw error;
      }
      return {
        kind: a.kind,
        client_id: p.id,
        target_id: plan.id,
        before: current ? { plan_id: current.id } : null,
      };
    }

    case 'flag': {
      let name = '';
      let to: string[] | null = null;
      if (a.client_id) {
        const p = await personOf(ctx, a.client_id);
        name = p.full_name ?? '';
        if (p.supervisor) to = [p.supervisor.id];
      }
      if (apply) {
        await push(
          db,
          to ?? (await adminIds(db)),
          `Coach flag${name ? `: ${name}` : ''}`,
          a.text,
          '/admin',
          'coach-flag',
        );
      }
      return { kind: a.kind, client_id: a.client_id ?? null, target_id: null, before: null };
    }
  }
}

/** Assisted clients: the trainer approves, unless they chose to let small changes apply. */
async function needsTrainerOk(ctx: Ctx, input: ActionInput) {
  let clientId: string | null = 'client_id' in input ? (input.client_id ?? null) : null;
  if (!clientId && 'meal_id' in input) {
    const { data } = await ctx.db
      .from('meal_logs')
      .select('client_id')
      .eq('id', input.meal_id)
      .maybeSingle();
    clientId = data?.client_id ?? null;
  }
  if (!clientId && 'query_id' in input) {
    const { data } = await ctx.db
      .from('coach_queries')
      .select('client_id')
      .eq('id', input.query_id)
      .maybeSingle();
    clientId = data?.client_id ?? null;
  }
  if (!clientId) return false;
  const p = await personOf(ctx, clientId).catch(() => null);
  return Boolean(p?.supervisor && !p.supervisor.auto_apply);
}

async function recordAction(
  ctx: Ctx,
  runId: string | null,
  input: ActionInput,
  mode: 'dry_run' | 'live',
) {
  const proposeOnly =
    mode === 'dry_run' || NEEDS_APPROVAL.has(input.kind) || (await needsTrainerOk(ctx, input));
  try {
    const r = await runAction(ctx, input, !proposeOnly);
    const reason = 'reason' in input ? input.reason : 'note' in input ? (input.note ?? null) : null;
    const { data, error } = await ctx.db
      .from('coach_actions')
      .insert({
        run_id: runId,
        client_id: r.client_id,
        kind: r.kind,
        target_id: r.target_id,
        before: r.before ?? null,
        after: { ...input, ...('extra' in r ? r.extra : {}) },
        reason,
        status: proposeOnly ? 'proposed' : 'applied',
      })
      .select('id, kind, status')
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    if (!(err instanceof Refused)) throw err;
    // Only keep the person link when they really are on the coach (an unknown id would
    // break the insert).
    const cid = 'client_id' in input ? (input.client_id ?? null) : null;
    const { data } = await ctx.db
      .from('coach_actions')
      .insert({
        run_id: runId,
        client_id: cid && ctx.people.has(cid) ? cid : null,
        kind: input.kind,
        after: input,
        status: 'refused',
        refused_reason: err.message,
      })
      .select('id, kind, status, refused_reason')
      .single();
    return data ?? { kind: input.kind, status: 'refused', refused_reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Undo (admin)
// ---------------------------------------------------------------------------
async function undo(ctx: Ctx, id: string) {
  const { db } = ctx;
  const { data: a } = await db.from('coach_actions').select('*').eq('id', id).maybeSingle();
  if (!a) throw new HttpError(404, 'Change not found', 'not_found');
  if (a.status !== 'applied')
    throw new HttpError(400, 'Only applied changes can be undone', 'bad_state');
  const before = a.before as Record<string, unknown> | null;
  const after = a.after as Record<string, unknown>;
  switch (a.kind) {
    case 'correct_meal':
      await db
        .from('meal_logs')
        .update({ ...(before ?? {}), coach_original: null, coach_reason: null })
        .eq('id', a.target_id);
      break;
    case 'suggest_meal':
      await db.from('meal_logs').update({ coach_suggestion: null }).eq('id', a.target_id);
      break;
    case 'check_meal':
      await db.from('meal_logs').update({ coach_checked_at: null }).eq('id', a.target_id);
      break;
    case 'day_plan':
      if (before) await db.from('coach_day_plans').upsert(before);
      else {
        await db
          .from('coach_day_plans')
          .update({ status: 'undone' })
          .eq('client_id', a.client_id)
          .eq('plan_date', a.target_id);
      }
      break;
    case 'note':
      if (before) {
        await db
          .from('coach_notes')
          .update(before)
          .eq('client_id', a.client_id)
          .eq('note_date', a.target_id)
          .eq('kind', 'head');
      } else {
        await db
          .from('coach_notes')
          .update({ status: 'undone' })
          .eq('client_id', a.client_id)
          .eq('note_date', a.target_id)
          .eq('kind', 'head');
      }
      break;
    case 'answer':
      await db
        .from('coach_queries')
        .update({
          follow_up: (before?.follow_up as string | null) ?? null,
          status: (before?.status as string) ?? 'escalated',
          follow_up_by: null,
          followed_up_at: null,
        })
        .eq('id', a.target_id);
      break;
    case 'playbook': {
      const q = db
        .from('coach_playbook')
        .update({ body: (before?.body as string) ?? '', updated_by: 'admin' });
      await (a.client_id ? q.eq('client_id', a.client_id) : q.is('client_id', null));
      break;
    }
    case 'target':
      if (after.target_row_id) await db.from('targets').delete().eq('id', after.target_row_id);
      break;
    case 'assign_plan':
      if (before?.plan_id) {
        await db.from('plan_assignments').insert({
          plan_id: before.plan_id,
          client_id: a.client_id,
          is_active: true,
          assigned_by: ctx.coachId,
        });
      } else {
        await db
          .from('plan_assignments')
          .update({ is_active: false })
          .eq('client_id', a.client_id)
          .eq('plan_id', a.target_id)
          .eq('is_active', true);
      }
      break;
    default:
      throw new HttpError(400, 'This change cannot be undone', 'bad_state');
  }
  await db
    .from('coach_actions')
    .update({ status: 'undone', decided_at: new Date().toISOString() })
    .eq('id', id);
  return { status: 'undone' };
}

// ---------------------------------------------------------------------------
// Head coach: digest
// ---------------------------------------------------------------------------
async function digest(db: Db, coachId: string) {
  const people = await coachedPeople(db, coachId);
  let photos = 0;
  // Several people at a time (each needs ~20 small queries); 50 people stay well inside the
  // function time limit.
  const one = async (p: CoachPerson) => {
    const today = localDate(p.timezone || IST);
    const [summary, playbook, background, meals, questions] = await Promise.all([
      personSummary(db, p, today),
      playbookFor(db, p.id),
      clientBackground(db, p, today),
      db
        .from('meal_logs')
        .select(
          'id, eaten_on, eaten_at, meal_type, source, input_text, items, total_calories, edited, photo_path, coach_suggestion',
        )
        .eq('client_id', p.id)
        .gte('eaten_on', addDays(today, -2))
        .is('coach_checked_at', null)
        .order('eaten_at'),
      db
        .from('coach_queries')
        .select('id, question, answer, status, red_flag, escalate_reason, created_at')
        .eq('client_id', p.id)
        .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
        .order('created_at'),
    ]);
    const toCheck = [];
    for (const m of meals.data ?? []) {
      let photo_url: string | null = null;
      if (m.photo_path) {
        const { data } = await db.storage.from('meal-photos').createSignedUrl(m.photo_path, 3600);
        photo_url = data?.signedUrl ?? null;
        if (photo_url) photos++;
      }
      toCheck.push({
        meal_id: m.id,
        date: m.eaten_on,
        meal_type: m.meal_type,
        source: m.source,
        typed_text: m.input_text,
        edited_by_person: m.edited,
        items: m.items,
        total_kcal: m.total_calories,
        photo_url,
      });
    }
    return {
      client_id: p.id,
      today,
      // "AI-only" (admin approves) or the human trainer the AI assists (they approve).
      coached_by: p.supervisor ? `AI assistant to trainer ${p.supervisor.name}` : 'AI-only',
      summary,
      background,
      person_playbook: playbook.person,
      meals_to_check: toCheck,
      questions_last_3_days: questions.data ?? [],
    };
  };
  const out = [];
  for (let i = 0; i < people.length; i += 5) {
    out.push(...(await Promise.all(people.slice(i, i + 5).map(one))));
  }
  const { data: shared } = await db
    .from('coach_playbook')
    .select('body')
    .is('client_id', null)
    .maybeSingle();
  const { data: plans } = await db
    .from('workout_plans')
    .select('id, name, description, plan_days(id, day_index, title)')
    .eq('trainer_id', coachId);
  return {
    mode: await coachMode(db),
    generated_at: new Date().toISOString(),
    shared_playbook: shared?.body ?? '',
    coach_plans: plans ?? [],
    people: out,
    photos,
  };
}

// ---------------------------------------------------------------------------
// Day coach: notes and questions
// ---------------------------------------------------------------------------
async function writeNote(db: Db, p: CoachPerson, kind: 'morning' | 'evening') {
  const today = localDate(p.timezone || IST);
  const [summary, playbook, background] = await Promise.all([
    personSummary(db, p, today),
    playbookFor(db, p.id),
    clientBackground(db, p, today),
  ]);
  const { data, model } = await generateJsonVia({
    chain: p.language === 'kn' ? KANNADA_CHAIN : TEXT_CHAIN,
    system: NOTE_SYSTEM,
    parts: [
      {
        text: `Note type: ${kind}.\nCoach playbook (shared):\n${playbook.shared}\nCoach playbook (this person):\n${playbook.person}\nClient background (last 30–90 days): ${JSON.stringify(background)}\nPerson today: ${JSON.stringify(chatSummary(summary))}`,
      },
    ],
    schema: NOTE_SCHEMA,
    feature: 'coach-note',
    maxTokens: 500,
    accept: (j) => {
      const t = String((j as { note?: unknown } | null)?.note ?? '').trim();
      return t.length >= 20 ? t.slice(0, 1500) : null;
    },
  });
  await db
    .from('coach_notes')
    .upsert(
      { client_id: p.id, note_date: today, kind, body: data, source: 'ai', status: 'shared' },
      { onConflict: 'client_id,note_date,kind' },
    );
  const kn = p.language === 'kn';
  await push(
    db,
    [p.id],
    kind === 'morning'
      ? kn
        ? 'ಶುಭೋದಯ! ಇಂದಿನ ಯೋಜನೆ 🌞'
        : 'Good morning! Your plan for today 🌞'
      : kn
        ? 'ಇಂದಿನ ದಿನ ಹೇಗಿತ್ತು 🌙'
        : 'How today went 🌙',
    data,
    '/today',
    `coach-${kind}`,
  );
  return { note: data, model };
}

async function tick(db: Db) {
  const coach = await coachAccount(db);
  if (!coach) return { skipped: 'no coach' };
  const mode = await coachMode(db);
  if (mode === 'off') return { skipped: 'off' };
  let written = 0;
  const people = await coachedPeople(db, coach.id);
  for (const p of people) {
    if (written >= 25) break; // the rest next run (every 30 minutes)
    const tz = p.timezone || IST;
    const min = localMinutes(tz);
    const today = localDate(tz);
    const kind = min >= 510 && min < 720 ? 'morning' : min >= 1230 && min < 1380 ? 'evening' : null;
    if (!kind) continue;
    const { data: notes } = await db
      .from('coach_notes')
      .select('kind')
      .eq('client_id', p.id)
      .eq('note_date', today);
    const have = new Set((notes ?? []).map((n) => n.kind));
    // The head coach's note counts as the morning note.
    if (have.has(kind) || (kind === 'morning' && have.has('head'))) continue;
    try {
      await writeNote(db, p, kind);
      written++;
    } catch (err) {
      console.error('coach note failed', err instanceof Error ? err.message : String(err));
    }
  }

  // 9 AM IST: tell the admins if the head coach hasn't run today.
  const istMin = localMinutes(IST);
  const istDay = localDate(IST);
  if (istMin >= 540 && istMin < 600 && people.length) {
    const { count } = await db
      .from('coach_runs')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', `${istDay}T00:00:00+05:30`);
    if (!count) {
      const admins = await adminIds(db);
      for (const id of admins) {
        const { error } = await db
          .from('notification_log')
          .insert({ user_id: id, kind: 'coach_missed', ref_date: istDay });
        if (!error) {
          await push(
            db,
            [id],
            'Head coach did not run today',
            'The app is using the normal plans today. Check the AI Coach tab.',
            '/admin',
            'coach-missed',
          );
        }
      }
    }
  }
  return { written };
}

/** The last messages with the coach (3 days), so follow-up questions make sense. */
async function recentChat(db: Db, clientId: string) {
  const { data } = await db
    .from('coach_queries')
    .select('question, answer, follow_up, follow_up_by, created_at')
    .eq('client_id', clientId)
    .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? [])
    .reverse()
    .map((q) => {
      const answer = String(q.answer ?? '')
        .replace(escalatedLine('en'), '')
        .replace(escalatedLine('kn'), '')
        .trim();
      return [
        `Person: ${q.question}`,
        answer ? `Coach: ${answer}` : '',
        q.follow_up ? `${q.follow_up_by === 'admin' ? 'Admin' : 'Head coach'}: ${q.follow_up}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

async function ask(db: Db, clientId: string, question: string) {
  const coach = await coachAccount(db);
  const p = coach ? await loadCoachedPerson(db, coach.id, clientId) : null;
  if (!p) {
    throw new HttpError(403, 'Ask the coach is for people on the AI coach.', 'forbidden');
  }
  if (!p.coach_consent_at) {
    throw new HttpError(403, 'Please accept the AI coach terms first.', 'no_consent');
  }
  const { count } = await db
    .from('coach_queries')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 20) {
    throw new HttpError(
      429,
      "You've asked 20 questions today. Please try again tomorrow.",
      'rate_limited',
    );
  }
  // Questions are usually in the person's app language; a Kannada message gets Kannada.
  const lang = /[ಀ-೿]/.test(question) ? 'kn' : 'en';

  let reply: string;
  let status = 'answered';
  let red = false;
  let reason: string | null = null;
  let model: string | null = null;
  if (isRedFlag(question)) {
    reply = redFlagReply(lang);
    red = true;
    status = 'escalated';
    reason = 'Red-flag words in the message';
  } else {
    const today = localDate(p.timezone || IST);
    const [summary, playbook, history, background] = await Promise.all([
      personSummary(db, p, today),
      playbookFor(db, p.id),
      recentChat(db, p.id),
      clientBackground(db, p, today),
    ]);
    const r = await generateJsonVia({
      // Qwen writes poor Kannada (26–27 Oct tests): Kannada goes GPT-OSS 120B → Gemini.
      chain: lang === 'kn' ? KANNADA_CHAIN : TEXT_CHAIN,
      system: ASK_SYSTEM,
      parts: [
        {
          text: [
            `Coach playbook (shared):\n${playbook.shared}`,
            `Coach playbook (this person):\n${playbook.person || '(empty)'}`,
            `Client background (last 30–90 days): ${JSON.stringify(background)}`,
            `Person and today's numbers: ${JSON.stringify(chatSummary(summary))}`,
            history
              ? `Conversation so far (oldest first) – the new message may continue it:\n${history}`
              : 'Conversation so far: (this is the first message)',
            `Reply language: ${lang === 'kn' ? 'Kannada (Kannada script)' : 'English'} – the language of the new message.`,
            `New message from ${summary.name}: "${question}"`,
          ].join('\n\n'),
        },
      ],
      schema: ASK_SCHEMA,
      feature: 'coach-ask',
      maxTokens: 450,
      // Chat must feel quick: give up on a slow model sooner.
      timeoutMs: 10_000,
      budgetMs: 22_000,
      accept: (j) => {
        const o = j as {
          reply?: unknown;
          escalate?: unknown;
          red_flag?: unknown;
          reason?: unknown;
        } | null;
        const text = String(o?.reply ?? '').trim();
        return text.length >= 2
          ? {
              reply: text.slice(0, 1500),
              escalate: o?.escalate === true,
              red: o?.red_flag === true,
              reason: String(o?.reason ?? '').slice(0, 300),
            }
          : null;
      },
    });
    model = r.model;
    // The emergency reply only when this message itself is about a symptom (models sometimes
    // flag a normal question because an earlier message mentioned one).
    red = r.data.red && mentionsSymptom(question);
    reply = red ? redFlagReply(lang) : r.data.reply;
    // Pass a topic up once: if the head coach already has an open question from the last
    // 12 hours, don't repeat "I've passed this on" under every answer.
    const { count: open } = await db
      .from('coach_queries')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'escalated')
      .gte('created_at', new Date(Date.now() - 12 * 3_600_000).toISOString());
    if (red || (r.data.escalate && !open)) {
      status = 'escalated';
      reason = r.data.reason || null;
      if (!red) reply = `${reply}\n\n${escalatedLine(lang, p.supervisor?.name.split(' ')[0])}`;
    }
  }

  const { data: row, error } = await db
    .from('coach_queries')
    .insert({
      client_id: clientId,
      question,
      answer: reply,
      model,
      red_flag: red,
      status,
      escalate_reason: reason,
    })
    .select('*')
    .single();
  if (error) throw error;
  if (status === 'escalated') {
    // Assisted: the trainer answers (admins also hear about red flags). AI-only: the admins.
    const to = p.supervisor
      ? [p.supervisor.id, ...(red ? await adminIds(db) : [])]
      : await adminIds(db);
    await push(
      db,
      to,
      red
        ? `⚠️ Red flag from ${p.full_name ?? 'a client'}`
        : `Question for ${p.supervisor ? 'you' : 'the head coach'} – ${p.full_name ?? ''}`,
      question,
      p.supervisor ? '/trainer/assistant' : '/admin',
      'coach-question',
    );
  }
  return row;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const DEFAULT_PLAYBOOK = `Shared coaching rules (edited by the head coach and the admin):
- Be warm, short and practical. Indian home food first. Praise small wins.
- Older adults: walking, chair exercises and gentle yoga first; never push through pain.
- Protein: add dal, curd, paneer, sprouts, chana, soya (eggs/chicken/fish only if the diet allows).
- Tea/coffee with sugar and biscuits add up – suggest less sugar, not none.
- Never comment on medicines, tests or supplements; the doctor decides those.`;

async function setup(db: Db) {
  let coach = await coachAccount(db);
  if (!coach) {
    const { data: created, error } = await db.auth.admin.createUser({
      email: COACH_EMAIL,
      email_confirm: true,
      app_metadata: { role: 'trainer' },
      user_metadata: { full_name: 'FitCoach AI Coach' },
    });
    let id = created?.user?.id;
    if (error) {
      // Already exists from an earlier attempt.
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      id = list?.users.find((u) => u.email === COACH_EMAIL)?.id;
      if (!id) throw error;
    }
    // Nobody logs in as the coach: the account only owns plans and answers.
    await db.auth.admin.updateUserById(id!, { ban_duration: '876000h' });
    const { error: pErr } = await db
      .from('profiles')
      .update({ role: 'trainer', is_ai_coach: true, full_name: 'FitCoach AI Coach' })
      .eq('id', id!);
    if (pErr) throw pErr;
    coach = { id: id!, full_name: 'FitCoach AI Coach' };
  }
  const { data: seeded, error: sErr } = await db.rpc('seed_coach_plans', { coach: coach.id });
  if (sErr) throw sErr;
  const { data: shared } = await db
    .from('coach_playbook')
    .select('id')
    .is('client_id', null)
    .maybeSingle();
  if (!shared) {
    await db
      .from('coach_playbook')
      .insert({ client_id: null, body: DEFAULT_PLAYBOOK, updated_by: 'admin' });
  }
  return { coach_id: coach.id, plans_created: seeded };
}

const AdminBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('set_mode'), mode: z.enum(['off', 'dry_run', 'live']) }),
  z.object({ action: z.literal('approve'), action_id: uuid }),
  z.object({ action: z.literal('approve_many'), action_ids: z.array(uuid).min(1).max(200) }),
  z.object({ action: z.literal('reject'), action_id: uuid }),
  z.object({ action: z.literal('undo'), action_id: uuid }),
  z.object({
    action: z.literal('answer'),
    query_id: uuid,
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal('save_playbook'),
    client_id: uuid.nullable(),
    body: z.string().max(20000),
  }),
  z.object({
    action: z.literal('note_now'),
    client_id: uuid,
    kind: z.enum(['morning', 'evening']),
  }),
  z.object({ action: z.literal('set_assist'), client_id: uuid, on: z.boolean() }),
  z.object({ action: z.literal('set_auto_apply'), on: z.boolean() }),
]);

/** What a trainer may do (for their own clients only – checked in the handler). */
const TRAINER_ACTIONS = new Set([
  'approve',
  'approve_many',
  'reject',
  'undo',
  'answer',
  'save_playbook',
  'set_assist',
  'set_auto_apply',
]);

type Actor = { role: 'admin' | 'trainer'; id: string | null };

/** Apply one proposed change (safety rules are checked again at this moment). */
async function approveOne(
  ctx: Ctx,
  id: string,
): Promise<{ status: 'applied' } | { status: 'refused' | 'bad_state'; reason: string }> {
  const { db } = ctx;
  const { data: a } = await db.from('coach_actions').select('*').eq('id', id).maybeSingle();
  if (!a || a.status !== 'proposed') return { status: 'bad_state', reason: 'Already decided' };
  const input = Action.parse(a.after);
  try {
    const r = await runAction(ctx, input, true);
    await db
      .from('coach_actions')
      .update({
        status: 'applied',
        kind: r.kind,
        before: r.before ?? null,
        after: { ...input, ...('extra' in r ? r.extra : {}) },
        decided_at: new Date().toISOString(),
      })
      .eq('id', a.id);
    return { status: 'applied' };
  } catch (err) {
    if (!(err instanceof Refused)) throw err;
    await db
      .from('coach_actions')
      .update({ status: 'refused', refused_reason: err.message })
      .eq('id', a.id);
    return { status: 'refused', reason: err.message };
  }
}

async function adminAction(
  db: Db,
  body: z.infer<typeof AdminBody>,
  actor: Actor = { role: 'admin', id: null },
) {
  if (body.action === 'setup') return await setup(db);
  if (body.action === 'set_mode') {
    await db
      .from('app_settings')
      .upsert({ key: 'coach_mode', value: body.mode, updated_at: new Date().toISOString() });
    return { mode: body.mode };
  }
  const coach = await coachAccount(db);
  if (!coach) throw new HttpError(400, 'Set up the AI coach first', 'no_coach');
  const ctx: Ctx = { db, coachId: coach.id, people: new Map() };

  switch (body.action) {
    case 'approve': {
      const r = await approveOne(ctx, body.action_id);
      if (r.status !== 'applied') throw new HttpError(400, r.reason, r.status);
      return r;
    }
    case 'approve_many': {
      // One request for "Approve all": each change is still checked on its own.
      // Several at a time (each one is a few small queries).
      const results: ({ id: string } & Awaited<ReturnType<typeof approveOne>>)[] = [];
      for (let i = 0; i < body.action_ids.length; i += 6) {
        const batch = body.action_ids.slice(i, i + 6);
        results.push(
          ...(await Promise.all(batch.map(async (id) => ({ id, ...(await approveOne(ctx, id)) })))),
        );
      }
      const failed = results.filter((r) => r.status !== 'applied');
      return { applied: results.length - failed.length, failed };
    }
    case 'reject':
      await db
        .from('coach_actions')
        .update({ status: 'rejected', decided_at: new Date().toISOString() })
        .eq('id', body.action_id)
        .eq('status', 'proposed');
      return { status: 'rejected' };
    case 'undo':
      return await undo(ctx, body.action_id);
    case 'answer': {
      const { data: q } = await db
        .from('coach_queries')
        .select('id, client_id')
        .eq('id', body.query_id)
        .maybeSingle();
      if (!q) throw new HttpError(404, 'Question not found', 'not_found');
      const p = await loadPerson(db, q.client_id);
      await db
        .from('coach_queries')
        .update({
          follow_up: body.text,
          follow_up_by: actor.role,
          followed_up_at: new Date().toISOString(),
          status: 'resolved',
        })
        .eq('id', q.id);
      await push(
        db,
        [q.client_id],
        p?.language === 'kn' ? 'ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರ 💬' : 'Your coach answered 💬',
        body.text,
        '/coach',
        'coach-answer',
      );
      return { status: 'resolved' };
    }
    case 'save_playbook': {
      const q = db.from('coach_playbook').select('id');
      const { data: prev } = await (
        body.client_id ? q.eq('client_id', body.client_id) : q.is('client_id', null)
      ).maybeSingle();
      if (prev) {
        await db
          .from('coach_playbook')
          .update({ body: body.body, updated_by: actor.role, updated_at: new Date().toISOString() })
          .eq('id', prev.id);
      } else {
        await db
          .from('coach_playbook')
          .insert({ client_id: body.client_id, body: body.body, updated_by: actor.role });
      }
      return { saved: true };
    }
    case 'note_now': {
      const p = await personOf(ctx, body.client_id);
      return await writeNote(db, p, body.kind);
    }
    case 'set_assist': {
      // On/off for a client with a human trainer (not for people on the AI coach account).
      const { data, error } = await db
        .from('trainer_clients')
        .update({ ai_assist: body.on })
        .eq('client_id', body.client_id)
        .neq('trainer_id', coach.id)
        .select('client_id');
      if (error) throw error;
      if (!data?.length) throw new HttpError(400, 'This person has no human trainer', 'bad_state');
      return { ai_assist: body.on };
    }
    case 'set_auto_apply': {
      if (actor.role !== 'trainer' || !actor.id) {
        throw new HttpError(400, 'This is a trainer setting', 'bad_state');
      }
      await db.from('profiles').update({ ai_auto_apply: body.on }).eq('id', actor.id);
      return { ai_auto_apply: body.on };
    }
  }
}

/** Every client this request touches belongs to the trainer. */
async function trainerOwns(db: Db, trainerId: string, body: z.infer<typeof AdminBody>) {
  const ids: string[] = [];
  if ('action_ids' in body || 'action_id' in body) {
    const list = 'action_ids' in body ? body.action_ids : [body.action_id];
    const { data } = await db.from('coach_actions').select('client_id').in('id', list);
    if ((data ?? []).length !== list.length) return false;
    ids.push(...(data ?? []).map((r) => r.client_id as string | null).filter((x) => x !== null));
    if (ids.length !== list.length) return false;
  } else if ('query_id' in body) {
    const { data } = await db
      .from('coach_queries')
      .select('client_id')
      .eq('id', body.query_id)
      .maybeSingle();
    if (!data) return false;
    ids.push(data.client_id);
  } else if ('client_id' in body) {
    if (!body.client_id) return false; // the shared playbook is admin-only
    ids.push(body.client_id);
  }
  const unique = [...new Set(ids)];
  if (!unique.length) return body.action === 'set_auto_apply';
  const { data: links } = await db
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .in('client_id', unique);
  return (links ?? []).length === unique.length;
}

// ---------------------------------------------------------------------------
serveJson(async (req) => {
  const db = adminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Head coach
  const coachKey = req.headers.get('x-coach-key');
  if (coachKey !== null) {
    if (!sameSecret(coachKey, Deno.env.get('COACH_API_KEY') ?? '')) {
      throw new HttpError(401, 'Not allowed', 'unauthorized');
    }
    if (body.action === 'setup') return await setup(db);
    const coach = await coachAccount(db);
    if (!coach) throw new HttpError(400, 'Set up the AI coach first', 'no_coach');
    const mode = await coachMode(db);
    switch (body.action) {
      case 'note_now': {
        const p = await loadPerson(db, String(body.client_id ?? ''));
        if (!p || !(await isCoached(db, coach.id, p.id)))
          throw new HttpError(404, 'Not on the coach', 'not_found');
        return await writeNote(db, p, body.kind === 'evening' ? 'evening' : 'morning');
      }
      case 'digest':
        return await digest(db, coach.id);
      case 'start_run': {
        if (mode === 'off') throw new HttpError(400, 'The AI coach is switched off', 'off');
        const { data, error } = await db
          .from('coach_runs')
          .insert({ mode, source: body.source === 'claude_api' ? 'claude_api' : 'claude' })
          .select('id, mode')
          .single();
        if (error) throw error;
        return { run_id: data.id, mode: data.mode };
      }
      case 'apply': {
        const runId = String(body.run_id ?? '');
        const { data: run } = await db
          .from('coach_runs')
          .select('id, mode, finished_at')
          .eq('id', runId)
          .maybeSingle();
        if (!run || run.finished_at) throw new HttpError(400, 'Unknown or finished run', 'bad_run');
        const list = z
          .array(z.unknown())
          .max(400)
          .parse(body.actions ?? []);
        const ctx: Ctx = { db, coachId: coach.id, people: new Map() };
        const results = [];
        for (const raw of list) {
          const parsed = Action.safeParse(raw);
          if (!parsed.success) {
            results.push({ status: 'invalid', error: parsed.error.issues[0]?.message });
            continue;
          }
          results.push(
            await recordAction(ctx, run.id, parsed.data, run.mode as 'dry_run' | 'live'),
          );
        }
        return { results };
      }
      case 'finish_run': {
        const runId = String(body.run_id ?? '');
        const report = String(body.report ?? '').slice(0, 20000);
        const { count } = await db
          .from('coach_actions')
          .select('id', { count: 'exact', head: true })
          .eq('run_id', runId);
        await db
          .from('coach_runs')
          .update({
            finished_at: new Date().toISOString(),
            report,
            actions: count ?? 0,
            people: Number(body.people ?? 0) || 0,
            photos: Number(body.photos ?? 0) || 0,
            error: body.error ? String(body.error).slice(0, 2000) : null,
          })
          .eq('id', runId);
        // Test runs (report starting with "TEST") don't notify the admins.
        if (!report.startsWith('TEST')) {
          await push(
            db,
            await adminIds(db),
            'Head coach report is ready',
            report.split('\n').find((l) => l.trim()) ?? 'Open the AI Coach tab.',
            '/admin',
            'coach-report',
          );
          // Each trainer hears how many suggestions wait for them (assisted clients).
          const { data: waiting } = await db
            .from('coach_actions')
            .select('client_id')
            .eq('run_id', runId)
            .eq('status', 'proposed');
          const clientIds = [...new Set((waiting ?? []).map((w) => w.client_id as string))];
          if (clientIds.length) {
            const { data: links } = await db
              .from('trainer_clients')
              .select('client_id, trainer_id')
              .in('client_id', clientIds)
              .eq('ai_assist', true);
            const perTrainer = new Map<string, number>();
            for (const w of waiting ?? []) {
              const t = links?.find((l) => l.client_id === w.client_id)?.trainer_id;
              if (t) perTrainer.set(t, (perTrainer.get(t) ?? 0) + 1);
            }
            for (const [trainerId, n] of perTrainer) {
              await push(
                db,
                [trainerId],
                `Your AI assistant has ${n} suggestion${n === 1 ? '' : 's'}`,
                'Open AI assistant to approve or skip them.',
                '/trainer/assistant',
                'coach-suggestions',
              );
            }
          }
        }
        return { finished: true };
      }
      default:
        throw new HttpError(400, 'Unknown action', 'invalid_input');
    }
  }

  // Scheduler
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== null) {
    if (!sameSecret(cronSecret, Deno.env.get('CRON_SECRET') ?? '')) {
      throw new HttpError(401, 'Not allowed', 'unauthorized');
    }
    return await tick(db);
  }

  // TEMPORARY (remove at go-live with the test users): admin actions on test accounts only,
  // so approve / reject / undo / answer can be tested without an admin login.
  const testSecret = req.headers.get('x-test-secret');
  if (testSecret !== null) {
    if (!sameSecret(testSecret, Deno.env.get('TEST_USERS_SECRET') ?? '')) {
      throw new HttpError(401, 'Not allowed', 'unauthorized');
    }
    const parsed = AdminBody.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid input', 'invalid_input');
    const b = parsed.data;
    let clientId: string | null = null;
    if ('action_ids' in b) {
      const { data } = await db.from('coach_actions').select('client_id').in('id', b.action_ids);
      const ids = [...new Set((data ?? []).map((r) => r.client_id as string | null))];
      for (const id of ids) {
        const p = id ? await loadPerson(db, id) : null;
        if (!p?.email.endsWith('@fitcoach.test')) {
          throw new HttpError(403, 'Test accounts only', 'forbidden');
        }
      }
      return await adminAction(db, b);
    }
    if ('action_id' in b) {
      const { data } = await db
        .from('coach_actions')
        .select('client_id')
        .eq('id', b.action_id)
        .maybeSingle();
      clientId = data?.client_id ?? null;
    } else if ('query_id' in b) {
      const { data } = await db
        .from('coach_queries')
        .select('client_id')
        .eq('id', b.query_id)
        .maybeSingle();
      clientId = data?.client_id ?? null;
    } else if ('client_id' in b) {
      clientId = b.client_id;
    }
    // Cleaning up after a test run: proposals from a run whose report starts with "TEST"
    // may be rejected for anyone (a real person on the coach also gets test proposals).
    let testRunProposal = false;
    if (b.action === 'reject') {
      const { data: a } = await db
        .from('coach_actions')
        .select('status, coach_runs(report)')
        .eq('id', b.action_id)
        .maybeSingle();
      const report = (a as { coach_runs?: { report?: string | null } | null } | null)?.coach_runs
        ?.report;
      testRunProposal = a?.status === 'proposed' && Boolean(report?.startsWith('TEST'));
    }
    if (b.action !== 'set_mode' && b.action !== 'setup' && !testRunProposal) {
      const p = clientId ? await loadPerson(db, clientId) : null;
      if (!p?.email.endsWith('@fitcoach.test')) {
        throw new HttpError(403, 'Test accounts only', 'forbidden');
      }
    }
    return await adminAction(db, b);
  }

  // People in the app
  const caller = await requireCaller(req, db);
  if (body.action === 'ask') {
    const q = z.string().trim().min(1).max(1000).safeParse(body.question);
    if (!q.success)
      throw new HttpError(400, 'Please type a question (up to 1,000 characters).', 'invalid_input');
    return await ask(db, caller.id, q.data);
  }
  const parsed = AdminBody.safeParse(body);
  if (caller.role === 'trainer' && parsed.success && TRAINER_ACTIONS.has(parsed.data.action)) {
    // A trainer approves and answers for their own (assisted) clients only.
    if (!(await trainerOwns(db, caller.id, parsed.data))) {
      throw new HttpError(403, 'This is not your client', 'forbidden');
    }
    return await adminAction(db, parsed.data, { role: 'trainer', id: caller.id });
  }
  if (caller.role !== 'admin') throw new HttpError(403, 'Admins only', 'forbidden');
  if (!parsed.success)
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid_input');
  return await adminAction(db, parsed.data, { role: 'admin', id: caller.id });
});
