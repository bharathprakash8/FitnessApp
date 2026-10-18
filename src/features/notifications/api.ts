import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables, TablesInsert } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type ReminderSettings = Tables<'reminder_settings'>;

export const DEFAULT_REMINDERS: Omit<ReminderSettings, 'client_id' | 'updated_at' | 'updated_by'> =
  {
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
    meal_times_locked: false,
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
      return (
        data ?? { ...DEFAULT_REMINDERS, client_id: clientId!, updated_at: '', updated_by: null }
      );
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

// ---------------------------------------------------------------------------
// Trainer's custom reminders for a client
// ---------------------------------------------------------------------------
export type CustomReminder = Tables<'custom_reminders'>;
export type ReminderKind = 'cardio' | 'session' | 'food' | 'other';

export const REMINDER_KINDS: { kind: ReminderKind; label: string; title: string }[] = [
  { kind: 'cardio', label: 'Cardio', title: 'Cardio time 🏃' },
  { kind: 'session', label: 'Session', title: 'Training session today 🏋️' },
  { kind: 'food', label: 'Food update', title: 'Food update 🍽️' },
  { kind: 'other', label: 'Other', title: 'Reminder from your trainer' },
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "Every day", "Mon–Fri", "Mon, Wed, Fri" */
export function describeDays(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (d.join() === '6,7') return 'Weekends';
  return d.map((n) => WEEKDAYS[n - 1]).join(', ');
}

const customKey = (clientId: string | undefined) => ['custom-reminders', clientId] as const;

export function useCustomReminders(clientId: string | undefined) {
  return useQuery({
    queryKey: customKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<CustomReminder[]> => {
      const { data, error } = await supabase
        .from('custom_reminders')
        .select('*')
        .eq('client_id', clientId!)
        .order('remind_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveCustomReminder(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      r: Omit<TablesInsert<'custom_reminders'>, 'client_id'> & { id?: string },
    ) => {
      const { id, ...fields } = r;
      const { error } = id
        ? await supabase.from('custom_reminders').update(fields).eq('id', id)
        : await supabase.from('custom_reminders').insert({ ...fields, client_id: clientId! });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: customKey(clientId) }),
  });
}

export function useDeleteCustomReminder(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: customKey(clientId) }),
  });
}

/** Client: mute or unmute one of the trainer's reminders (when the trainer allows it). */
export function useMuteCustomReminder(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, muted }: { id: string; muted: boolean }) => {
      const { error } = await supabase.from('custom_reminders').update({ muted }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: customKey(clientId) }),
  });
}

/** Whether the client has at least one device that can receive notifications. */
export function useHasPushDevice(clientId: string | undefined) {
  return useQuery({
    queryKey: ['has-push-device', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_push_device', { client: clientId! });
      if (error) throw error;
      return data;
    },
  });
}
