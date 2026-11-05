-- The consent text promises meal photos are deleted after 7 days. A weekly job could leave a
-- photo for up to 14 days, so it now runs every day (23:00 IST).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'cron-photo-cleanup'),
  schedule := '30 17 * * *'
);
