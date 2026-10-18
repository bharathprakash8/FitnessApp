import type { Tables } from '../../lib/database.types';

export type Exercise = Tables<'exercises'>;
export type LogType = 'weights' | 'bodyweight' | 'timed';
export type WorkoutPlan = Tables<'workout_plans'>;
export type PlanAssignment = Tables<'plan_assignments'>;
export type WorkoutLog = Tables<'workout_logs'>;

export type PlanExerciseFull = Tables<'plan_exercises'> & { exercises: Exercise };
export type PlanDayFull = Tables<'plan_days'> & { plan_exercises: PlanExerciseFull[] };
export type PlanFull = WorkoutPlan & { plan_days: PlanDayFull[] };

export type LogWithExercise = WorkoutLog & {
  exercises: Pick<Exercise, 'id' | 'name' | 'log_type' | 'muscle_group'>;
};

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  weights: 'Weights (kg × reps)',
  bodyweight: 'Bodyweight (reps)',
  timed: 'Timed (minutes)',
};

/** Days and their exercises in display order. */
export function sortPlan(plan: PlanFull): PlanFull {
  return {
    ...plan,
    plan_days: [...plan.plan_days]
      .sort((a, b) => a.day_index - b.day_index || a.created_at.localeCompare(b.created_at))
      .map((d) => ({
        ...d,
        plan_exercises: [...d.plan_exercises].sort(
          (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
        ),
      })),
  };
}

/** "3 × 8-10 · rest 90 s" */
export function prescription(pe: Pick<PlanExerciseFull, 'sets' | 'reps' | 'rest_seconds'>) {
  const parts = [`${pe.sets} × ${pe.reps || '—'}`];
  if (pe.rest_seconds) parts.push(`rest ${formatRest(pe.rest_seconds)}`);
  return parts.join(' · ');
}

export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

const trim = (n: number) => Number(n.toFixed(2)).toString();

/** "40 kg × 8", "12 reps", "1.5 min" */
export function formatSet(
  log: Pick<WorkoutLog, 'reps' | 'weight_kg' | 'duration_min'>,
  type: string,
) {
  if (type === 'timed') return `${trim(log.duration_min ?? 0)} min`;
  if (type === 'bodyweight') return `${log.reps ?? 0} reps`;
  return `${trim(log.weight_kg ?? 0)} kg × ${log.reps ?? 0}`;
}

/**
 * Which plan day is next: plan days rotate. If the last logged plan day was today it is
 * still "today's workout"; otherwise it's the day after the last one logged.
 */
export function nextDay(
  days: PlanDayFull[],
  logs: Pick<WorkoutLog, 'plan_day_id' | 'performed_on' | 'created_at'>[],
  today: string,
): { day: PlanDayFull; inProgress: boolean } | null {
  if (days.length === 0) return null;
  const ids = new Set(days.map((d) => d.id));
  const last = logs
    .filter((l) => l.plan_day_id && ids.has(l.plan_day_id))
    .sort(
      (a, b) =>
        b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at),
    )[0];
  if (!last) return { day: days[0]!, inProgress: false };
  const idx = days.findIndex((d) => d.id === last.plan_day_id);
  if (last.performed_on === today) return { day: days[idx]!, inProgress: true };
  return { day: days[(idx + 1) % days.length]!, inProgress: false };
}

export interface PersonalBest {
  exerciseId: string;
  name: string;
  type: LogType;
  text: string;
  date: string;
}

/** Heaviest weight (weights), most reps (bodyweight), longest time (timed). */
export function personalBests(logs: LogWithExercise[]): PersonalBest[] {
  const best = new Map<string, { log: LogWithExercise; score: number[] }>();
  for (const log of logs) {
    const type = log.exercises.log_type as LogType;
    const score =
      type === 'weights'
        ? [log.weight_kg ?? 0, log.reps ?? 0]
        : type === 'bodyweight'
          ? [log.reps ?? 0]
          : [log.duration_min ?? 0];
    if (score[0] === 0) continue;
    const current = best.get(log.exercise_id);
    const better =
      !current ||
      score[0]! > current.score[0]! ||
      (score[0] === current.score[0] && (score[1] ?? 0) > (current.score[1] ?? 0));
    if (better) best.set(log.exercise_id, { log, score });
  }
  return [...best.values()]
    .map(({ log }) => ({
      exerciseId: log.exercise_id,
      name: log.exercises.name,
      type: log.exercises.log_type as LogType,
      text: formatSet(log, log.exercises.log_type),
      date: log.performed_on,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Logs grouped by date (newest first), then by exercise in the order they were done. */
export function groupByDate(logs: LogWithExercise[]) {
  const byDate = new Map<string, LogWithExercise[]>();
  for (const l of [...logs].sort(
    (a, b) =>
      b.performed_on.localeCompare(a.performed_on) || a.created_at.localeCompare(b.created_at),
  )) {
    const list = byDate.get(l.performed_on) ?? [];
    list.push(l);
    byDate.set(l.performed_on, list);
  }
  return [...byDate.entries()].map(([date, items]) => {
    // Plan and self sets of the same exercise on one day are shown separately.
    const byExercise = new Map<string, LogWithExercise[]>();
    for (const l of items) {
      const key = `${l.exercise_id}:${l.source}`;
      const list = byExercise.get(key) ?? [];
      list.push(l);
      byExercise.set(key, list);
    }
    return {
      date,
      exercises: [...byExercise.entries()].map(([key, sets]) => ({
        key,
        name: sets[0]!.exercises.name,
        type: sets[0]!.exercises.log_type,
        self: sets[0]!.source === 'self',
        sets: sets.sort((a, b) => a.set_number - b.set_number),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Self workouts (saved by the client themselves, logged with source = 'self')
// ---------------------------------------------------------------------------
export type SelfWorkout = Tables<'self_workouts'>;
export type SelfWorkoutExerciseFull = Tables<'self_workout_exercises'> & { exercises: Exercise };
export type SelfWorkoutFull = SelfWorkout & { self_workout_exercises: SelfWorkoutExerciseFull[] };

/** One exercise to do in a workout – a plan exercise or a self workout exercise. */
export type ExerciseSlot = Pick<
  PlanExerciseFull,
  'id' | 'exercise_id' | 'sets' | 'reps' | 'rest_seconds' | 'notes' | 'exercises'
>;

/** Where logged sets belong: a plan day, or the client's own ("self") training. */
export type LogTarget =
  | { source: 'plan'; planDayId: string }
  | { source: 'self'; selfWorkoutId: string | null };

export function sortSelfWorkout(w: SelfWorkoutFull): SelfWorkoutFull {
  return {
    ...w,
    self_workout_exercises: [...w.self_workout_exercises].sort(
      (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    ),
  };
}
