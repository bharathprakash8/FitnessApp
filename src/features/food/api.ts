import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Json, TablesInsert, TablesUpdate } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import type { MealItem, MealLog, MealType } from './model';

export const mealsKey = (clientId: string | undefined, day: string) =>
  ['meals', clientId, day] as const;

export function useMealsOn(clientId: string | undefined, day: string) {
  return useQuery({
    queryKey: mealsKey(clientId, day),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<MealLog[]> => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('client_id', clientId!)
        .eq('eaten_on', day)
        .order('eaten_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: ['meal', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<MealLog | null> => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Signed (1 hour) URLs for meal photos that still exist. */
export function usePhotoUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ['meal-photo-urls', sorted],
    enabled: sorted.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from('meal-photos')
        .createSignedUrls(sorted, 3600);
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
      return urls;
    },
  });
}

export async function uploadMealPhoto(clientId: string, day: string, photo: Blob): Promise<string> {
  const path = `${clientId}/${day}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from('meal-photos')
    .upload(path, photo, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Could not upload the photo. Check your connection and try again.');
  return path;
}

export interface Analysis {
  items: MealItem[];
  total_calories: number;
  follow_up_question: string | null;
  follow_up_options: string[];
  remaining_today: number;
}

export async function analyzeMeal(input: {
  photo_path?: string;
  text?: string;
  meal_type: MealType;
  follow_up?: { question: string; answer: string };
}): Promise<Analysis> {
  const { data, error } = await supabase.functions.invoke('analyze-meal', { body: input });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'The AI could not read this meal.');
    }
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  return (data as { data: Analysis }).data;
}

function invalidateMeals(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['meals'] }),
    qc.invalidateQueries({ queryKey: ['meal'] }),
  ]);
}

export function useSaveMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meal: TablesInsert<'meal_logs'> & { id?: string }) => {
      const { id, ...fields } = meal;
      const { error } = id
        ? await supabase
            .from('meal_logs')
            .update(fields as TablesUpdate<'meal_logs'>)
            .eq('id', id)
        : await supabase.from('meal_logs').insert(fields);
      if (error) throw error;
    },
    onSuccess: () => invalidateMeals(qc),
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meal: MealLog) => {
      if (meal.photo_path) {
        await supabase.storage.from('meal-photos').remove([meal.photo_path]);
      }
      const { error } = await supabase.from('meal_logs').delete().eq('id', meal.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateMeals(qc),
  });
}

export const itemsJson = (items: MealItem[]) => items as unknown as Json;
