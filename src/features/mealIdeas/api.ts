import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json, Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export interface PlanMeal {
  meal: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  dish: string;
  portion: string;
  kcal: number;
  protein_g: number;
}
export interface PlanDay {
  day: number;
  meals: PlanMeal[];
  total_kcal: number;
  total_protein_g: number;
}
export type MealPlan = Omit<Tables<'meal_plans'>, 'days'> & { days: PlanDay[] };

const plansKey = (clientId: string | undefined) => ['meal-plans', clientId] as const;

/** A client's plans, newest first (a client only ever sees the shared one). */
export function useMealPlans(clientId: string | undefined) {
  return useQuery({
    queryKey: plansKey(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<MealPlan[]> => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as MealPlan[];
    },
  });
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('coach-ai', { body });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(payload?.error?.message ?? 'Something went wrong. Please try again.');
  }
  return (data as { data: Record<string, unknown> }).data;
}

export function useDraftPlan(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { note?: string; target_kcal?: number; target_protein_g?: number }) =>
      invoke({ action: 'plan_draft', client_id: clientId, ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey(clientId) }),
  });
}

export function useSharePlan(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, share }: { planId: string; share: boolean }) =>
      invoke({ action: share ? 'plan_share' : 'plan_unshare', plan_id: planId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey(clientId) }),
  });
}

/** Save the trainer's edits; day totals are always recalculated from the meals. */
export function useUpdatePlan(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      days,
      note,
    }: {
      id: string;
      days: PlanDay[];
      note?: string | null;
    }) => {
      const fixed = days.map((d) => ({
        ...d,
        total_kcal: d.meals.reduce((s, m) => s + m.kcal, 0),
        total_protein_g: d.meals.reduce((s, m) => s + m.protein_g, 0),
      }));
      const { error } = await supabase
        .from('meal_plans')
        .update({ days: fixed as unknown as Json, ...(note !== undefined ? { note } : {}) })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey(clientId) }),
  });
}

export function useDeletePlan(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey(clientId) }),
  });
}

/** The client themself or their trainer sets "foods to avoid". */
export async function setFoodsToAvoid(personId: string, foods: string) {
  const { error } = await supabase.rpc('set_foods_to_avoid', { person: personId, foods });
  if (error) throw error;
}
