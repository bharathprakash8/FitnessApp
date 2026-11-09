// setup-login: logs a person in with the one-time setup code the admin sent them (no email
// code needed). Public – the code itself is the proof. POST { code } → { access_token,
// refresh_token }. A code works once, for 7 days, for active clients and trainers only.
// Guessing is slowed down: after 30 wrong codes in an hour from anyone, all tries are refused
// for the rest of that hour (31^8 possible codes, so guessing one is hopeless anyway).
import { z } from 'npm:zod@3';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import { sessionFor } from '../_shared/session.ts';
import { hashSetupCode, normaliseSetupCode } from '../_shared/setupCode.ts';

const MAX_FAILS_PER_HOUR = 30;
const Body = z.object({ code: z.string().max(40) });
const WRONG =
  "This setup code doesn't work. It may be used or expired – ask the admin for a new one.";

serveJson(async (req) => {
  const db = adminClient();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Enter your setup code', 'invalid_input');

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: countErr } = await db
    .from('setup_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ok', false)
    .gte('at', since);
  if (countErr) throw countErr;
  if ((count ?? 0) >= MAX_FAILS_PER_HOUR) {
    throw new HttpError(429, 'Too many tries. Please wait an hour and try again.', 'rate_limited');
  }

  const fail = async () => {
    await db.from('setup_attempts').insert({ ok: false });
    throw new HttpError(400, WRONG, 'bad_code');
  };

  if (normaliseSetupCode(parsed.data.code).length !== 8) return await fail();
  const hash = await hashSetupCode(parsed.data.code);
  const { data: link, error } = await db
    .from('setup_links')
    .select('user_id, expires_at, used_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error) throw error;
  if (!link || link.used_at || new Date(link.expires_at) < new Date()) return await fail();

  const { data: person, error: pErr } = await db
    .from('profiles')
    .select('email, role, is_active')
    .eq('id', link.user_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!person || person.role === 'admin') return await fail();
  if (!person.is_active) {
    throw new HttpError(403, 'Your account is not active. Ask the admin for access.', 'inactive');
  }

  // Mark it used first, so the same code can't log in twice at the same moment.
  const { data: claimed, error: useErr } = await db
    .from('setup_links')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', link.user_id)
    .eq('token_hash', hash)
    .is('used_at', null)
    .select('user_id');
  if (useErr) throw useErr;
  if (!claimed?.length) return await fail();

  await db.from('setup_attempts').insert({ ok: true });
  // Old tries are only needed for the hourly count.
  await db
    .from('setup_attempts')
    .delete()
    .lt('at', new Date(Date.now() - 86400_000).toISOString());
  return await sessionFor(db, person.email);
});
