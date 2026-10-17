import type { Tables } from '../../lib/database.types';
import type { Profile } from '../auth/roles';
import type { LogWithExercise } from '../workouts/model';

export type ActivityDay = Tables<'activity_daily'>;

export const SOURCE_LABELS: Record<string, string> = {
  health_connect: 'Health Connect',
  apple_shortcut: 'Apple Health',
  manual: 'Entered manually',
  estimated: 'Estimated',
};

/** Rough MET values per exercise type (labelled "Estimated" wherever shown). */
function metFor(log: LogWithExercise): number {
  const type = log.exercises.log_type;
  if (type === 'weights') return 5;
  if (type === 'bodyweight') return 4;
  return log.exercises.muscle_group === 'Cardio' ? 7 : 3.5;
}

const MINUTES_PER_SET = 2.5; // work + rest

/** Active calories from a day's logged sets: MET × kg × hours. */
export function workoutKcal(logs: LogWithExercise[], weightKg: number | null): number {
  if (!weightKg) return 0;
  return Math.round(
    logs.reduce((sum, l) => {
      const minutes =
        l.exercises.log_type === 'timed' ? Number(l.duration_min ?? 0) : MINUTES_PER_SET;
      return sum + metFor(l) * weightKg * (minutes / 60);
    }, 0),
  );
}

/** Basal metabolic rate (Mifflin-St Jeor), kcal per day. */
export function bmr(
  profile: Pick<Profile, 'sex' | 'height_cm'>,
  weightKg: number | null,
  age: number | null,
) {
  if (!weightKg || !profile.height_cm || !age) return null;
  const offset = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  return Math.round(10 * weightKg + 6.25 * Number(profile.height_cm) - 5 * age + offset);
}

/** Share of the day that has passed (1 for past days). */
export function dayFraction(day: string, today: string, timeZone: string): number {
  if (day < today) return 1;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const [h, m] = time.split(':').map(Number);
  return Math.min(1, ((h ?? 0) * 60 + (m ?? 0)) / 1440);
}

export interface Burn {
  active: number;
  activeSource: string; // label
  activeEstimated: boolean;
  resting: number;
  restingEstimated: boolean;
  total: number;
  steps: number | null;
  sleepMinutes: number | null;
  hasDeviceData: boolean;
}

/**
 * Calories burnt for a day. Device or manual data wins; otherwise active burn is estimated
 * from logged workouts and resting burn from BMR (so far today, or the full day for past days).
 */
export function resolveBurn(input: {
  row: ActivityDay | null;
  dayLogs: LogWithExercise[];
  profile: Profile;
  weightKg: number | null;
  age: number | null;
  fraction: number;
}): Burn {
  const { row, dayLogs, profile, weightKg, age, fraction } = input;
  const hasRow = row !== null && row.active_calories !== null;

  const active = hasRow ? row!.active_calories! : workoutKcal(dayLogs, weightKg);
  const activeSource = hasRow
    ? (SOURCE_LABELS[row!.source] ?? row!.source)
    : dayLogs.length
      ? 'Estimated from workouts'
      : 'No activity data';

  const basal = bmr(profile, weightKg, age);
  const resting =
    row?.resting_calories != null ? row.resting_calories : basal ? Math.round(basal * fraction) : 0;

  return {
    active,
    activeSource,
    activeEstimated: !hasRow,
    resting,
    restingEstimated: row?.resting_calories == null,
    total: active + resting,
    steps: row?.steps ?? null,
    sleepMinutes: row?.sleep_minutes ?? null,
    hasDeviceData: hasRow && row!.source !== 'manual',
  };
}

export function formatSleep(minutes: number | null): string {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
