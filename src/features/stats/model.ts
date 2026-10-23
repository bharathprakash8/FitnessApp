// Stats tab numbers, worked out in the app from the person's own logs. Periods are the last
// N *complete* days (up to yesterday), so a half-finished today doesn't drag averages down.
import type { Tables } from '../../lib/database.types';
import { resolveBurn, type ActivityDay } from '../activity/model';
import type { Profile } from '../auth/roles';
import type { LogWithExercise } from '../workouts/model';
import { dateLocale } from '../../i18n/i18n';

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

export const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
type MealType = (typeof MEAL_ORDER)[number];

type MealRow = Pick<
  Tables<'meal_logs'>,
  | 'eaten_on'
  | 'eaten_at'
  | 'meal_type'
  | 'items'
  | 'total_calories'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
>;

export type DayStatus = 'on' | 'over' | 'under' | 'none';

export interface Stats {
  days: number;
  dates: string[];
  daysLogged: number;
  streak: number;
  avg: { kcal: number; protein: number; carbs: number; fat: number } | null;
  target: { kcal: number; protein: number; carbs: number; fat: number; water: number } | null;
  daysOnTarget: number | null;
  proteinDays: number | null;
  dayStatus: { date: string; status: DayStatus }[];
  mealTimes: { meal: MealType; time: string | null; count: number }[];
  lateDinners: number;
  skippedBreakfasts: number;
  kcalShare: { meal: MealType; pct: number }[];
  proteinPerMeal: { meal: MealType; grams: number | null }[];
  weekdayKcal: number | null;
  weekendKcal: number | null;
  topFoods: { name: string; times: number }[];
  topSources: { name: string; kcal: number }[];
  eatenSeries: { date: string; value: number | null }[];
  burntSeries: { date: string; value: number | null }[];
  avgNet: number | null;
  burnEstimated: boolean;
  workoutDays: number;
  workoutsPerWeek: number;
  volumeSeries: { date: string; value: number | null }[];
  avgSteps: number | null;
  watchDays: number;
  water: { avg: number; daysReached: number; daysLogged: number } | null;
  weight: { start: number; end: number; change: number } | null;
}

const LATE_DINNER_MIN = 21 * 60 + 30; // 9:30 pm

function minutesIn(iso: string, timeZone: string) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .split(':')
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function clockText(minutes: number) {
  // A clock time in the app's language (e.g. 7:30 pm / ಸಂಜೆ 7:30).
  return new Intl.DateTimeFormat(dateLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)));
}

const avgOf = (list: number[]) =>
  list.length ? list.reduce((s, x) => s + x, 0) / list.length : null;

export function computeStats(input: {
  days: number;
  today: string;
  meals: MealRow[];
  activity: ActivityDay[];
  water: { habit_date: string; water_ml: number | null }[];
  logs: LogWithExercise[];
  weights: { measured_on: string; weight_kg: number | null }[];
  target: Tables<'targets'> | null;
  profile: Profile;
  weightKg: number | null;
  age: number | null;
  defaultWaterMl: number;
}): Stats {
  const { days, today, profile } = input;
  const tz = profile.timezone || 'Asia/Kolkata';
  const first = addDays(today, -days);
  const dates = Array.from({ length: days }, (_, i) => addDays(first, i)); // up to yesterday
  const inRange = (d: string) => d >= first && d < today;
  const meals = input.meals.filter((m) => inRange(m.eaten_on));

  // ---- per day food
  const perDay = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
  const mealsByDay = new Map<string, Set<string>>();
  for (const m of meals) {
    const d = perDay.get(m.eaten_on) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    d.kcal += Number(m.total_calories ?? 0);
    d.protein += Number(m.protein_g ?? 0);
    d.carbs += Number(m.carbs_g ?? 0);
    d.fat += Number(m.fat_g ?? 0);
    perDay.set(m.eaten_on, d);
    (mealsByDay.get(m.eaten_on) ?? mealsByDay.set(m.eaten_on, new Set()).get(m.eaten_on)!).add(
      m.meal_type,
    );
  }
  const logged = [...perDay.values()];
  const avg = logged.length
    ? {
        kcal: Math.round(avgOf(logged.map((d) => d.kcal))!),
        protein: Math.round(avgOf(logged.map((d) => d.protein))!),
        carbs: Math.round(avgOf(logged.map((d) => d.carbs))!),
        fat: Math.round(avgOf(logged.map((d) => d.fat))!),
      }
    : null;

  const t = input.target;
  const target =
    t && t.calories
      ? {
          kcal: t.calories,
          protein: t.protein_g ?? 0,
          carbs: t.carbs_g ?? 0,
          fat: t.fat_g ?? 0,
          water: t.water_ml ?? input.defaultWaterMl,
        }
      : null;

  const dayStatus = dates.map((date) => {
    const d = perDay.get(date);
    if (!d) return { date, status: 'none' as DayStatus };
    if (!target) return { date, status: 'on' as DayStatus };
    const ratio = d.kcal / target.kcal;
    return {
      date,
      status: (ratio > 1.1 ? 'over' : ratio < 0.9 ? 'under' : 'on') as DayStatus,
    };
  });
  const daysOnTarget = target ? dayStatus.filter((d) => d.status === 'on').length : null;
  const proteinDays =
    target && target.protein ? logged.filter((d) => d.protein >= target.protein).length : null;

  // Streak: days in a row with food logged, ending today (or yesterday if nothing yet today).
  const allDays = new Set(input.meals.map((m) => m.eaten_on));
  let streak = 0;
  for (let d = allDays.has(today) ? today : addDays(today, -1); allDays.has(d); d = addDays(d, -1))
    streak++;

  // ---- patterns
  const times: Record<string, number[]> = {};
  let lateDinners = 0;
  const kcalByMeal: Record<string, number> = {};
  const proteinByMealDay = new Map<string, number>(); // `${meal}|${day}` → grams
  const foodCount = new Map<string, number>();
  const foodKcal = new Map<string, number>();
  for (const m of meals) {
    const min = minutesIn(m.eaten_at, tz);
    (times[m.meal_type] ??= []).push(min);
    if (m.meal_type === 'dinner' && min >= LATE_DINNER_MIN) lateDinners++;
    kcalByMeal[m.meal_type] = (kcalByMeal[m.meal_type] ?? 0) + Number(m.total_calories ?? 0);
    const key = `${m.meal_type}|${m.eaten_on}`;
    proteinByMealDay.set(key, (proteinByMealDay.get(key) ?? 0) + Number(m.protein_g ?? 0));
    for (const it of (m.items as { name?: string; calories?: number }[] | null) ?? []) {
      const name = String(it?.name ?? '')
        .trim()
        .toLowerCase();
      if (!name) continue;
      foodCount.set(name, (foodCount.get(name) ?? 0) + 1);
      foodKcal.set(name, (foodKcal.get(name) ?? 0) + Number(it?.calories ?? 0));
    }
  }
  const totalKcal = Object.values(kcalByMeal).reduce((s, x) => s + x, 0);
  const mealTimes = MEAL_ORDER.map((meal) => {
    const a = avgOf(times[meal] ?? []);
    return {
      meal,
      time: a === null ? null : clockText(Math.round(a)),
      count: (times[meal] ?? []).length,
    };
  });
  const kcalShare = MEAL_ORDER.map((meal) => ({
    meal,
    pct: totalKcal ? Math.round(((kcalByMeal[meal] ?? 0) / totalKcal) * 100) : 0,
  }));
  const proteinPerMeal = MEAL_ORDER.map((meal) => {
    const vals = [...proteinByMealDay.entries()]
      .filter(([k]) => k.startsWith(`${meal}|`))
      .map(([, g]) => g);
    const a = avgOf(vals);
    return { meal, grams: a === null ? null : Math.round(a) };
  });
  const skippedBreakfasts = [...mealsByDay.values()].filter((s) => !s.has('breakfast')).length;
  const wk = [...perDay.entries()].filter(([d]) => ![0, 6].includes(weekday(d)));
  const we = [...perDay.entries()].filter(([d]) => [0, 6].includes(weekday(d)));
  const weekdayKcal = wk.length ? Math.round(avgOf(wk.map(([, d]) => d.kcal))!) : null;
  const weekendKcal = we.length ? Math.round(avgOf(we.map(([, d]) => d.kcal))!) : null;
  const titled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const topFoods = [...foodCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, times]) => ({ name: titled(name), times }));
  const topSources = [...foodKcal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, kcal]) => ({ name: titled(name), kcal: Math.round(kcal) }));

  // ---- activity (same watch-aware burn as the Today card)
  const actByDay = new Map(input.activity.map((a) => [a.activity_date, a]));
  const logsByDay = new Map<string, LogWithExercise[]>();
  for (const l of input.logs)
    if (inRange(l.performed_on))
      (
        logsByDay.get(l.performed_on) ?? logsByDay.set(l.performed_on, []).get(l.performed_on)!
      ).push(l);
  let burnEstimated = false;
  const burntSeries = dates.map((date) => {
    const b = resolveBurn({
      row: actByDay.get(date) ?? null,
      dayLogs: logsByDay.get(date) ?? [],
      profile,
      weightKg: input.weightKg,
      age: input.age,
      fraction: 1,
    });
    if (b.activeEstimated || b.restingEstimated) burnEstimated = true;
    return { date, value: b.total || null };
  });
  const eatenSeries = dates.map((date) => ({ date, value: perDay.get(date)?.kcal ?? null }));
  const nets = dates
    .map((d, i) => {
      const e = perDay.get(d)?.kcal;
      const b = burntSeries[i]!.value;
      return e !== undefined && b ? e - b : null;
    })
    .filter((n): n is number => n !== null);
  const avgNet = nets.length ? Math.round(avgOf(nets)!) : null;

  const workoutDays = logsByDay.size;
  const workoutsPerWeek = Math.round((workoutDays / days) * 7 * 10) / 10;
  // Weekly volume (kg × reps), oldest week first.
  const weeks = Math.max(1, Math.ceil(days / 7));
  const volumeSeries = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(today, -(weeks - i) * 7);
    const end = addDays(start, 7);
    let v = 0;
    for (const [d, list] of logsByDay)
      if (d >= start && d < end)
        for (const l of list) v += Number(l.weight_kg ?? 0) * Number(l.reps ?? 0);
    return { date: start, value: v ? Math.round(v) : null };
  });

  const acts = input.activity.filter((a) => inRange(a.activity_date));
  const steps = acts.map((a) => a.steps).filter((s): s is number => typeof s === 'number' && s > 0);
  const avgSteps = steps.length ? Math.round(avgOf(steps)!) : null;
  const watchDays = acts.filter((a) => (a.worn_hours?.length ?? 0) > 0).length;

  const waterRows = input.water.filter((w) => inRange(w.habit_date) && (w.water_ml ?? 0) > 0);
  const waterGoal = target?.water ?? input.defaultWaterMl;
  const water = waterRows.length
    ? {
        avg: Math.round(avgOf(waterRows.map((w) => w.water_ml ?? 0))!),
        daysReached: waterRows.filter((w) => (w.water_ml ?? 0) >= waterGoal).length,
        daysLogged: waterRows.length,
      }
    : null;

  const ws = input.weights
    .filter((w) => w.weight_kg !== null && w.measured_on >= first && w.measured_on <= today)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const weight =
    ws.length >= 2
      ? {
          start: Number(ws[0]!.weight_kg),
          end: Number(ws.at(-1)!.weight_kg),
          change: Math.round((Number(ws.at(-1)!.weight_kg) - Number(ws[0]!.weight_kg)) * 10) / 10,
        }
      : null;

  return {
    days,
    dates,
    daysLogged: perDay.size,
    streak,
    avg,
    target,
    daysOnTarget,
    proteinDays,
    dayStatus,
    mealTimes,
    lateDinners,
    skippedBreakfasts,
    kcalShare,
    proteinPerMeal,
    weekdayKcal,
    weekendKcal,
    topFoods,
    topSources,
    eatenSeries,
    burntSeries,
    avgNet,
    burnEstimated,
    workoutDays,
    workoutsPerWeek,
    volumeSeries,
    avgSteps,
    watchDays,
    water,
    weight,
  };
}

/** The compact set of numbers sent to the AI for insights (no names, no dates). */
export function insightInput(s: Stats) {
  return {
    period_days: s.days,
    days_logged: s.daysLogged,
    days_on_calorie_target: s.daysOnTarget,
    avg_kcal: s.avg?.kcal,
    target_kcal: s.target?.kcal,
    avg_protein_g: s.avg?.protein,
    target_protein_g: s.target?.protein,
    days_protein_target_reached: s.proteinDays,
    usual_meal_times: Object.fromEntries(s.mealTimes.map((m) => [m.meal, m.time])),
    late_dinners_after_930pm: s.lateDinners,
    days_without_breakfast: s.skippedBreakfasts,
    kcal_share_pct: Object.fromEntries(s.kcalShare.map((m) => [m.meal, m.pct])),
    protein_per_meal_g: Object.fromEntries(s.proteinPerMeal.map((m) => [m.meal, m.grams])),
    weekday_avg_kcal: s.weekdayKcal,
    weekend_avg_kcal: s.weekendKcal,
    most_eaten: s.topFoods.slice(0, 6).map((f) => `${f.name} ${f.times}`),
    biggest_calorie_sources: s.topSources.slice(0, 4).map((f) => `${f.name} ${f.kcal} kcal`),
    avg_net_kcal_eaten_minus_burnt: s.avgNet,
    workout_days: s.workoutDays,
    avg_steps: s.avgSteps,
    water_avg_ml: s.water?.avg,
    water_target_ml: s.target?.water,
    weight_change_kg: s.weight?.change,
  };
}
