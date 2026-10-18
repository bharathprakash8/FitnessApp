import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { TablesInsert } from '../../lib/database.types';
import { enqueue, isNetworkError, useQueuedItems } from '../../lib/offlineQueue';
import { supabase } from '../../lib/supabase';
import type { ActivityDay } from './model';

export const activityKey = (clientId: string | undefined, day: string) =>
  ['activity', clientId, day] as const;

/** One day's activity; a manual entry saved offline wins until it has synced. */
export function useActivityDay(clientId: string | undefined, day: string) {
  const query = useActivityDayFromServer(clientId, day);
  const queued = useQueuedItems();
  const data = useMemo(() => {
    const waiting = queued.find(
      (i) => i.kind === 'activity' && i.row.client_id === clientId && i.row.activity_date === day,
    );
    if (!waiting || waiting.kind !== 'activity') return query.data;
    return {
      ...(query.data ?? {
        resting_calories: null,
        steps: null,
        sleep_minutes: null,
        updated_at: waiting.createdAt,
      }),
      ...waiting.row,
    } as ActivityDay;
  }, [query.data, queued, clientId, day]);
  return { ...query, data };
}

function useActivityDayFromServer(clientId: string | undefined, day: string) {
  return useQuery({
    queryKey: activityKey(clientId, day),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ActivityDay | null> => {
      const { data, error } = await supabase
        .from('activity_daily')
        .select('*')
        .eq('client_id', clientId!)
        .eq('activity_date', day)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Insert or update days of activity for the signed-in client. */
export async function upsertActivity(rows: TablesInsert<'activity_daily'>[]) {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('activity_daily')
    .upsert(rows, { onConflict: 'client_id,activity_date' });
  if (error) throw error;
}

export function useSaveManualActivity(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      day,
      activeCalories,
    }: {
      day: string;
      activeCalories: number;
    }): Promise<'saved' | 'offline'> => {
      const row = {
        client_id: clientId!,
        activity_date: day,
        active_calories: activeCalories,
        source: 'manual' as const,
      };
      try {
        await upsertActivity([row]);
        return 'saved';
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        // One waiting entry per day: a newer one replaces the older.
        await enqueue({
          kind: 'activity',
          id: `activity:${clientId}:${day}`,
          userId: clientId!,
          row,
        });
        return 'offline';
      }
    },
    onSuccess: (result) =>
      result === 'saved' ? qc.invalidateQueries({ queryKey: ['activity'] }) : undefined,
  });
}
