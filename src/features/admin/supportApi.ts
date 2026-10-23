import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type Problem = Tables<'app_errors'>;

/** Problem log, newest first (admin only). */
export function useProblems(filter: { userId?: string; open?: boolean; days?: number }) {
  return useQuery({
    queryKey: ['admin-problems', filter],
    queryFn: async (): Promise<Problem[]> => {
      let q = supabase
        .from('app_errors')
        .select('*')
        .gte('created_at', new Date(Date.now() - (filter.days ?? 30) * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);
      if (filter.userId) q = q.eq('user_id', filter.userId);
      if (filter.open) q = q.eq('resolved', false);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useResolveProblems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, resolved }: { ids: string[]; resolved: boolean }) => {
      const { error } = await supabase
        .from('app_errors')
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-problems'] }),
  });
}

/** 1-hour link to a report's screenshot. */
export function useScreenshotUrl(path: string | null) {
  return useQuery({
    queryKey: ['problem-shot', path],
    enabled: Boolean(path),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('problem-shots')
        .createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export interface Diagnostics {
  today: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  app_version: string | null;
  platform: string | null;
  device: string | null;
  timezone: string;
  onboarded: boolean;
  push_devices: { platform: string; last_seen_at: string }[];
  iphone_code_set: boolean;
  last_sync: { source: string; at: string; date: string } | null;
  synced_days_7: number;
  watch_days_7: number;
  meals_today: number;
  last_meal_on: string | null;
  last_workout_on: string | null;
  ai_today: Record<string, number>;
  errors_7d: number;
  admin_logins: { at: string; admin: string | null }[];
}

export function useDiagnostics(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-diagnostics', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Diagnostics | null> => {
      const { data, error } = await supabase.rpc('admin_user_diagnostics', { uid: userId! });
      if (error) throw error;
      return data as unknown as Diagnostics | null;
    },
  });
}

/** Session tokens for logging in as this person (admin-users function, admin only). */
export async function impersonationTokens(userId: string) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'impersonate', user_id: userId },
  });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(payload?.error?.message ?? 'Could not log in as this user.');
  }
  return (data as { data: { access_token: string; refresh_token: string } }).data;
}
