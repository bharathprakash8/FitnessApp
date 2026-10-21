import { FunctionsHttpError } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { addDays } from './model';

/** Everything the Stats tab needs for one person and the last `days` days (one request each). */
export function useStatsData(personId: string | undefined, today: string, days: number) {
  const from = addDays(today, -days);
  return useQuery({
    queryKey: ['stats', personId, from, today],
    enabled: Boolean(personId),
    queryFn: async () => {
      const [meals, activity, water] = await Promise.all([
        supabase
          .from('meal_logs')
          .select('eaten_on, eaten_at, meal_type, items, total_calories, protein_g, carbs_g, fat_g')
          .eq('client_id', personId!)
          .gte('eaten_on', from)
          .lte('eaten_on', today)
          .limit(2000),
        supabase
          .from('activity_daily')
          .select('*')
          .eq('client_id', personId!)
          .gte('activity_date', from)
          .lte('activity_date', today),
        supabase
          .from('habits_daily')
          .select('habit_date, water_ml')
          .eq('client_id', personId!)
          .gte('habit_date', from)
          .lte('habit_date', today),
      ]);
      if (meals.error) throw meals.error;
      if (activity.error) throw activity.error;
      if (water.error) throw water.error;
      return { meals: meals.data, activity: activity.data, water: water.data };
    },
  });
}

export interface Insights {
  insights: string[];
  focus: string;
  made_on: string;
}

/** Saved insights for today, if any (no AI call). */
export function useSavedInsights(personId: string | undefined, today: string) {
  return useQuery({
    queryKey: ['insights', personId, today],
    enabled: Boolean(personId),
    queryFn: async (): Promise<Insights | null> => {
      const { data, error } = await supabase
        .from('stats_insights')
        .select('insights, focus, made_on')
        .eq('client_id', personId!)
        .order('made_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Insights | null;
    },
  });
}

/** Ask the AI for today's insights (once per day per person; the server keeps them). */
export async function requestInsights(personId: string, stats: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('coach-ai', {
    body: { action: 'insights', client_id: personId, stats },
  });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(payload?.error?.message ?? 'Insights are not available right now.');
  }
  return (data as { data: Insights }).data;
}
