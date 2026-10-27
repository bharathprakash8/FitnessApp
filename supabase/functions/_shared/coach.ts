// Shared AI coach logic: who is coached, a compact picture of one person's day, the safety
// rules every coach change must pass, and the day coach prompts.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const CONDITION_LABELS: Record<string, string> = {
  knee: 'knee pain',
  back: 'back pain',
  bp: 'high blood pressure',
  diabetes: 'diabetes',
  heart: 'heart condition',
  thyroid: 'thyroid',
  pregnancy: 'pregnancy',
  other: 'other condition',
};

export function localDate(timeZone: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}

export function localMinutes(timeZone: string) {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .split(':')
    .map(Number);
  return (hm[0] ?? 0) * 60 + (hm[1] ?? 0);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ageOn(dob: string | null, day: string) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = day.split('-').map(Number);
  return ty! - y! - (tm! < m! || (tm === m && td! < d!) ? 1 : 0);
}

export interface CoachPerson {
  id: string;
  full_name: string | null;
  email: string;
  timezone: string;
  language: string;
  date_of_birth: string | null;
  sex: string | null;
  height_cm: number | null;
  goal: string | null;
  diet_preference: string | null;
  foods_to_avoid: string | null;
  injuries: string | null;
  health_conditions: string[];
  conditions_note: string | null;
  doctor_ok: boolean | null;
  coach_consent_at: string | null;
}

const PERSON_COLS =
  'id, full_name, email, timezone, language, date_of_birth, sex, height_cm, goal, diet_preference, foods_to_avoid, injuries, health_conditions, conditions_note, doctor_ok, coach_consent_at';

export async function coachAccount(db: SupabaseClient) {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name')
    .eq('is_ai_coach', true)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; full_name: string | null } | null;
}

export async function coachMode(db: SupabaseClient): Promise<'off' | 'dry_run' | 'live'> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'coach_mode')
    .maybeSingle();
  const v = data?.value;
  return v === 'live' || v === 'off' ? v : 'dry_run';
}

/** Active, consenting people mapped to the AI coach. */
export async function coachedPeople(db: SupabaseClient, coachId: string, consentedOnly = true) {
  const { data: links, error } = await db
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', coachId);
  if (error) throw error;
  const ids = (links ?? []).map((l) => l.client_id as string);
  if (!ids.length) return [];
  let q = db.from('profiles').select(PERSON_COLS).in('id', ids).eq('is_active', true);
  if (consentedOnly) q = q.not('coach_consent_at', 'is', null);
  const { data, error: pErr } = await q;
  if (pErr) throw pErr;
  return (data ?? []) as CoachPerson[];
}

export async function loadPerson(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('profiles').select(PERSON_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as CoachPerson | null;
}

export async function isCoached(db: SupabaseClient, coachId: string, clientId: string) {
  const { data } = await db
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', coachId)
    .eq('client_id', clientId)
    .maybeSingle();
  return Boolean(data);
}

export async function latestWeight(db: SupabaseClient, clientId: string) {
  const { data } = await db
    .from('measurements')
    .select('weight_kg, measured_on')
    .eq('client_id', clientId)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: false })
    .limit(10);
  return (data ?? []) as { weight_kg: number; measured_on: string }[];
}

export async function currentTarget(db: SupabaseClient, clientId: string, day: string) {
  const { data } = await db
    .from('targets')
    .select('id, calories, protein_g, carbs_g, fat_g, water_ml, effective_from')
    .eq('client_id', clientId)
    .lte('effective_from', day)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    water_ml: number | null;
    effective_from: string;
  } | null;
}

/** The person's active plan with its days and each day's exercises (name + safety tags). */
export async function activePlan(db: SupabaseClient, clientId: string) {
  const { data } = await db
    .from('plan_assignments')
    .select(
      'plan_id, start_date, workout_plans(id, name, trainer_id, plan_days(id, day_index, title, plan_exercises(sort_order, sets, reps, exercises(name, log_type, safety_tags))))',
    )
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const plan = (data as any)?.workout_plans;
  if (!plan) return null;
  return {
    id: plan.id as string,
    name: plan.name as string,
    trainer_id: plan.trainer_id as string,
    // deno-lint-ignore no-explicit-any
    days: ((plan.plan_days ?? []) as any[])
      .sort((a, b) => a.day_index - b.day_index)
      .map((d) => ({
        id: d.id as string,
        title: d.title as string,
        // deno-lint-ignore no-explicit-any
        exercises: ((d.plan_exercises ?? []) as any[])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((pe) => ({
            name: pe.exercises?.name as string,
            sets: pe.sets as number,
            reps: pe.reps as string | null,
            tags: (pe.exercises?.safety_tags ?? []) as string[],
          })),
      })),
  };
}

/** Safety tags every exercise must have for this person (age and conditions). */
export function requiredTags(p: CoachPerson, day: string) {
  const tags = new Set<string>();
  const age = ageOn(p.date_of_birth, day);
  if (age !== null && age >= 55) tags.add('senior_safe');
  const c = new Set(p.health_conditions ?? []);
  if (c.has('knee')) tags.add('knee_friendly');
  if (c.has('back')) tags.add('back_friendly');
  if (c.has('heart') || c.has('bp') || c.has('pregnancy') || c.has('diabetes')) {
    tags.add('low_impact');
  }
  return [...tags];
}

/** Lowest daily calorie target the coach may set. */
export function calorieFloor(p: CoachPerson) {
  return p.sex === 'female' ? 1200 : 1500;
}

/** A compact picture of one person for the AI coaches (no emails or ids of others). */
export async function personSummary(db: SupabaseClient, p: CoachPerson, today: string) {
  const yesterday = addDays(today, -1);
  const [target, weights, plan, activity, water, meals, logs, dayPlan] = await Promise.all([
    currentTarget(db, p.id, today),
    latestWeight(db, p.id),
    activePlan(db, p.id),
    db
      .from('activity_daily')
      .select(
        'activity_date, active_calories, resting_calories, steps, sleep_minutes, source, worn_hours, updated_at',
      )
      .eq('client_id', p.id)
      .gte('activity_date', addDays(today, -6))
      .order('activity_date', { ascending: false }),
    db
      .from('habits_daily')
      .select('habit_date, water_ml')
      .eq('client_id', p.id)
      .in('habit_date', [yesterday, today]),
    db
      .from('meal_logs')
      .select(
        'id, eaten_on, eaten_at, meal_type, source, items, total_calories, protein_g, edited, photo_path, coach_checked_at',
      )
      .eq('client_id', p.id)
      .in('eaten_on', [yesterday, today])
      .order('eaten_at'),
    db
      .from('workout_logs')
      .select('performed_on, set_number, reps, weight_kg, duration_min, source, exercises(name)')
      .eq('client_id', p.id)
      .gte('performed_on', addDays(today, -6)),
    db
      .from('coach_day_plans')
      .select('plan_date, kind, plan_day_id, note, kcal_adjust, status')
      .eq('client_id', p.id)
      .in('plan_date', [today, addDays(today, 1)]),
  ]);

  const dayTotals = (day: string) => {
    const list = (meals.data ?? []).filter((m) => m.eaten_on === day);
    return {
      meals_logged: list.length,
      kcal: list.reduce((s, m) => s + Number(m.total_calories ?? 0), 0),
      protein_g: Math.round(list.reduce((s, m) => s + Number(m.protein_g ?? 0), 0)),
      meals: list.map((m) => ({
        type: m.meal_type,
        // deno-lint-ignore no-explicit-any
        items: ((m.items ?? []) as any[])
          .map((i) => `${i.name} (${i.portion}) ${Math.round(i.calories)}`)
          .join(', '),
        kcal: m.total_calories,
      })),
    };
  };
  // deno-lint-ignore no-explicit-any
  const workouts = new Map<string, Map<string, number>>();
  for (const l of logs.data ?? []) {
    const byDay = workouts.get(l.performed_on) ?? new Map<string, number>();
    // deno-lint-ignore no-explicit-any
    const name = (l as any).exercises?.name ?? 'exercise';
    byDay.set(name, (byDay.get(name) ?? 0) + 1);
    workouts.set(l.performed_on, byDay);
  }
  const device = (activity.data ?? []).filter(
    (a) => a.source !== 'manual' && a.source !== 'estimated',
  );
  const lastSync =
    device
      .map((a) => a.updated_at)
      .sort()
      .at(-1) ?? null;
  const hoursSince = lastSync ? Math.round((Date.now() - Date.parse(lastSync)) / 3_600_000) : null;
  const age = ageOn(p.date_of_birth, today);

  return {
    name: (p.full_name || 'Friend').split(' ')[0],
    language: p.language,
    age,
    sex: p.sex,
    height_cm: p.height_cm,
    weight_kg: weights[0]?.weight_kg ?? null,
    weight_14_days_ago:
      weights.find((w) => w.measured_on <= addDays(today, -14))?.weight_kg ?? null,
    goal: p.goal,
    diet: p.diet_preference,
    foods_to_avoid: p.foods_to_avoid || '',
    conditions: (p.health_conditions ?? []).map((c) => CONDITION_LABELS[c] ?? c),
    conditions_note: p.conditions_note,
    injuries: p.injuries,
    doctor_ok: p.doctor_ok,
    required_exercise_tags: requiredTags(p, today),
    target: target
      ? { kcal: target.calories, protein_g: target.protein_g, water_ml: target.water_ml ?? 2500 }
      : null,
    today: {
      date: today,
      ...dayTotals(today),
      water_ml: water.data?.find((w) => w.habit_date === today)?.water_ml ?? 0,
    },
    yesterday: {
      date: yesterday,
      ...dayTotals(yesterday),
      water_ml: water.data?.find((w) => w.habit_date === yesterday)?.water_ml ?? 0,
    },
    workouts_last_7_days: [...workouts.entries()].map(([day, ex]) => ({
      day,
      exercises: [...ex.entries()].map(([n, sets]) => `${n} ×${sets} sets`).join(', '),
    })),
    activity_last_7_days: (activity.data ?? []).map((a) => ({
      day: a.activity_date,
      active_kcal: a.active_calories,
      resting_kcal: a.resting_calories,
      steps: a.steps,
      sleep_h: a.sleep_minutes ? Math.round(a.sleep_minutes / 6) / 10 : null,
      watch_hours: a.worn_hours?.length ?? null,
      source: a.source,
    })),
    health_sync: { last_sync_hours_ago: hoursSince },
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          days: plan.days.map((d) => ({
            plan_day_id: d.id,
            title: d.title,
            exercises: d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps ?? ''}`).join(', '),
          })),
        }
      : null,
    coach_day_plans: dayPlan.data ?? [],
  };
}

export async function playbookFor(db: SupabaseClient, clientId: string) {
  const { data } = await db
    .from('coach_playbook')
    .select('client_id, body')
    .or(`client_id.is.null,client_id.eq.${clientId}`);
  const shared = data?.find((r) => r.client_id === null)?.body ?? '';
  const own = data?.find((r) => r.client_id === clientId)?.body ?? '';
  return { shared: shared.slice(0, 6000), person: own.slice(0, 4000) };
}

// ---------------------------------------------------------------------------
// Red flags: answered with a fixed message, never by the AI.
// ---------------------------------------------------------------------------
const RED_FLAGS = [
  /chest\s*(pain|tight|pressure|heav)/i,
  /tight(ness)?\s+(in\s+)?(my\s+)?chest/i,
  /breathless|short(ness)?\s+of\s+breath|can'?t\s+breathe|difficulty\s+breathing/i,
  /faint(ed|ing)?|black(ed)?\s*out|unconscious|collaps/i,
  /dizz(y|iness)|giddy|giddiness/i,
  /sugar\s+(is\s+)?(very\s+)?(low|high)|hypo(glyc)?/i,
  /stroke|numb(ness)?|slurred/i,
  /severe\s+pain|vomit(ing)?\s+blood|bleeding/i,
  /ಎದೆ\s*ನೋವು|ಎದೆ\s*ಬಿಗಿ|ಉಸಿರು\s*(ಕಟ್ಟ|ತೊಂದರೆ|ಆಡಲು)|ತಲೆ\s*ಸುತ್ತು|ಮೂರ್ಛೆ|ಪ್ರಜ್ಞೆ|ಸಕ್ಕರೆ\s*(ಕಡಿಮೆ|ಜಾಸ್ತಿ)/,
];

export const isRedFlag = (text: string) => RED_FLAGS.some((r) => r.test(text));

export function redFlagReply(language: string) {
  return language === 'kn'
    ? 'ದಯವಿಟ್ಟು ಈಗಲೇ ನಿಲ್ಲಿಸಿ, ಕುಳಿತುಕೊಳ್ಳಿ ಮತ್ತು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ 108 ಗೆ ಕರೆ ಮಾಡಿ. ನಾನು ನಿಮ್ಮ ಕೋಚ್‌ಗೆ ತಿಳಿಸಿದ್ದೇನೆ.'
    : 'Please stop what you are doing, sit down and contact your doctor now, or call 108. I have told your coach.';
}

export function escalatedLine(language: string) {
  return language === 'kn'
    ? 'ಈ ಪ್ರಶ್ನೆಯನ್ನು ನಿಮ್ಮ ಮುಖ್ಯ ಕೋಚ್‌ಗೆ ಕಳುಹಿಸಿದ್ದೇನೆ – ಶೀಘ್ರದಲ್ಲೇ ಉತ್ತರ ಬರುತ್ತದೆ.'
    : "I've passed this to your head coach – you'll hear back soon.";
}

// ---------------------------------------------------------------------------
// Day coach prompts
// ---------------------------------------------------------------------------
export const ASK_SYSTEM = `You are the day coach in FitCoach, an Indian fitness coaching app for family and friends, many of them older adults. You answer one message from one person using their profile, plan and recent numbers below, and the coach playbook (follow it). Be warm, simple and short (2–5 sentences), practical, with everyday Indian foods that fit their diet preference and never their foods to avoid. Exercise suggestions must be gentle and suit their age and conditions. Never give medical advice: never comment on medicines, dosages, diagnoses, test results or supplements, and never tell someone to start, stop or change a medicine – say their doctor is the right person. If the message mentions chest pain or tightness, breathlessness, fainting or dizziness, very low or high sugar, or any emergency, set red_flag true and tell them to stop, sit down and contact their doctor or call 108 now. Set escalate true when the question needs the head coach or a doctor (health conditions, pain that continues, medicines, supplements, big plan or target changes) or when you are not sure. Reply in the language the message is written in: Kannada (Kannada script) for a Kannada message, otherwise English. Return only JSON matching the schema.`;

export const ASK_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    escalate: { type: 'boolean' },
    red_flag: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['reply', 'escalate', 'red_flag', 'reason'],
};

export const NOTE_SYSTEM = `You are the day coach in FitCoach, an Indian fitness coaching app for family and friends. Write one short personal note (3–5 short sentences) for the person below, using only the numbers given and following the coach playbook. Morning note: today's plan in simple words and one practical food tip for today. Evening note: how today went against the targets and one small thing for tomorrow. Warm and encouraging, never preachy, no medical advice, foods must fit their diet preference and never their foods to avoid. If health_sync.last_sync_hours_ago is more than 36, kindly ask them to open the app (or run the Sync shortcut on iPhone) so their calories burnt are up to date. Language: if language is "kn" write in simple Kannada (Kannada script), otherwise in simple Indian English. Return only JSON matching the schema.`;

export const NOTE_SCHEMA = {
  type: 'object',
  properties: { note: { type: 'string' } },
  required: ['note'],
};

/** All active admins (for alerts). */
export async function adminIds(db: SupabaseClient) {
  const { data } = await db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
  return (data ?? []).map((a) => a.id as string);
}
