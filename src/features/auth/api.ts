import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Profile } from './roles';

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

/**
 * The signed-in user's profile. Resolves to null when RLS hides the row,
 * which happens when the account has been deactivated.
 */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
