import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables, TablesUpdate } from '../../lib/database.types';
import { todayIn } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { profileKey } from '../auth/api';
import type { Profile } from '../auth/roles';

export type Measurement = Tables<'measurements'>;

export const latestWeightKey = (clientId: string | undefined) =>
  ['measurements', clientId, 'latest-weight'] as const;

/** Most recent measurement that has a weight. */
export function useLatestWeight(clientId: string | undefined) {
  return useQuery({
    queryKey: latestWeightKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Measurement | null> => {
      const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('client_id', clientId!)
        .not('weight_kg', 'is', null)
        .order('measured_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Another user's profile (a trainer looking at a client, or a client at their trainer).
 * `initial` (e.g. from the trainer's client list) shows the page at once; it is still
 * refreshed from the server in the background.
 */
export function useProfileById(id: string | undefined, initial?: Profile) {
  return useQuery({
    queryKey: ['profiles', id],
    enabled: Boolean(id),
    initialData: initial,
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** The signed-in client's trainer profile (null if none). */
export function useMyTrainer(clientId: string | undefined) {
  return useQuery({
    queryKey: ['my-trainer', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<Profile | null> => {
      // One request: the mapping with the trainer's profile embedded.
      const { data: link, error } = await supabase
        .from('trainer_clients')
        .select('profiles!trainer_clients_trainer_id_fkey(*)')
        .eq('client_id', clientId!)
        .maybeSingle();
      if (error) throw error;
      return (link?.profiles as unknown as Profile | null) ?? null;
    },
  });
}

export interface ClientDetails {
  date_of_birth: string;
  sex: string;
  height_cm: number;
  weight_kg: number;
  goal: string;
  goal_other: string | null;
  diet_preference: string;
  injuries: string | null;
}

/**
 * Save a client's own details. Weight goes to measurements (a new row only when it changed).
 * `finishOnboarding` also stamps onboarded_at.
 */
export function useSaveClientDetails(profile: Profile | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      details,
      previousWeight,
      finishOnboarding,
    }: {
      details: ClientDetails;
      previousWeight: number | null;
      finishOnboarding?: boolean;
    }) => {
      if (!profile) throw new Error('Not signed in');
      if (details.weight_kg !== previousWeight) {
        const { error } = await supabase.from('measurements').insert({
          client_id: profile.id,
          weight_kg: details.weight_kg,
          measured_on: todayIn(profile.timezone),
        });
        if (error) throw error;
      }
      const changes: TablesUpdate<'profiles'> = {
        date_of_birth: details.date_of_birth,
        sex: details.sex,
        height_cm: details.height_cm,
        goal: details.goal,
        goal_other: details.goal === 'other' ? details.goal_other : null,
        diet_preference: details.diet_preference,
        injuries: details.injuries,
      };
      if (finishOnboarding) changes.onboarded_at = new Date().toISOString();
      const { error } = await supabase.from('profiles').update(changes).eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKey(profile?.id) }),
        queryClient.invalidateQueries({ queryKey: latestWeightKey(profile?.id) }),
      ]),
  });
}

/** Name and phone, which every user can change for themselves. */
export function useSaveBasics(profile: Profile | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (basics: { full_name: string; phone: string | null }) => {
      if (!profile) throw new Error('Not signed in');
      const { error } = await supabase.from('profiles').update(basics).eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(profile?.id) }),
  });
}

/** The user's own time zone (used for reminders, sessions and "today"). */
export function useSaveTimeZone(profile: Profile | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (timezone: string) => {
      if (!profile) throw new Error('Not signed in');
      const { error } = await supabase.from('profiles').update({ timezone }).eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(profile?.id) }),
  });
}

export function useAcceptConsent(profile: Profile | null, version: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({ consent_at: new Date().toISOString(), consent_version: version })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(profile?.id) }),
  });
}
