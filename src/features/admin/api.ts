import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ANDROID_APP_URL } from '../../config';
import { supabase } from '../../lib/supabase';
import type { Role } from '../auth/roles';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  /** For clients: their trainer's id. */
  trainer_id: string | null;
  /** Only on a create result: whether the welcome email went out. */
  welcome?: { sent: true } | { sent: false; reason: string };
}

export const adminUsersKey = ['admin', 'users'] as const;

/** All users with their trainer mapping. Admin RLS allows reading everything. */
export function useAdminUsers() {
  return useQuery({
    queryKey: adminUsersKey,
    queryFn: async (): Promise<AdminUser[]> => {
      const [profiles, mappings] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, phone, role, is_active, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('trainer_clients').select('client_id, trainer_id'),
      ]);
      if (profiles.error) throw profiles.error;
      if (mappings.error) throw mappings.error;
      const trainerOf = new Map(mappings.data.map((m) => [m.client_id, m.trainer_id]));
      return profiles.data.map((p) => ({
        ...p,
        role: p.role as Role,
        trainer_id: trainerOf.get(p.id) ?? null,
      }));
    },
  });
}

export type AdminAction =
  | {
      action: 'create';
      email: string;
      full_name: string;
      phone?: string;
      role: Role;
      trainer_id?: string;
    }
  | {
      action: 'update';
      user_id: string;
      full_name?: string;
      phone?: string;
      role?: Role;
      trainer_id?: string;
    }
  | { action: 'assign'; client_id: string; trainer_id: string }
  | { action: 'deactivate' | 'reactivate' | 'delete' | 'purge' | 'welcome'; user_id: string };

/** Calls the admin-users Edge Function and turns its { error } into a readable Error. */
async function callAdminUsers(body: AdminAction): Promise<AdminUser | { id: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Something went wrong');
    }
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  return (data as { data: AdminUser | { id: string } }).data;
}

export function useAdminAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: callAdminUsers,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUsersKey }),
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  trainer: 'Trainer',
  client: 'Client',
};

export const ROLE_COLORS: Record<Role, string> = {
  admin: 'tertiary',
  trainer: 'secondary',
  client: 'primary',
};

export function displayName(u: Pick<AdminUser, 'full_name' | 'email'>): string {
  return u.full_name || u.email;
}

/** Text the admin copies and sends to a new user. */
export function loginInstructions(user: Pick<AdminUser, 'full_name' | 'email'>): string {
  const link = window.location.origin;
  const first = (user.full_name || '').split(' ')[0] || 'there';
  return [
    `Hi ${first}! You've been added to FitCoach.`,
    '',
    `Open: ${link}`,
    `Log in with your email (${user.email}). We'll email you a 6-digit code – type it in and you're in.`,
    '',
    'iPhone: open the link in Safari, tap Share, then "Add to Home Screen".',
    `Android: install the FitCoach app from ${ANDROID_APP_URL} (allow "install from this source" when asked).`,
    '',
    `Setup guides: ${link}/guides/iphone.html (iPhone) · ${link}/guides/android.html (Android)`,
    `How to use FitCoach: ${link}/guides/how-to-use.html`,
  ].join('\n');
}
