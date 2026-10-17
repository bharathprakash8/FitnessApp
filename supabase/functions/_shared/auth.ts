import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './http.ts';

/** Service-role client. Bypasses RLS – use only after checking the caller. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Caller {
  id: string;
  role: 'admin' | 'trainer' | 'client';
}

/** Verify the caller's JWT and load their active profile. */
export async function requireCaller(req: Request, admin: SupabaseClient): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not signed in', 'unauthorized');

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, 'Not signed in', 'unauthorized');

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile || !profile.is_active) {
    throw new HttpError(403, 'Your account is not active', 'inactive');
  }
  return { id: profile.id, role: profile.role };
}

export async function requireAdmin(req: Request, admin: SupabaseClient): Promise<Caller> {
  const caller = await requireCaller(req, admin);
  if (caller.role !== 'admin') throw new HttpError(403, 'Admins only', 'forbidden');
  return caller;
}
