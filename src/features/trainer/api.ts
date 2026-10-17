import { useQuery } from '@tanstack/react-query';

import { todayIn } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../auth/roles';

export interface TrainerClient {
  profile: Profile;
  hasTarget: boolean;
}

export const myClientsKey = (trainerId: string | undefined) =>
  ['trainer', trainerId, 'clients'] as const;

/** The signed-in trainer's clients (RLS limits every query to mapped clients). */
export function useMyClients(trainerId: string | undefined) {
  return useQuery({
    queryKey: myClientsKey(trainerId),
    enabled: Boolean(trainerId),
    queryFn: async (): Promise<TrainerClient[]> => {
      const { data: links, error } = await supabase
        .from('trainer_clients')
        .select('client_id')
        .eq('trainer_id', trainerId!);
      if (error) throw error;
      const ids = links.map((l) => l.client_id);
      if (ids.length === 0) return [];

      const [profiles, targets] = await Promise.all([
        supabase.from('profiles').select('*').in('id', ids).order('full_name'),
        supabase
          .from('targets')
          .select('client_id')
          .in('client_id', ids)
          .lte('effective_from', todayIn()),
      ]);
      if (profiles.error) throw profiles.error;
      if (targets.error) throw targets.error;
      const withTarget = new Set(targets.data.map((t) => t.client_id));
      return profiles.data.map((p) => ({ profile: p, hasTarget: withTarget.has(p.id) }));
    },
  });
}
