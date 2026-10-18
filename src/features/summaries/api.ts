import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type WeeklySummary = Tables<'weekly_summaries'>;

/** The numbers saved with each summary (see cron-weekly-summary). */
export interface SummaryStats {
  food?: {
    days_logged: number;
    avg_kcal_on_logged_days: number | null;
    target_kcal: number | null;
    pct_of_target: number | null;
  };
  workouts?: { days_with_workouts: number; self_workout_days: number };
  activity?: { avg_active_kcal: number | null; avg_steps: number | null };
  weight?: { change_kg: number | null; end_kg: number | null };
  sessions?: { attended: number; missed: number };
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cron-weekly-summary', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Something went wrong.');
    }
    throw new Error('Could not reach the server. Check your connection.');
  }
  return (data as { data: T }).data;
}

const key = (clientId: string | undefined) => ['summaries', clientId] as const;

/** Summaries of one client, newest first (clients only get shared ones, by RLS). */
export function useSummaries(clientId: string | undefined) {
  return useQuery({
    queryKey: key(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<WeeklySummary[]> => {
      const { data, error } = await supabase
        .from('weekly_summaries')
        .select('*')
        .eq('client_id', clientId!)
        .order('period_start', { ascending: false })
        .limit(26);
      if (error) throw error;
      return data;
    },
  });
}

function useSummaryMutation<I>(clientId: string, fn: (input: I) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: key(clientId) }),
        qc.invalidateQueries({ queryKey: ['trainer-dashboard'] }),
      ]),
  });
}

export const useGenerateSummary = (clientId: string) =>
  useSummaryMutation(clientId, () =>
    call<{ summary_id: string }>({ action: 'generate', client_id: clientId }),
  );

export const useShareSummary = (clientId: string) =>
  useSummaryMutation(clientId, ({ id, share }: { id: string; share: boolean }) =>
    call({ action: share ? 'share' : 'unshare', summary_id: id }),
  );

export const useSaveSummaryText = (clientId: string) =>
  useSummaryMutation(clientId, async ({ id, text }: { id: string; text: string }) => {
    const { error } = await supabase
      .from('weekly_summaries')
      .update({ summary_text: text })
      .eq('id', id);
    if (error) throw error;
  });

/** "5–11 Oct" */
export function periodLabel(s: Pick<WeeklySummary, 'period_start' | 'period_end'>) {
  const f = (d: string, month: boolean) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      ...(month ? { month: 'short' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`));
  const sameMonth = s.period_start.slice(5, 7) === s.period_end.slice(5, 7);
  return `${f(s.period_start, !sameMonth)}–${f(s.period_end, true)}`;
}
