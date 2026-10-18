import { useQuery } from '@tanstack/react-query';

import { todayIn } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../auth/roles';

export interface TrainerClient {
  profile: Profile;
  hasTarget: boolean;
}

export const myClientsKey = (trainerId: string | undefined) =>
  ['trainer', trainerId, 'clients'] as const;

/** The signed-in trainer's clients (RLS limits every query to mapped clients). */
export function useMyClients(trainerId: string | undefined) {
  return useQuery({
    queryKey: myClientsKey(trainerId),
    enabled: Boolean(trainerId),
    queryFn: async (): Promise<TrainerClient[]> => {
      const { data: links, error } = await supabase
        .from('trainer_clients')
        .select('client_id')
        .eq('trainer_id', trainerId!);
      if (error) throw error;
      const ids = links.map((l) => l.client_id);
      if (ids.length === 0) return [];

      const [profiles, targets] = await Promise.all([
        supabase.from('profiles').select('*').in('id', ids).order('full_name'),
        supabase
          .from('targets')
          .select('client_id')
          .in('client_id', ids)
          .lte('effective_from', todayIn()),
      ]);
      if (profiles.error) throw profiles.error;
      if (targets.error) throw targets.error;
      const withTarget = new Set(targets.data.map((t) => t.client_id));
      return profiles.data.map((p) => ({ profile: p, hasTarget: withTarget.has(p.id) }));
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard flags (one call for all clients; see trainer_dashboard() in SQL)
// ---------------------------------------------------------------------------
export interface ClientFlag {
  key: string;
  label: string;
  color: 'danger' | 'warning' | 'primary' | 'tertiary';
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function useDashboard(trainerId: string | undefined) {
  return useQuery({
    queryKey: ['trainer-dashboard', trainerId],
    enabled: Boolean(trainerId),
    queryFn: async (): Promise<Map<string, ClientFlag[]>> => {
      const { data, error } = await supabase.rpc('trainer_dashboard');
      if (error) throw error;
      const flags = new Map<string, ClientFlag[]>();
      for (const r of data) {
        const f: ClientFlag[] = [];
        if (!r.last_meal_on || daysBetween(r.last_meal_on, r.today) >= 2) {
          f.push({ key: 'food', label: 'No food log in 2 days', color: 'danger' });
        }
        if (r.plan_since) {
          const since =
            r.last_workout_on && r.last_workout_on > r.plan_since
              ? r.last_workout_on
              : r.plan_since;
          const idle = daysBetween(since, r.today);
          if (idle >= 3)
            f.push({ key: 'workout', label: `No workout in ${idle} days`, color: 'warning' });
        }
        if (r.avg_kcal_3d !== null && r.target_kcal) {
          const pct = Math.round((r.avg_kcal_3d / r.target_kcal) * 100);
          if (pct < 70) f.push({ key: 'low', label: `Eating ${pct}% of target`, color: 'danger' });
          else if (pct > 120)
            f.push({ key: 'high', label: `Eating ${pct}% of target`, color: 'warning' });
        }
        if (r.last_session_missed) {
          f.push({ key: 'session', label: 'Missed last session', color: 'warning' });
        }
        if (r.summary_ready) {
          f.push({ key: 'summary', label: 'Weekly summary ready', color: 'primary' });
        }
        flags.set(r.client_id, f);
      }
      return flags;
    },
  });
}
