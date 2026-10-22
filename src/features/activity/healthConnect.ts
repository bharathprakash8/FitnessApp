// Android only: read activity from Health Connect and save it to activity_daily.
import { Health, type HealthDataType } from '@capgo/capacitor-health';

import type { TablesInsert } from '../../lib/database.types';
import { isAndroidApp } from '../../lib/platform';
import { upsertActivity } from './api';

// Heart rate is only used to tell in which hours a watch/band was worn (no duplicates with
// logged workouts); it is never stored.
const READ: HealthDataType[] = ['calories', 'totalCalories', 'steps', 'sleep', 'heartRate'];
const LAST_SYNC_KEY = 'fitcoach.healthConnect.lastSync';
const SYNC_DAYS = 7;

export type HcState = 'not_android' | 'not_installed' | 'not_connected' | 'connected';

export async function healthConnectState(): Promise<HcState> {
  if (!isAndroidApp) return 'not_android';
  const { available } = await Health.isAvailable();
  if (!available) return 'not_installed';
  const status = await Health.checkAuthorization({ read: READ });
  return status.readAuthorized.some((t) => t === 'calories' || t === 'totalCalories')
    ? 'connected'
    : 'not_connected';
}

/** Shows the Health Connect permission sheet. Returns true if calories can be read. */
export async function connectHealthConnect(): Promise<boolean> {
  const status = await Health.requestAuthorization({ read: READ });
  return status.readAuthorized.some((t) => t === 'calories' || t === 'totalCalories');
}

export const openHealthConnectSettings = () => Health.openHealthConnectSettings();

export function lastHealthSync(): Date | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

/** A readable message from whatever the plugin or the server threw. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

const localDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

async function dailySums(dataType: HealthDataType, start: Date, end: Date, timeZone: string) {
  const out = new Map<string, number>();
  const { samples } = await Health.queryAggregated({
    dataType,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  });
  for (const s of samples) {
    const day = localDate(s.startDate, timeZone);
    out.set(day, (out.get(day) ?? 0) + (Number(s.value) || 0));
  }
  return out;
}

const localHour = (iso: string, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(
      new Date(iso),
    ),
  );

/**
 * Per local day, the hours (0–23) that have heart-rate readings = the watch/band was worn.
 * null when heart rate can't be read (then we can't tell, see resolveBurn).
 */
async function wornHours(start: Date, end: Date, timeZone: string) {
  const out = new Map<string, Set<number>>();
  try {
    const { samples } = await Health.queryAggregated({
      dataType: 'heartRate',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bucket: 'hour',
      aggregation: 'average',
    });
    for (const s of samples) {
      if (!(Number(s.value) > 0)) continue;
      const day = localDate(s.startDate, timeZone);
      const set = out.get(day) ?? new Set<number>();
      set.add(localHour(s.startDate, timeZone));
      out.set(day, set);
    }
  } catch {
    return null; // heart-rate permission refused
  }
  return out;
}

/**
 * Read the last 7 days and upsert them. Days without calorie data are skipped so a manual
 * entry is never overwritten by an empty reading.
 */
export async function syncHealthConnect(clientId: string, timeZone: string): Promise<number> {
  const end = new Date();
  const start = new Date(end.getTime() - SYNC_DAYS * 86400000);
  start.setHours(0, 0, 0, 0);

  // Each reading on its own: one refused or unsupported type must not stop the rest.
  const problems: string[] = [];
  const safeSums = async (type: HealthDataType) => {
    try {
      return await dailySums(type, start, end, timeZone);
    } catch (e) {
      problems.push(`${type}: ${errorText(e)}`);
      return new Map<string, number>();
    }
  };
  const active = await safeSums('calories');
  const total = await safeSums('totalCalories');
  const steps = await safeSums('steps');
  const worn = await wornHours(start, end, timeZone);
  if (problems.length === 3) {
    throw new Error(`Health Connect refused the readings – ${problems.join('; ')}`);
  }

  // Sleep counts towards the day you wake up.
  const sleep = new Map<string, number>();
  try {
    const { samples } = await Health.readSamples({
      dataType: 'sleep',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 200,
    });
    for (const s of samples) {
      const minutes =
        s.unit === 'minute'
          ? Number(s.value)
          : (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
      const day = localDate(s.endDate, timeZone);
      sleep.set(day, (sleep.get(day) ?? 0) + (Number.isFinite(minutes) ? minutes : 0));
    }
  } catch {
    // sleep permission may be refused – the rest still syncs
  }

  const rows: TablesInsert<'activity_daily'>[] = [];
  const days = new Set([...active.keys(), ...total.keys()]);
  for (const day of days) {
    const a = active.get(day);
    const t = total.get(day);
    const activeKcal = a ?? null;
    if (activeKcal === null && t === undefined) continue;
    const resting = t !== undefined && a !== undefined ? Math.max(0, t - a) : null;
    rows.push({
      client_id: clientId,
      activity_date: day,
      active_calories: Math.round(activeKcal ?? 0),
      resting_calories: resting === null ? null : Math.round(resting),
      steps: steps.has(day) ? Math.round(steps.get(day)!) : null,
      sleep_minutes: sleep.has(day) ? Math.min(1440, Math.round(sleep.get(day)!)) : null,
      worn_hours: worn ? [...(worn.get(day) ?? [])].sort((x, y) => x - y) : null,
      source: 'health_connect',
    });
  }
  try {
    await upsertActivity(rows);
  } catch (e) {
    throw new Error(`Couldn't save to FitCoach – ${errorText(e)}`, { cause: e });
  }
  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    /* storage blocked */
  }
  return rows.length;
}
