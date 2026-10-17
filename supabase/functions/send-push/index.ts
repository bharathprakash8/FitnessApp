// send-push
// - Signed-in user, { action: 'test' }: sends a test notification to the caller's own devices.
// - Scheduled jobs / other functions (x-cron-secret header): { user_ids, title, body, url?, tag? }.
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const Internal = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(500),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  url: z.string().startsWith('/').max(200).optional(),
  tag: z.string().max(60).optional(),
});

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

serveJson(async (req) => {
  const db = adminClient();
  const body = await req.json().catch(() => ({}));
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret') ?? '';

  if (given && cronSecret && sameSecret(given, cronSecret)) {
    const p = Internal.safeParse(body);
    if (!p.success)
      throw new HttpError(400, p.error.issues[0]?.message ?? 'Invalid input', 'invalid_input');
    const { user_ids, ...msg } = p.data;
    return await sendToUsers(db, user_ids, msg);
  }

  const caller = await requireCaller(req, db);
  if (body?.action !== 'test') throw new HttpError(400, 'Unknown action', 'invalid_input');

  // Limit test sends to 10 a day per user.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const { data: count } = await db.rpc('bump_ai_usage', { uid: caller.id, day, feat: 'push-test' });
  if (Number(count ?? 0) > 10)
    throw new HttpError(429, 'Too many test notifications today', 'rate_limited');

  const r = await sendToUsers(db, [caller.id], {
    title: 'FitCoach test ✅',
    body: 'Notifications are working on this device.',
    url: '/me/notifications',
    tag: 'test',
  });
  if (r.devices === 0) {
    throw new HttpError(409, 'Turn on notifications on this device first.', 'no_devices');
  }
  return r;
});
