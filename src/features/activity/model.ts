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
  if (log.exercises.muscle_group === 'Yoga') {
    // Sun salutations are brisk; holding poses, breathing and relaxation are light.
    return /surya|sun salutation/i.test(log.exercises.name)
      ? 3.8
      : /anulom|breath|shavasana|relax/i.test(log.exercises.name)
        ? 1.3
        : 2.5;
  }
  return log.exercises.muscle_group === 'Cardio' ? 7 : 3.5;
}

const MINUTES_PER_SET = 2.5; // work + rest

/** Calories for one logged set: the machine's number if given, else MET × kg × hours. */
export function logKcal(l: LogWithExercise, weightKg: number | null): number {
  if (l.machine_kcal != null) return l.machine_kcal;
  if (!weightKg) return 0;
  const minutes = l.exercises.log_type === 'timed' ? Number(l.duration_min ?? 0) : MINUTES_PER_SET;
  return metFor(l) * weightKg * (minutes / 60);
}

/** Active calories from a day's logged sets. */
export function workoutKcal(logs: LogWithExercise[], weightKg: number | null): number {
  return Math.round(logs.reduce((sum, l) => sum + logKcal(l, weightKg), 0));
}

/** Walking and running are already counted by any phone (steps), with or without a watch. */
const PHONE_COUNTS = /walk|run|jog|treadmill|hike|hiking|stair/i;

const localHour = (d: Date, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(d),
  );
const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);

/**
 * The local hours a logged set covers (a timed set ends at performed_at and started
 * duration_min earlier), or null when the time isn't known.
 */
function hoursOf(l: LogWithExercise, timeZone: string): number[] | null {
  if (!l.performed_at) return null;
  const end = new Date(l.performed_at);
  if (localDay(end, timeZone) !== l.performed_on) return null; // older logs: time unknown
  const minutes = l.exercises.log_type === 'timed' ? Number(l.duration_min ?? 0) : 0;
  const first = localHour(new Date(end.getTime() - minutes * 60000), timeZone);
  const last = localHour(end, timeZone);
  const hours: number[] = [];
  for (let h = first <= last ? first : 0; h <= last; h++) hours.push(h);
  return hours;
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
  /** Part of active added from logged workouts the watch/phone didn't record. */
  workoutAdded: number;
  /** Logged exercises (names) the watch already counted, so they weren't added again. */
  countedByWatch: string[];
  resting: number;
  restingEstimated: boolean;
  total: number;
  steps: number | null;
  sleepMinutes: number | null;
  hasDeviceData: boolean;
  /** null = can't tell (old sync); otherwise hours the watch was worn that day. */
  wornHours: number | null;
}

/**
 * Calories burnt for a day, without counting anything twice:
 *  * Device data (Apple Health / Health Connect) gives the base active burn.
 *  * Each logged workout is checked against the hours the watch was worn that day. If the
 *    watch was on, it already counted that workout; if not, the workout is added (the
 *    machine's number if entered, else an estimate). Walking/running is never added on top
 *    of device data – phones count it from steps.
 *  * If we can't tell which hours the watch was worn (older sync), a day with resting-energy
 *    data is treated as "watch worn all day" (nothing added) – the safe choice.
 *  * Manual entry is taken as the full day's active burn.
 *  * No device data: active = logged workouts.
 *  * Resting: the watch's resting energy plus BMR for the hours it wasn't worn (iPhone only;
 *    Health Connect's total already includes the full resting burn), else BMR so far.
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
  const tz = profile.timezone;
  const hasRow = row !== null && row.active_calories !== null;
  const isDevice = hasRow && row!.source !== 'manual';

  // Which hours the watch was worn (null = unknown, treated as worn all day if it gave resting).
  const worn: Set<number> | 'all' | 'none' = !isDevice
    ? 'none'
    : row!.worn_hours
      ? new Set(row!.worn_hours)
      : (row!.resting_calories ?? 0) > 0
        ? 'all'
        : 'none';

  let workoutAdded = 0;
  const counted = new Set<string>();
  if (!hasRow) {
    workoutAdded = workoutKcal(dayLogs, weightKg);
  } else if (isDevice) {
    for (const l of dayLogs) {
      const hours = hoursOf(l, tz);
      const seen =
        worn === 'all' ||
        (worn !== 'none' && (hours === null ? worn.size > 0 : hours.some((h) => worn.has(h))));
      if (seen) counted.add(l.exercises.name);
      else if (!PHONE_COUNTS.test(l.exercises.name)) workoutAdded += logKcal(l, weightKg);
    }
    workoutAdded = Math.round(workoutAdded);
  }

  const active = (hasRow ? row!.active_calories! : 0) + workoutAdded;
  const activeSource = hasRow
    ? (SOURCE_LABELS[row!.source] ?? row!.source) + (workoutAdded > 0 ? ' + logged workouts' : '')
    : dayLogs.length
      ? 'Estimated from workouts'
      : 'No activity data';

  const basal = bmr(profile, weightKg, age);
  let resting: number;
  let restingEstimated: boolean;
  if (row?.resting_calories != null) {
    resting = row.resting_calories;
    restingEstimated = false;
    if (row.source === 'apple_shortcut' && worn instanceof Set && basal) {
      // Watch resting energy covers only the hours it was worn; add BMR for the others.
      const elapsed = Math.round(fraction * 24);
      const unworn = Array.from({ length: elapsed }, (_, h) => h).filter((h) => !worn.has(h));
      if (unworn.length) {
        resting += Math.round((basal * unworn.length) / 24);
        restingEstimated = true;
      }
    }
  } else {
    resting = basal ? Math.round(basal * fraction) : 0;
    restingEstimated = true;
  }

  return {
    active,
    activeSource,
    activeEstimated: !hasRow || workoutAdded > 0,
    workoutAdded,
    countedByWatch: [...counted],
    resting,
    restingEstimated,
    total: active + resting,
    steps: row?.steps ?? null,
    sleepMinutes: row?.sleep_minutes ?? null,
    hasDeviceData: isDevice,
    wornHours: worn instanceof Set ? worn.size : worn === 'all' ? 24 : isDevice ? 0 : null,
  };
}

export function formatSleep(minutes: number | null): string {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
