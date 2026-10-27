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
  /** Assisted mode: the human trainer the AI helps (null = AI-only). */
  assisted_by?: string | null;
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
  /** Admin: off | dry_run | live. Trainer: auto | review (their own approval setting). */
  mode: string;
  scope: 'admin' | 'trainer';
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

/**
 * Everything the AI Coach screen shows. Admin: everyone on the AI coach (both ways).
 * Trainer (`trainerId`): only their own clients with the AI assistant switched on – the
 * database rules already limit what a trainer can read.
 */
export function useCoachOverview(trainerId?: string) {
  return useQuery({
    queryKey: [...KEY, 'overview', trainerId ?? 'admin'],
    queryFn: async (): Promise<CoachOverview> => {
      const { data: coach } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_ai_coach', true)
        .maybeSingle();
      const [mode, links, runs, proposed, recent, questions, playbook, plans] = await Promise.all([
        trainerId
          ? supabase.from('profiles').select('ai_auto_apply').eq('id', trainerId).maybeSingle()
          : supabase.from('app_settings').select('value').eq('key', 'coach_mode').maybeSingle(),
        // Trainers can't read the coach account itself – they don't need it.
        coach || trainerId
          ? (() => {
              const q = supabase
                .from('trainer_clients')
                .select(
                  'client_id, trainer_id, ai_assist, client:profiles!trainer_clients_client_id_fkey(id, full_name, email, coach_consent_at, health_conditions, language), trainer:profiles!trainer_clients_trainer_id_fkey(full_name)',
                );
              return trainerId
                ? q.eq('trainer_id', trainerId).eq('ai_assist', true)
                : q.or(`trainer_id.eq.${coach!.id},ai_assist.eq.true`);
            })()
          : Promise.resolve({ data: [] }),
        trainerId
          ? Promise.resolve({ data: [] })
          : supabase
              .from('coach_runs')
              .select('*')
              .order('started_at', { ascending: false })
              .limit(14),
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
        scope: trainerId ? 'trainer' : 'admin',
        mode: trainerId
          ? (mode.data as { ai_auto_apply?: boolean } | null)?.ai_auto_apply
            ? 'auto'
            : 'review'
          : (((mode.data as { value?: unknown } | null)?.value as string | undefined) ?? 'dry_run'),
        people: (
          (links.data ?? []) as unknown as {
            trainer_id: string;
            client: CoachPerson | null;
            trainer: { full_name: string | null } | null;
          }[]
        )
          .filter((l) => l.client)
          .map((l) => ({
            ...l.client!,
            assisted_by: l.trainer_id === coach?.id ? null : (l.trainer?.full_name ?? 'Trainer'),
          })),
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
