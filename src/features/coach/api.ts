import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json, Tables } from '../../lib/database.types';
import { logError } from '../../lib/errorLog';
import { supabase } from '../../lib/supabase';
import { profileKey } from '../auth/api';
import type { Profile } from '../auth/roles';
import type { MealItem, MealLog } from '../food/model';
import { useMyTrainer } from '../profile/api';

export type CoachDayPlan = Tables<'coach_day_plans'>;
export type CoachNote = Tables<'coach_notes'>;
export type CoachQuery = Tables<'coach_queries'>;

/** The person is mapped to the AI coach (clients only). */
export function useIsAiCoached(profile: Profile | null | undefined) {
  const trainer = useMyTrainer(profile?.role === 'client' ? profile.id : undefined);
  return Boolean(trainer.data?.is_ai_coach);
}

/** Today's plan and notes from the coach. */
export function useCoachDay(clientId: string | undefined, day: string, enabled = true) {
  return useQuery({
    queryKey: ['coach-day', clientId, day],
    enabled: Boolean(clientId) && enabled,
    queryFn: async () => {
      const [plan, notes] = await Promise.all([
        supabase
          .from('coach_day_plans')
          .select('*')
          .eq('client_id', clientId!)
          .eq('plan_date', day)
          .maybeSingle(),
        supabase
          .from('coach_notes')
          .select('*')
          .eq('client_id', clientId!)
          .eq('note_date', day)
          .order('created_at'),
      ]);
      if (plan.error) throw plan.error;
      if (notes.error) throw notes.error;
      return { plan: plan.data as CoachDayPlan | null, notes: (notes.data ?? []) as CoachNote[] };
    },
  });
}

export function useCoachQueries(clientId: string | undefined) {
  return useQuery({
    queryKey: ['coach-queries', clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<CoachQuery[]> => {
      const { data, error } = await supabase
        .from('coach_queries')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });
}

export function useAskCoach(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (question: string): Promise<CoachQuery> => {
      const { data, error } = await supabase.functions.invoke('coach', {
        body: { action: 'ask', question },
      });
      if (!error) return (data as { data: CoachQuery }).data;
      if (error instanceof FunctionsHttpError) {
        const payload = (await (error.context as Response).json().catch(() => null)) as {
          error?: { message?: string; code?: string };
        } | null;
        void logError('ai', payload?.error?.message ?? 'coach ask failed', {
          code: payload?.error?.code ?? '',
        });
        throw new Error(payload?.error?.message ?? 'The coach could not answer just now.');
      }
      throw new Error('Could not reach the server. Check your connection and try again.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach-queries', clientId] }),
  });
}

export function useAcceptCoachConsent(profile: Profile | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ coach_consent_at: new Date().toISOString() })
        .eq('id', profile!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey(profile?.id) }),
  });
}

export interface CoachSuggestion {
  items: MealItem[];
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  reason: string;
}

export const suggestionOf = (meal: Pick<MealLog, 'coach_suggestion'>) =>
  (meal.coach_suggestion as unknown as CoachSuggestion | null) ?? null;

/** Accept the coach's suggested numbers for a meal, or keep the person's own. */
export function useResolveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ meal, accept }: { meal: MealLog; accept: boolean }) => {
      const s = suggestionOf(meal);
      const { error } = await supabase
        .from('meal_logs')
        .update(
          accept && s
            ? {
                items: s.items as unknown as Json,
                total_calories: Math.round(s.total_calories),
                protein_g: s.protein_g,
                carbs_g: s.carbs_g,
                fat_g: s.fat_g,
                coach_original: {
                  items: meal.items,
                  total_calories: meal.total_calories,
                } as unknown as Json,
                coach_reason: s.reason,
                coach_suggestion: null,
              }
            : { coach_suggestion: null },
        )
        .eq('id', meal.id);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['meals'] }),
        qc.invalidateQueries({ queryKey: ['meal'] }),
      ]),
  });
}
