import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { todayIn } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import type { Macros } from './estimate';

export type Target = Tables<'targets'>;

export const targetsKey = (clientId: string | undefined) => ['targets', clientId] as const;

/** All targets for a client, newest first. */
export function useTargets(clientId: string | undefined) {
  return useQuery({
    queryKey: targetsKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Target[]> => {
      const { data, error } = await supabase
        .from('targets')
        .select('*')
        .eq('client_id', clientId!)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** The target in effect today: the newest one whose start date has arrived. */
export function currentTarget(targets: Target[] | undefined, timeZone?: string): Target | null {
  const today = todayIn(timeZone);
  return targets?.find((t) => t.effective_from <= today) ?? null;
}

/** The next target that starts after today, if any. */
export function upcomingTarget(targets: Target[] | undefined, timeZone?: string): Target | null {
  const today = todayIn(timeZone);
  const future = (targets ?? []).filter((t) => t.effective_from > today);
  return future[future.length - 1] ?? null;
}

export function useSetTarget(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Macros & { effective_from: string; set_by: string }) => {
      const { error } = await supabase.from('targets').insert({ client_id: clientId, ...input });
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient, clientId),
  });
}

export function useDeleteTarget(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('targets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient, clientId),
  });
}

/** Refresh this client's targets and the trainer's client list ("No targets yet" flag). */
function invalidate(queryClient: QueryClient, clientId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: targetsKey(clientId) }),
    queryClient.invalidateQueries({ queryKey: ['trainer'] }),
  ]);
}
