import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type CoachAction = Tables<'coach_actions'>;
export type CoachRun = Tables<'coach_runs'>;
export type CoachQueryRow = Tables<'coach_queries'>;

export interface CoachPerson {
  id: string;
  full_name: string | null;
  email: string;
  coach_consent_at: string | null;
  health_conditions: string[];
  language: string;
}

export interface CoachMeal {
  id: string;
  meal_type: string;
  eaten_at: string;
  photo_path: string | null;
  items: { name: string; portion: string; calories: number }[];
  total_calories: number;
}

export interface CoachOverview {
  coach: { id: string; full_name: string | null } | null;
  mode: string;
  people: CoachPerson[];
  runs: CoachRun[];
  proposed: CoachAction[];
  recent: CoachAction[];
  questions: CoachQueryRow[];
  playbook: { client_id: string | null; body: string; updated_by: string; updated_at: string }[];
  plans: Map<string, { name: string; days: string[] }>;
  /** Meals and questions the listed changes refer to (for photos and context). */
  meals: Map<string, CoachMeal>;
  queryText: Map<string, string>;
  photoUrls: Record<string, string>;
}

const KEY = ['admin-coach'];

/** Everything the AI Coach tab shows (admins read these tables directly through RLS). */
export function useCoachOverview() {
  return useQuery({
    queryKey: [...KEY, 'overview'],
    queryFn: async (): Promise<CoachOverview> => {
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
        supabase.from('coach_runs').select('*').order('started_at', { ascending: false }).limit(14),
        supabase
          .from('coach_actions')
          .select('*')
          .eq('status', 'proposed')
          .order('created_at', { ascending: true })
          .limit(200),
        supabase
          .from('coach_actions')
          .select('*')
          .in('status', ['applied', 'undone', 'refused', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('coach_queries')
          .select('*')
          .eq('status', 'escalated')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('coach_playbook').select('client_id, body, updated_by, updated_at'),
        coach
          ? supabase
              .from('workout_plans')
              .select('id, name, plan_days(title, day_index)')
              .eq('trainer_id', coach.id)
          : Promise.resolve({ data: [] }),
      ]);

      const actions = [...(proposed.data ?? []), ...(recent.data ?? [])] as CoachAction[];
      const mealIds = [
        ...new Set(
          actions
            .filter((a) => /meal/.test(a.kind) && a.target_id)
            .map((a) => a.target_id as string),
        ),
      ];
      const queryIds = [
        ...new Set(
          actions
            .filter((a) => a.kind === 'answer')
            .map((a) => String((a.after as { query_id?: string } | null)?.query_id ?? '')),
        ),
      ].filter(Boolean);
      const [meals, qs] = await Promise.all([
        mealIds.length
          ? supabase
              .from('meal_logs')
              .select('id, meal_type, eaten_at, photo_path, items, total_calories')
              .in('id', mealIds)
          : Promise.resolve({ data: [] }),
        queryIds.length
          ? supabase.from('coach_queries').select('id, question').in('id', queryIds)
          : Promise.resolve({ data: [] }),
      ]);
      const mealRows = (meals.data ?? []) as unknown as CoachMeal[];
      const paths = mealRows.flatMap((m) => (m.photo_path ? [m.photo_path] : []));
      const photoUrls: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from('meal-photos')
          .createSignedUrls(paths, 3600);
        for (const s of signed ?? []) if (s.path && s.signedUrl) photoUrls[s.path] = s.signedUrl;
      }

      return {
        coach,
        mode: (mode.data?.value as string | undefined) ?? 'dry_run',
        people: ((links.data ?? []) as unknown as { profiles: CoachPerson }[])
          .map((l) => l.profiles)
          .filter(Boolean),
        runs: (runs.data ?? []) as CoachRun[],
        proposed: (proposed.data ?? []) as CoachAction[],
        recent: (recent.data ?? []) as CoachAction[],
        questions: (questions.data ?? []) as CoachQueryRow[],
        playbook: playbook.data ?? [],
        plans: new Map(
          (
            (plans.data ?? []) as {
              id: string;
              name: string;
              plan_days: { title: string; day_index: number }[];
            }[]
          ).map((p) => [
            p.id,
            {
              name: p.name,
              days: [...p.plan_days].sort((a, b) => a.day_index - b.day_index).map((d) => d.title),
            },
          ]),
        ),
        meals: new Map(mealRows.map((m) => [m.id, m])),
        queryText: new Map(
          ((qs.data ?? []) as { id: string; question: string }[]).map((q) => [q.id, q.question]),
        ),
        photoUrls,
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
