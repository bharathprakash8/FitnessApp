import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TablesInsert } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import type { ActivityDay } from './model';

export const activityKey = (clientId: string | undefined, day: string) =>
  ['activity', clientId, day] as const;

export function useActivityDay(clientId: string | undefined, day: string) {
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
    mutationFn: async ({ day, activeCalories }: { day: string; activeCalories: number }) =>
      upsertActivity([
        {
          client_id: clientId!,
          activity_date: day,
          active_calories: activeCalories,
          source: 'manual',
        },
      ]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity'] }),
  });
}
