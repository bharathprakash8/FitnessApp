// Admin "log in as user": the admin's own session is kept aside while the app runs as the
// chosen person, so "Back to admin" can return without a new login code.
import { clearPersistedCache, queryClient } from './queryClient';
import { supabase } from './supabase';

const KEY = 'fitcoach.adminReturn';

interface AdminReturn {
  refresh_token: string;
  userName: string;
}

function read(): AdminReturn | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as AdminReturn) : null;
  } catch {
    return null;
  }
}

/** True while the admin is logged in as someone else on this device. */
export function isImpersonating(): boolean {
  return read() !== null;
}

/** Name of the person the admin is logged in as, if any. */
export function impersonatedName(): string | null {
  return read()?.userName ?? null;
}

async function resetLocalData() {
  queryClient.clear();
  await clearPersistedCache();
}

/** Switch this device to the given person's session (tokens from the admin-users function). */
export async function startImpersonation(
  tokens: { access_token: string; refresh_token: string },
  userName: string,
) {
  const { data } = await supabase.auth.getSession();
  const admin = data.session;
  if (!admin) throw new Error('Not signed in');
  localStorage.setItem(KEY, JSON.stringify({ refresh_token: admin.refresh_token, userName }));
  const { error } = await supabase.auth.setSession(tokens);
  if (error) {
    localStorage.removeItem(KEY);
    throw error;
  }
  await resetLocalData();
}

/** Back to the admin's own account (or to the login page if that session has expired). */
export async function stopImpersonation() {
  const saved = read();
  localStorage.removeItem(KEY);
  await resetLocalData();
  if (!saved) return false;
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  const { error } = await supabase.auth.refreshSession({ refresh_token: saved.refresh_token });
  return !error;
}

/** Called on log out: forget a stored admin session too. */
export function forgetImpersonation() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
