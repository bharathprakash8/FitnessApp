import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Tables } from '../../lib/database.types';
import { compressImage } from '../../lib/image';
import { enqueue, isNetworkError, useQueuedItems } from '../../lib/offlineQueue';
import { supabase } from '../../lib/supabase';

export type Measurement = Tables<'measurements'>;

export const DEFAULT_WATER_ML = 2500;
export const GLASS_ML = 250;

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Measurements and progress photos
// ---------------------------------------------------------------------------
const measurementsKey = (clientId: string | undefined) => ['measurements', clientId] as const;

export function useMeasurements(clientId: string | undefined) {
  return useQuery({
    queryKey: measurementsKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Measurement[]> => {
      const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('client_id', clientId!)
        .order('measured_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

/** Signed (1 hour) links to progress photos. */
export function useProgressPhotoUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ['progress-photo-urls', sorted],
    enabled: sorted.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from('progress-photos')
        .createSignedUrls(sorted, 3600);
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
      return urls;
    },
  });
}

export interface NewMeasurement {
  measured_on: string;
  weight_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
  photos: File[];
}

function invalidateProgress(qc: ReturnType<typeof useQueryClient>, clientId: string | undefined) {
  return Promise.all([
    // also refreshes the latest weight (['measurements', id, 'latest-weight'])
    qc.invalidateQueries({ queryKey: measurementsKey(clientId) }),
    qc.invalidateQueries({ queryKey: ['trainer-dashboard'] }),
  ]);
}

export function useAddMeasurement(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: NewMeasurement) => {
      // Photos first (compressed on the phone to ~100 KB each), then the entry.
      const paths: string[] = [];
      try {
        for (const file of m.photos.slice(0, 3)) {
          const small = await compressImage(file, 1080, 110_000);
          const path = `${clientId}/${crypto.randomUUID()}.jpg`;
          const { error } = await supabase.storage
            .from('progress-photos')
            .upload(path, small, { contentType: 'image/jpeg', upsert: false });
          if (error) throw new Error('Could not upload a photo. Check your connection.');
          paths.push(path);
        }
        const { error } = await supabase.from('measurements').insert({
          client_id: clientId!,
          measured_on: m.measured_on,
          weight_kg: m.weight_kg,
          waist_cm: m.waist_cm,
          notes: m.notes,
          photo_paths: paths,
        });
        if (error)
          throw new Error(
            error.message.includes('once a week') ? error.message : 'Could not save.',
          );
      } catch (err) {
        // Don't leave orphaned photos behind.
        if (paths.length) await supabase.storage.from('progress-photos').remove(paths);
        throw err;
      }
    },
    onSuccess: () => invalidateProgress(qc, clientId),
  });
}

export function useDeleteMeasurement(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Measurement) => {
      if (m.photo_paths.length)
        await supabase.storage.from('progress-photos').remove(m.photo_paths);
      const { error } = await supabase.from('measurements').delete().eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateProgress(qc, clientId),
  });
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
const waterKey = (clientId: string | undefined, day: string) => ['water', clientId, day] as const;

/** Millilitres drunk on a day (an offline change that hasn't synced yet wins). */
export function useWater(clientId: string | undefined, day: string) {
  const query = useQuery({
    queryKey: waterKey(clientId, day),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('habits_daily')
        .select('water_ml')
        .eq('client_id', clientId!)
        .eq('habit_date', day)
        .maybeSingle();
      if (error) throw error;
      return data?.water_ml ?? 0;
    },
  });
  const queued = useQueuedItems();
  const waiting = queued.find(
    (i) => i.kind === 'water' && i.row.client_id === clientId && i.row.habit_date === day,
  );
  const ml = waiting && waiting.kind === 'water' ? (waiting.row.water_ml ?? 0) : query.data;
  return { ...query, data: ml, offline: Boolean(waiting) };
}

export function useSetWater(clientId: string | undefined, day: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ml: number): Promise<'saved' | 'offline'> => {
      const row = {
        client_id: clientId!,
        habit_date: day,
        water_ml: Math.max(0, Math.min(10_000, ml)),
      };
      // Show the new amount at once.
      qc.setQueryData(waterKey(clientId, day), row.water_ml);
      try {
        const { error } = await supabase
          .from('habits_daily')
          .upsert(row, { onConflict: 'client_id,habit_date' });
        if (error) throw error;
        return 'saved';
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await enqueue({ kind: 'water', id: `water:${clientId}:${day}`, userId: clientId!, row });
        return 'offline';
      }
    },
    onError: () => qc.invalidateQueries({ queryKey: waterKey(clientId, day) }),
  });
}

// ---------------------------------------------------------------------------
// Chart data: last 30 days of food and burn
// ---------------------------------------------------------------------------
export interface DayPoint {
  date: string;
  value: number | null;
}

export function useDailyCalories(clientId: string | undefined, today: string, days = 30) {
  const from = addDays(today, -(days - 1));
  const query = useQuery({
    queryKey: ['chart-calories', clientId, from, today],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const [meals, activity] = await Promise.all([
        supabase
          .from('meal_logs')
          .select('eaten_on, total_calories')
          .eq('client_id', clientId!)
          .gte('eaten_on', from)
          .lte('eaten_on', today),
        supabase
          .from('activity_daily')
          .select('activity_date, active_calories, resting_calories')
          .eq('client_id', clientId!)
          .gte('activity_date', from)
          .lte('activity_date', today),
      ]);
      if (meals.error) throw meals.error;
      if (activity.error) throw activity.error;
      return { meals: meals.data, activity: activity.data };
    },
  });
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const eaten = new Map<string, number>();
    for (const m of query.data.meals)
      eaten.set(m.eaten_on, (eaten.get(m.eaten_on) ?? 0) + m.total_calories);
    const burn = new Map(
      query.data.activity.map((a) => [
        a.activity_date,
        a.active_calories === null ? null : a.active_calories + (a.resting_calories ?? 0),
      ]),
    );
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    return {
      eaten: dates.map((date) => ({ date, value: eaten.get(date) ?? null })),
      burnt: dates.map((date) => ({ date, value: burn.get(date) ?? null })),
    };
  }, [query.data, from, days]);
  return { ...query, data };
}
