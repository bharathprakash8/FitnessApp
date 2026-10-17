import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables, TablesInsert } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type ReminderSettings = Tables<'reminder_settings'>;

export const DEFAULT_REMINDERS: Omit<ReminderSettings, 'client_id' | 'updated_at'> = {
  enabled: true,
  breakfast_on: true,
  breakfast_time: '08:30',
  lunch_on: true,
  lunch_time: '13:30',
  snack_on: false,
  snack_time: '17:00',
  dinner_on: true,
  dinner_time: '20:30',
  workout_reminder_time: null,
};

const key = (clientId: string | undefined) => ['reminder-settings', clientId] as const;

/** The client's reminder settings, or the defaults if they never changed them. */
export function useReminderSettings(clientId: string | undefined) {
  return useQuery({
    queryKey: key(clientId),
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_settings')
        .select('*')
        .eq('client_id', clientId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { ...DEFAULT_REMINDERS, client_id: clientId!, updated_at: '' };
    },
  });
}

export function useSaveReminderSettings(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Omit<TablesInsert<'reminder_settings'>, 'client_id'>) => {
      const { error } = await supabase
        .from('reminder_settings')
        .upsert({ ...s, client_id: clientId! }, { onConflict: 'client_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clientId) }),
  });
}
