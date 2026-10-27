import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type CoachAction = Tables<'coach_actions'>;
export type CoachRun = Tables<'coach_runs'>;
export type CoachQueryRow = Tables<'coach_queries'>;

const KEY = ['admin-coach'];

/** Everything the AI Coach tab shows (admins read these tables directly through RLS). */
export function useCoachOverview() {
  return useQuery({
    queryKey: [...KEY, 'overview'],
    queryFn: async () => {
      const { data: coach } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_ai_coach', true)
        .maybeSingle();
      const [mode, links, runs, proposed, recent, questions, playbook, plans] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'coach_mode').maybeSingle(),
        coach
          ? supabase
              .from('trainer_clients')
              .select(
                'client_id, profiles!trainer_clients_client_id_fkey(id, full_name, email, coach_consent_at, health_conditions, language)',
              )
              .eq('trainer_id', coach.id)
          : Promise.resolve({ data: [] }),
        supabase.from('coach_runs').select('*').order('started_at', { ascending: false }).limit(10),
        supabase
          .from('coach_actions')
          .select('*')
          .eq('status', 'proposed')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('coach_actions')
          .select('*')
          .in('status', ['applied', 'undone', 'refused', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('coach_queries')
          .select('*')
          .eq('status', 'escalated')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('coach_playbook').select('client_id, body, updated_by, updated_at'),
        coach
          ? supabase.from('workout_plans').select('id, name').eq('trainer_id', coach.id)
          : Promise.resolve({ data: [] }),
      ]);
      type Person = {
        id: string;
        full_name: string | null;
        email: string;
        coach_consent_at: string | null;
        health_conditions: string[];
        language: string;
      };
      return {
        coach,
        mode: (mode.data?.value as string | undefined) ?? 'dry_run',
        people: ((links.data ?? []) as unknown as { profiles: Person }[])
          .map((l) => l.profiles)
          .filter(Boolean),
        runs: (runs.data ?? []) as CoachRun[],
        proposed: (proposed.data ?? []) as CoachAction[],
        recent: (recent.data ?? []) as CoachAction[],
        questions: (questions.data ?? []) as CoachQueryRow[],
        playbook: playbook.data ?? [],
        plans: new Map(
          ((plans.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
        ),
      };
    },
  });
}

export function useCoachAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('coach', { body });
      if (!error) return (data as { data: unknown }).data;
      if (error instanceof FunctionsHttpError) {
        const payload = (await (error.context as Response).json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? 'Something went wrong');
      }
      throw new Error('Could not reach the server');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
