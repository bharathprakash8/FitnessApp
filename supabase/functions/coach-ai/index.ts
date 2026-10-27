// coach-ai: AI help for the Stats tab and the trainer's 7-day food ideas.
//   { action: 'insights', client_id, stats }   3–5 observations + one focus from the Stats
//       numbers (computed in the app). Once per person per day: later calls return the saved
//       set. Caller: the person themself (client or self-tracking trainer), their trainer,
//       or an admin.
//   { action: 'plan_draft', client_id, note?, target_kcal?, target_protein_g? }
//       Trainer only. Drafts 7 days of short meal ideas from the client's last 30 days of
//       food, diet preference, foods to avoid and targets. Totals are added up here, never
//       taken from the AI. Up to 3 drafts per client per day, 30 per trainer per day.
//   { action: 'plan_share' | 'plan_unshare', plan_id }   trainer: share (push) / take back.
// Plans are short on purpose (dish + portion + kcal + protein, no recipes) – see
// docs in CLAUDE.md (21 Oct 2026).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { adminClient, requireCaller, type Caller } from '../_shared/auth.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import { generateJsonVia, TEXT_CHAIN } from '../_shared/ai.ts';
import { generateJson } from '../_shared/gemini.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface Person {
  id: string;
  full_name: string | null;
  timezone: string | null;
  diet_preference: string | null;
  foods_to_avoid: string | null;
  goal: string | null;
  language: string | null;
}

async function loadPerson(db: SupabaseClient, id: string): Promise<Person> {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, timezone, diet_preference, foods_to_avoid, goal, language')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Person not found', 'not_found');
  return data as Person;
}

async function isTrainerOf(db: SupabaseClient, trainerId: string, clientId: string) {
  const { data, error } = await db
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
const Insights = z.object({
  action: z.literal('insights'),
  client_id: z.string().uuid(),
  // Numbers from the Stats tab; kept small. Only ever affects this person's own insights.
  stats: z.record(z.unknown()).refine((s) => JSON.stringify(s).length <= 4000, 'Too much data'),
});

const INSIGHTS_SYSTEM = `You write short observations for a person using an Indian fitness
coaching app, from the numbers given (last 30 days). Give 3 to 5 observations, each one
sentence, factual and specific (use the numbers), friendly and encouraging but not
over-familiar, in simple Indian English. Then one practical thing to focus on next.
Food suggestions must respect the diet preference and foods to avoid. Never give medical
advice, diagnose, or mention supplements or medicines. Return only JSON matching the schema.`;

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    insights: { type: 'array', items: { type: 'string' } },
    focus: { type: 'string' },
  },
  required: ['insights', 'focus'],
};

const InsightsOut = z.object({
  insights: z.array(z.string()).min(1),
  focus: z.string(),
});

async function insights(db: SupabaseClient, caller: Caller, body: z.infer<typeof Insights>) {
  const person = await loadPerson(db, body.client_id);
  const self = caller.id === person.id;
  if (!self && caller.role !== 'admin' && !(await isTrainerOf(db, caller.id, person.id))) {
    throw new HttpError(403, 'Not allowed', 'forbidden');
  }
  const day = todayIn(person.timezone || 'Asia/Kolkata');
  const { data: saved } = await db
    .from('stats_insights')
    .select('insights, focus, made_on')
    .eq('client_id', person.id)
    .eq('made_on', day)
    .maybeSingle();
  if (saved) return saved;

  const prompt = `Diet preference: ${person.diet_preference ?? 'not given'}. Foods to avoid: ${
    person.foods_to_avoid || 'none'
  }. Goal: ${person.goal ?? 'not given'}.\nNumbers: ${JSON.stringify(body.stats)}${
    person.language === 'kn'
      ? '\nWrite the observations and the focus in simple Kannada (Kannada script).'
      : ''
  }`;
  const { data: parsed } = await generateJsonVia({
    chain: TEXT_CHAIN,
    system: INSIGHTS_SYSTEM,
    parts: [{ text: prompt }],
    schema: INSIGHTS_SCHEMA,
    feature: 'stats-insights',
    maxTokens: 700,
    accept: (j) => {
      const p = InsightsOut.safeParse(j);
      return p.success ? p : null;
    },
  });
  const row = {
    client_id: person.id,
    made_on: day,
    period_days: 30,
    insights: parsed.data.insights.slice(0, 5).map((s) => s.trim().slice(0, 300)),
    focus: parsed.data.focus.trim().slice(0, 300),
  };
  // Two people opening Stats at the same moment: keep the first.
  const { error } = await db
    .from('stats_insights')
    .upsert(row, { onConflict: 'client_id,made_on', ignoreDuplicates: true });
  if (error) throw error;
  return { insights: row.insights, focus: row.focus, made_on: day };
}

// ---------------------------------------------------------------------------
// 7-day food ideas
// ---------------------------------------------------------------------------
const PlanDraft = z.object({
  action: z.literal('plan_draft'),
  client_id: z.string().uuid(),
  note: z.string().max(500).optional(),
  target_kcal: z.number().int().min(1000).max(5000).optional(),
  target_protein_g: z.number().int().min(20).max(400).optional(),
});
const PlanShare = z.object({
  action: z.enum(['plan_share', 'plan_unshare']),
  plan_id: z.string().uuid(),
});

const PLAN_SYSTEM = `You suggest 7 days of meal ideas for a client of an Indian fitness coaching
app. For every day give breakfast, lunch, snack and dinner: a familiar home-style Indian dish
(prefer dishes the client already eats, with small improvements), a simple portion, and
realistic estimated kcal and protein in grams. Each day's kcal should add up to within 10% of
the calorie target, and each day's protein should reach the protein target – add protein with
everyday foods (dal, curd, paneer, eggs/chicken/fish only if the diet allows, sprouts,
chana, soya). Strictly follow the diet preference and never use foods to avoid. Vary the days.
No recipes, no medical or diet advice, no supplements. Return only JSON matching the schema.`;

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          meals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                meal: { type: 'string', enum: [...MEALS] },
                dish: { type: 'string' },
                portion: { type: 'string' },
                kcal: { type: 'integer' },
                protein_g: { type: 'integer' },
              },
              required: ['meal', 'dish', 'portion', 'kcal', 'protein_g'],
            },
          },
        },
        required: ['day', 'meals'],
      },
    },
  },
  required: ['days'],
};

const PlanOut = z.object({
  days: z
    .array(
      z.object({
        day: z.number(),
        meals: z.array(
          z.object({
            meal: z.enum(MEALS),
            dish: z.string(),
            portion: z.string(),
            kcal: z.number(),
            protein_g: z.number(),
          }),
        ),
      }),
    )
    .min(1),
});

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** What the client usually eats (last 30 days), for the AI. */
async function foodPattern(db: SupabaseClient, person: Person) {
  const tz = person.timezone || 'Asia/Kolkata';
  const today = todayIn(tz);
  const { data, error } = await db
    .from('meal_logs')
    .select('eaten_on, eaten_at, meal_type, items, total_calories, protein_g')
    .eq('client_id', person.id)
    .gte('eaten_on', addDays(today, -30))
    .lt('eaten_on', today)
    .limit(400);
  if (error) throw error;
  const counts = new Map<string, number>();
  const times: Record<string, number[]> = {};
  const days = new Map<string, { kcal: number; protein: number }>();
  for (const m of data ?? []) {
    for (const it of (m.items as { name?: string }[] | null) ?? []) {
      const name = String(it?.name ?? '')
        .trim()
        .toLowerCase()
        .slice(0, 40);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(m.eaten_at))
      .split(':')
      .map(Number);
    (times[m.meal_type] ??= []).push((hm[0] ?? 0) * 60 + (hm[1] ?? 0));
    const d = days.get(m.eaten_on) ?? { kcal: 0, protein: 0 };
    d.kcal += Number(m.total_calories ?? 0);
    d.protein += Number(m.protein_g ?? 0);
    days.set(m.eaten_on, d);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([n, c]) => `${n} ${c}`);
  const usual = Object.entries(times).map(([meal, list]) => {
    const avg = Math.round(list.reduce((s, x) => s + x, 0) / list.length);
    return `${meal} ${Math.floor(avg / 60)}:${String(avg % 60).padStart(2, '0')}`;
  });
  const n = days.size;
  const avgKcal = n ? Math.round([...days.values()].reduce((s, d) => s + d.kcal, 0) / n) : null;
  const avgProtein = n
    ? Math.round([...days.values()].reduce((s, d) => s + d.protein, 0) / n)
    : null;
  return { top, usual, daysLogged: n, avgKcal, avgProtein };
}

async function currentTarget(db: SupabaseClient, person: Person) {
  const { data } = await db
    .from('targets')
    .select('calories, protein_g')
    .eq('client_id', person.id)
    .lte('effective_from', todayIn(person.timezone || 'Asia/Kolkata'))
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { calories: number | null; protein_g: number | null } | null;
}

async function planDraft(db: SupabaseClient, caller: Caller, body: z.infer<typeof PlanDraft>) {
  if (caller.role !== 'trainer' || !(await isTrainerOf(db, caller.id, body.client_id))) {
    throw new HttpError(403, 'This client is not assigned to you.', 'forbidden');
  }
  const person = await loadPerson(db, body.client_id);
  const tz = person.timezone || 'Asia/Kolkata';
  const today = todayIn(tz);

  const target = await currentTarget(db, person);
  const kcal = target?.calories ?? body.target_kcal;
  const protein = target?.protein_g ?? body.target_protein_g;
  if (!kcal || !protein) {
    throw new HttpError(400, 'Set calorie and protein targets first.', 'no_target');
  }

  // Limits: 3 drafts per client per day, 30 per trainer per day.
  const { count: todayDrafts } = await db
    .from('meal_plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', person.id)
    .gte('created_at', `${today}T00:00:00Z`);
  if ((todayDrafts ?? 0) >= 3) {
    throw new HttpError(
      429,
      'Already 3 drafts for this client today. Try tomorrow.',
      'rate_limited',
    );
  }
  const { data: used } = await db.rpc('bump_ai_usage', {
    uid: caller.id,
    day: todayIn('Asia/Kolkata'),
    feat: 'meal-plan',
  });
  if (Number(used ?? 0) > 30) {
    throw new HttpError(429, 'Too many food plans today. Try tomorrow.', 'rate_limited');
  }

  const pattern = await foodPattern(db, person);
  const prompt = [
    `Diet preference: ${person.diet_preference ?? 'not given'}.`,
    `Foods to avoid: ${person.foods_to_avoid || 'none'}.`,
    `Goal: ${person.goal ?? 'not given'}.`,
    `Daily targets: ${kcal} kcal, ${protein} g protein.`,
    pattern.daysLogged
      ? `Last 30 days (${pattern.daysLogged} days logged): average ${pattern.avgKcal} kcal, ${pattern.avgProtein} g protein. Most eaten (name times): ${pattern.top.join(', ')}. Usual meal times: ${pattern.usual.join(', ')}.`
      : 'No food logged yet – use common home-style Indian meals.',
    body.note?.trim() ? `Trainer's note: ${body.note.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = PlanOut.safeParse(
    await generateJson({
      system: PLAN_SYSTEM,
      parts: [{ text: prompt }],
      schema: PLAN_SCHEMA,
      feature: 'meal-plan',
      timeoutMs: 40_000,
    }),
  );
  if (!parsed.success || parsed.data.days.length < 7) {
    throw new HttpError(502, 'The AI gave an incomplete plan. Please try again.', 'ai_invalid');
  }

  // Tidy up and add each day's totals ourselves (the AI's own sums aren't reliable).
  const days = parsed.data.days.slice(0, 7).map((d, i) => {
    const meals = MEALS.map((meal) => d.meals.find((m) => m.meal === meal))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => ({
        meal: m.meal,
        dish: m.dish.trim().slice(0, 100),
        portion: m.portion.trim().slice(0, 80),
        kcal: clamp(m.kcal, 0, 2500),
        protein_g: clamp(m.protein_g, 0, 200),
      }));
    return {
      day: i + 1,
      meals,
      total_kcal: meals.reduce((s, m) => s + m.kcal, 0),
      total_protein_g: meals.reduce((s, m) => s + m.protein_g, 0),
    };
  });

  const { data: plan, error } = await db
    .from('meal_plans')
    .insert({
      client_id: person.id,
      trainer_id: caller.id,
      starts_on: addDays(today, 1),
      note: body.note?.trim() || null,
      days,
      target_kcal: kcal,
      target_protein_g: protein,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { plan_id: plan.id };
}

async function planShare(db: SupabaseClient, caller: Caller, body: z.infer<typeof PlanShare>) {
  const { data: plan, error } = await db
    .from('meal_plans')
    .select('id, client_id, status')
    .eq('id', body.plan_id)
    .maybeSingle();
  if (error) throw error;
  if (!plan) throw new HttpError(404, 'Plan not found', 'not_found');
  if (caller.role !== 'trainer' || !(await isTrainerOf(db, caller.id, plan.client_id))) {
    throw new HttpError(403, 'This client is not assigned to you.', 'forbidden');
  }
  const share = body.action === 'plan_share';
  if (share) {
    // Only one shared plan at a time: the new one replaces the old.
    await db
      .from('meal_plans')
      .update({ status: 'draft', shared_at: null })
      .eq('client_id', plan.client_id)
      .eq('status', 'shared');
  }
  const { error: upErr } = await db
    .from('meal_plans')
    .update({
      status: share ? 'shared' : 'draft',
      shared_at: share ? new Date().toISOString() : null,
    })
    .eq('id', plan.id);
  if (upErr) throw upErr;
  if (share && plan.status !== 'shared') {
    await sendToUsers(db, [plan.client_id], {
      title: 'Food ideas for your week 🥗',
      body: 'Your trainer shared meal ideas for the next 7 days.',
      url: '/food/ideas',
      tag: 'meal-plan',
    }).catch(() => undefined);
  }
  return { status: share ? 'shared' : 'draft' };
}

// ---------------------------------------------------------------------------
serveJson(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === 'insights') {
    const p = Insights.safeParse(body);
    if (!p.success) throw new HttpError(400, 'Invalid input', 'invalid_input');
    return await insights(db, caller, p.data);
  }
  if (body.action === 'plan_draft') {
    const p = PlanDraft.safeParse(body);
    if (!p.success) throw new HttpError(400, 'Invalid input', 'invalid_input');
    return await planDraft(db, caller, p.data);
  }
  const p = PlanShare.safeParse(body);
  if (!p.success) throw new HttpError(400, 'Unknown action', 'invalid_input');
  return await planShare(db, caller, p.data);
});
