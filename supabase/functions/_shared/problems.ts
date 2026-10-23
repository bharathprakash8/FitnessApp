// Server-side problems go into the same list as the app's (app_errors, kind 'server'), so the
// admin's Problems tab shows both. Never throws. No request bodies or secrets are stored.
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in user's id from the Authorization header (only used as a label). */
function callerId(req: Request): string | null {
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' && UUID.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

export async function recordServerProblem(
  req: Request,
  status: number,
  code: string,
  message: string,
) {
  try {
    const fn = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? 'function';
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const row = {
      user_id: callerId(req),
      kind: 'server',
      screen: fn,
      message: message.slice(0, 2000),
      details: { status, code: code.slice(0, 300) },
      app_version: 'server',
      platform: 'server',
    };
    const { error } = await db.from('app_errors').insert(row);
    // Unknown user id (deleted account): keep the problem without it.
    if (error && row.user_id) await db.from('app_errors').insert({ ...row, user_id: null });
  } catch {
    /* never let logging break a response */
  }
}
