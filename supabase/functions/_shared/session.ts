// A login session for a user, made on the server (no email is sent): used by the admin's
// "Log in as" and by one-time setup codes.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function sessionFor(db: SupabaseClient, email: string) {
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw linkErr;
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: s, error: vErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (vErr || !s.session) throw vErr ?? new Error('No session');
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
}
