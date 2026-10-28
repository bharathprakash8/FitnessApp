// cron-photo-cleanup: delete meal photos older than 7 days (weekly, called by pg_cron).
// Auth: the x-cron-secret header must match the CRON_SECRET function secret.
import { z } from 'npm:zod@3';

import { adminClient } from '../_shared/auth.ts';
import { HttpError, serveJson } from '../_shared/http.ts';
import { sameSecret } from '../_shared/util.ts';

const Body = z.object({ days: z.number().int().min(0).max(30).default(7) }).default({});

serveJson(async (req) => {
  const expected = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!expected || !sameSecret(given, expected))
    throw new HttpError(401, 'Not allowed', 'unauthorized');

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, 'Invalid input', 'invalid_input');
  const cutoff = new Date(Date.now() - parsed.data.days * 24 * 3600 * 1000).toISOString();

  const db = adminClient();
  const { data: names, error } = await db.rpc('old_meal_photos', { cutoff });
  if (error) throw error;
  const paths = (names as { name: string }[]).map((n) => n.name);

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error: rmErr } = await db.storage.from('meal-photos').remove(batch);
    if (rmErr) throw rmErr;
    removed += batch.length;
    const { error: upErr } = await db
      .from('meal_logs')
      .update({ photo_deleted: true, photo_path: null })
      .in('photo_path', batch);
    if (upErr) throw upErr;
  }
  console.log(`cron-photo-cleanup removed ${removed} photo(s) older than ${parsed.data.days} days`);
  return { removed, cutoff };
});
