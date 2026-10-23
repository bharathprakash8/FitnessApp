// support: "Report a problem" from any signed-in person.
//   { action: 'report', message, screenshot_path?, details }
// Saves the report in app_errors (kind 'report', kept until the admin deletes it) and sends
// every admin a push notification. At most 10 reports per person per day.
import { z } from 'npm:zod@3';

import { adminClient, requireCaller } from '../_shared/auth.ts';
import { sendToUsers } from '../_shared/fcm.ts';
import { HttpError, serveJson } from '../_shared/http.ts';

const Report = z.object({
  action: z.literal('report'),
  message: z.string().trim().min(3).max(2000),
  screenshot_path: z.string().max(200).optional(),
  details: z
    .record(z.unknown())
    .refine((d) => JSON.stringify(d).length <= 15000, 'Too much detail')
    .default({}),
  app_version: z.string().max(60).optional(),
  platform: z.string().max(30).optional(),
  device: z.string().max(300).optional(),
  screen: z.string().max(200).optional(),
});

serveJson(async (req) => {
  const db = adminClient();
  const caller = await requireCaller(req, db);
  const parsed = Report.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, 'Please describe the problem in a few words.', 'invalid_input');
  }
  const b = parsed.data;
  if (
    b.screenshot_path &&
    (!b.screenshot_path.startsWith(`${caller.id}/`) || b.screenshot_path.includes('..'))
  ) {
    throw new HttpError(403, 'That screenshot does not belong to you', 'forbidden');
  }

  const { count } = await db
    .from('app_errors')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', caller.id)
    .eq('kind', 'report')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString());
  if ((count ?? 0) >= 10) {
    throw new HttpError(
      429,
      'You have sent 10 reports today. Please try again tomorrow.',
      'rate_limited',
    );
  }

  const { error } = await db.from('app_errors').insert({
    user_id: caller.id,
    kind: 'report',
    message: b.message,
    details: b.details,
    screenshot_path: b.screenshot_path ?? null,
    app_version: b.app_version ?? null,
    platform: b.platform ?? null,
    device: b.device ?? null,
    screen: b.screen ?? null,
  });
  if (error) throw error;

  const [{ data: me }, { data: admins }] = await Promise.all([
    db.from('profiles').select('full_name, email').eq('id', caller.id).single(),
    db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true),
  ]);
  const who = me?.full_name || me?.email || 'Someone';
  await sendToUsers(
    db,
    (admins ?? []).map((a) => a.id),
    {
      title: `Problem reported by ${who}`,
      body: b.message.slice(0, 120),
      url: '/admin',
      tag: 'problem-report',
    },
  ).catch(() => undefined);
  return { ok: true };
});
