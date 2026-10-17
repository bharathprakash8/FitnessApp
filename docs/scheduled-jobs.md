# Scheduled jobs

Jobs run inside Postgres with `pg_cron` and call Edge Functions over HTTP with `pg_net`
(`public.call_cron_function(fn, body)`). Each call sends an `x-cron-secret` header that the
function checks against its `CRON_SECRET` secret. The service-role key is never stored in
the database.

| Job                   | Schedule (UTC)                   | Function              | What it does                                                                                                   |
| --------------------- | -------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `cron-photo-cleanup`  | `30 17 * * 0` (Sunday 23:00 IST) | `cron-photo-cleanup`  | Deletes meal photos older than 7 days and marks those meals `photo_deleted`                                    |
| `cron-meal-reminders` | `*/15 * * * *`                   | `cron-meal-reminders` | Meal/workout reminders in each client's time zone, only if not logged yet; `notification_log` prevents doubles |

## One-time setup per Supabase project

```powershell
.\scripts\setup-cron-secrets.ps1 -ProjectRef <project-ref>
```

This creates a random secret, saves it as the `CRON_SECRET` function secret, and stores it with
the project URL in Vault (`cron_secret`, `project_url`). It prints nothing secret. Re-running it
rotates the secret.

## Useful SQL (Supabase SQL editor)

```sql
-- jobs and their schedules
select jobid, jobname, schedule, active from cron.job;

-- recent runs
select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;

-- recent HTTP responses from the functions
select status_code, content, created from net._http_response order by created desc limit 10;

-- run the cleanup now with a 0-day cutoff (deletes ALL meal photos – testing only)
select public.call_cron_function('cron-photo-cleanup', jsonb_build_object('days', 0));
```

Tested on dev on 17 Oct 2026: a test photo was removed through the Vault + pg_net path
(status 200, `removed: 2`); a call without the secret got 401.
