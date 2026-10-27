-- AI coach day notes: every 30 minutes the coach function writes the morning (from 8:30) and
-- evening (from 20:30) notes in each person's time zone, and at 9 AM IST tells the admins if
-- the head coach hasn't run. Uses call_cron_function (Vault secrets, see photo_cleanup_schedule).
select cron.schedule(
  'coach-tick',
  '5,35 * * * *',
  $$ select public.call_cron_function('coach', '{"action": "tick"}'::jsonb) $$
);
