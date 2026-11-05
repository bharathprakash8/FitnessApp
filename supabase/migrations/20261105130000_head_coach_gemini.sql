-- The head coach now runs on the server with Gemini, so it no longer needs the owner's PC.
-- A run goes through people a few at a time (functions have a time limit); `progress` remembers
-- who is done. Every 5 minutes from 06:30 to 09:55 IST; the function starts at 07:00 IST.
alter table public.coach_runs drop constraint coach_runs_source_check;
alter table public.coach_runs add constraint coach_runs_source_check
  check (source in ('claude', 'claude_api', 'manual', 'gemini'));
alter table public.coach_runs add column progress jsonb not null default '{}'::jsonb;

select cron.schedule(
  'coach-head-tick',
  '*/5 1-4 * * *',
  $$ select public.call_cron_function('coach', '{"action": "head_tick"}'::jsonb) $$
);
