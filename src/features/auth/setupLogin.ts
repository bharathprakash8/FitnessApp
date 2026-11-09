import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';

/** "kx7p m3qd" → "KX7P-M3QD" (as the admin's message shows it). */
export function formatSetupCode(raw: string): string {
  const c = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export const setupCodeComplete = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').length === 8;

/**
 * Log in with the one-time setup code the admin sent on WhatsApp (setup-login function).
 * On success AuthProvider picks up the session.
 */
export async function loginWithSetupCode(code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('setup-login', { body: { code } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Something went wrong. Please try again.');
    }
    throw new Error("Couldn't reach the server. Check your internet and try again.");
  }
  const tokens = (data as { data: { access_token: string; refresh_token: string } }).data;
  const { error: sErr } = await supabase.auth.setSession(tokens);
  if (sErr) throw new Error('Could not log in. Please try again.');
}
