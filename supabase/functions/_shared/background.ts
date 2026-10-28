// Client background: everything the AI coaches should know about one person, in a compact
// form (the long-term picture; today's details are in personSummary / chatSummary).
// Built fresh from the database on every request – a few small queries, ~1,000 tokens.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { activePlan, type CoachPerson } from './coach.ts';
import { addDays } from './util.ts';

const hhmm = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const avg = (list: number[]) =>
  list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => `${k} ×${c}`);

type Session = {
  status: string;
  sessions: { title: string; starts_at: string; type: string } | null;
};

export async function clientBackground(db: SupabaseClient, p: CoachPerson, today: string) {
  const tz = p.timezone || 'Asia/Kolkata';
  const d30 = addDays(today, -29);
  const [
    weights,
    targets,
    meals,
    logs,
    activity,
    water,
    summary,
    insights,
    ideas,
    notes,
    sessions,
    plan,
  ] = await Promise.all([
    db
      .from('measurements')
      .select('measured_on, weight_kg, waist_cm')
      .eq('client_id', p.id)
      .gte('measured_on', addDays(today, -90))
      .order('measured_on'),
    db
      .from('targets')
      .select('effective_from, calories, protein_g')
      .eq('client_id', p.id)
      .order('effective_from', { ascending: false })
      .limit(4),
    db
      .from('meal_logs')
      .select('eaten_on, eaten_at, meal_type, items, total_calories, protein_g')
      .eq('client_id', p.id)
      .gte('eaten_on', d30)
      .lte('eaten_on', today),
    db
      .from('workout_logs')
      .select('performed_on, exercises(name)')
      .eq('client_id', p.id)
      .gte('performed_on', d30),
    db
      .from('activity_daily')
      .select('steps, active_calories, sleep_minutes')
      .eq('client_id', p.id)
      .gte('activity_date', d30),
    db
      .from('habits_daily')
      .select('water_ml')
      .eq('client_id', p.id)
      .gte('habit_date', addDays(today, -6)),
    db
      .from('weekly_summaries')
      .select('period_start, period_end, summary_text')
      .eq('client_id', p.id)
      .eq('status', 'shared')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('stats_insights')
      .select('made_on, focus')
      .eq('client_id', p.id)
      .order('made_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('meal_plans')
      .select('starts_on, days')
      .eq('client_id', p.id)
      .eq('status', 'shared')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('coach_notes')
      .select('note_date, kind, body')
      .eq('client_id', p.id)
      .eq('status', 'shared')
      .gte('note_date', addDays(today, -3))
      .order('note_date', { ascending: false })
      .limit(4),
    db
      .from('session_attendees')
      .select('status, sessions(title, starts_at, type)')
      .eq('client_id', p.id),
    activePlan(db, p.id),
  ]);

  // Food over 30 days: averages, habits and favourite foods.
  const mealRows = meals.data ?? [];
  const byDay = new Map<string, { kcal: number; protein: number }>();
  const foodCount = new Map<string, number>();
  const times: Record<string, number[]> = {};
  let lateDinners = 0;
  for (const m of mealRows) {
    const d = byDay.get(m.eaten_on) ?? { kcal: 0, protein: 0 };
    d.kcal += Number(m.total_calories ?? 0);
    d.protein += Number(m.protein_g ?? 0);
    byDay.set(m.eaten_on, d);
    for (const it of (m.items ?? []) as { name?: string }[]) {
      const n = String(it?.name ?? '')
        .trim()
        .toLowerCase();
      if (n) foodCount.set(n, (foodCount.get(n) ?? 0) + 1);
    }
    const [h, mm] = hhmm(m.eaten_at, tz).split(':').map(Number);
    const minutes = (h ?? 0) * 60 + (mm ?? 0);
    (times[m.meal_type] ??= []).push(minutes);
    if (m.meal_type === 'dinner' && minutes >= 21 * 60 + 30) lateDinners++;
  }
  const loggedDays = [...byDay.keys()];
  const breakfastDays = new Set(
    mealRows.filter((m) => m.meal_type === 'breakfast').map((m) => m.eaten_on),
  );
  const usualTimes = Object.fromEntries(
    Object.entries(times).map(([meal, list]) => {
      const a = avg(list)!;
      return [
        meal,
        `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`,
      ];
    }),
  );

  // Training and activity over 30 days.
  const workoutDays = new Set((logs.data ?? []).map((l) => l.performed_on));
  const exerciseCount = new Map<string, number>();
  for (const l of logs.data ?? []) {
    const n = (l as unknown as { exercises?: { name?: string } }).exercises?.name;
    if (n) exerciseCount.set(n, (exerciseCount.get(n) ?? 0) + 1);
  }
  const act = activity.data ?? [];
  const sleep = avg(act.map((x) => x.sleep_minutes ?? 0).filter((x) => x > 0));

  // Weight and sessions.
  const w = (weights.data ?? []).filter((x) => x.weight_kg !== null);
  const waist = (weights.data ?? []).filter((x) => x.waist_cm !== null);
  const now = Date.now();
  const sess = (sessions.data ?? []) as unknown as Session[];
  const past = sess.filter((x) => {
    const t = x.sessions ? Date.parse(x.sessions.starts_at) : 0;
    return t < now && t > now - 30 * 86_400_000;
  });
  const next = sess
    .filter((x) => x.sessions && Date.parse(x.sessions.starts_at) > now)
    .sort((a, b) => a.sessions!.starts_at.localeCompare(b.sessions!.starts_at))[0];

  return {
    on_app_since: p.created_at?.slice(0, 10) ?? null,
    goal_detail: p.goal === 'other' ? (p.goal_other ?? null) : null,
    injuries: p.injuries || null,
    timezone: tz,
    weight_90_days: w.length
      ? {
          first: `${w[0]!.weight_kg} kg on ${w[0]!.measured_on}`,
          latest: `${w.at(-1)!.weight_kg} kg on ${w.at(-1)!.measured_on}`,
          change_kg: Math.round((Number(w.at(-1)!.weight_kg) - Number(w[0]!.weight_kg)) * 10) / 10,
          entries: w.length,
        }
      : null,
    waist_cm_latest: waist.at(-1)?.waist_cm ?? null,
    target_history: (targets.data ?? []).map(
      (t) => `${t.effective_from}: ${t.calories} kcal, ${t.protein_g} g protein`,
    ),
    food_30_days: {
      days_logged: loggedDays.length,
      avg_kcal_on_logged_days: avg([...byDay.values()].map((d) => d.kcal)),
      avg_protein_g: avg([...byDay.values()].map((d) => d.protein)),
      usual_meal_times: usualTimes,
      late_dinners_after_9_30pm: lateDinners,
      days_without_breakfast: loggedDays.filter((d) => !breakfastDays.has(d)).length,
      most_eaten: top(foodCount, 12),
    },
    training_30_days: {
      plan: plan ? `${plan.name}: ${plan.days.map((d) => d.title).join(', ')}` : null,
      workout_days: workoutDays.size,
      last_workout: [...workoutDays].sort().at(-1) ?? null,
      most_done_exercises: top(exerciseCount, 8),
      avg_steps: avg(act.map((a) => a.steps ?? 0).filter((x) => x > 0)),
      avg_active_kcal: avg(act.map((a) => a.active_calories ?? 0).filter((x) => x > 0)),
      avg_sleep_h: sleep ? Math.round(sleep / 6) / 10 : null,
    },
    water_7_day_avg_ml: avg((water.data ?? []).map((x) => x.water_ml)),
    sessions: {
      next: next?.sessions
        ? `${next.sessions.title} at ${next.sessions.starts_at} (${next.sessions.type})`
        : null,
      last_30_days: `${past.filter((x) => x.status === 'present').length} attended, ${
        past.filter((x) => x.status === 'missed').length
      } missed`,
    },
    latest_weekly_summary: summary.data
      ? `${summary.data.period_start} to ${summary.data.period_end}: ${summary.data.summary_text}`.slice(
          0,
          700,
        )
      : null,
    latest_stats_focus: insights.data ? `${insights.data.made_on}: ${insights.data.focus}` : null,
    shared_meal_ideas: ideas.data
      ? `from ${ideas.data.starts_on}: ${(
          (ideas.data.days ?? []) as { meals?: { dish?: string }[] }[]
        )
          .slice(0, 2)
          .flatMap((d) => (d.meals ?? []).map((m) => m.dish))
          .join(', ')} …`.slice(0, 400)
      : null,
    recent_coach_notes: (notes.data ?? []).map((n) =>
      `${n.note_date} ${n.kind}: ${n.body}`.slice(0, 300),
    ),
  };
}
