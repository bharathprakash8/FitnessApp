-- Milestone 9: weekly AI summaries for trainers, and the trainer dashboard flags.

create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  -- the 7 days summarised (Monday–Sunday for the scheduled run; last 7 days on demand)
  period_start date not null,
  period_end date not null,
  stats jsonb not null default '{}',
  summary_text text not null default '' check (length(summary_text) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'shared')),
  edited boolean not null default false,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period_start)
);

alter table public.weekly_summaries enable row level security;
revoke all on public.weekly_summaries from anon;
create index weekly_summaries_client_idx on public.weekly_summaries (client_id, period_start desc);

create trigger touch_weekly_summaries
  before update on public.weekly_summaries
  for each row execute function public.touch_updated_at();

-- A trainer's edit of the text is remembered (the next automatic run won't overwrite it).
create function public.mark_summary_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.summary_text is distinct from old.summary_text and (select auth.uid()) is not null then
    new.edited := true;
  end if;
  return new;
end;
$$;

create trigger mark_summary_edited
  before update on public.weekly_summaries
  for each row execute function public.mark_summary_edited();

-- Client: only shared summaries. Trainer: their clients' (and may edit the text).
-- Creating and sharing go through the cron-weekly-summary Edge Function.
create policy "weekly_summaries_select" on public.weekly_summaries
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client' and status = 'shared')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

revoke update on public.weekly_summaries from authenticated;
grant update (summary_text) on public.weekly_summaries to authenticated;

create policy "weekly_summaries_update" on public.weekly_summaries
  for update to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin())
  with check (public.is_trainer_of(client_id) or public.is_admin());

create policy "weekly_summaries_delete" on public.weekly_summaries
  for delete to authenticated
  using ((public.is_trainer_of(client_id) and status = 'draft') or public.is_admin());

-- ---------------------------------------------------------------------------
-- Trainer dashboard: everything the client list needs for its flags, in one call.
-- Dates are in each client's own time zone.
-- ---------------------------------------------------------------------------
create function public.trainer_dashboard()
returns table (
  client_id uuid,
  today date,
  last_meal_on date,
  avg_kcal_3d int,
  target_kcal int,
  plan_since date,
  last_workout_on date,
  last_session_missed boolean,
  summary_ready boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select p.id, (now() at time zone coalesce(p.timezone, 'Asia/Kolkata'))::date as today
    from public.trainer_clients tc
    join public.profiles p on p.id = tc.client_id
    where tc.trainer_id = (select auth.uid())
      and public.app_role() = 'trainer'
      and p.is_active
  )
  select
    c.id,
    c.today,
    (select max(m.eaten_on) from public.meal_logs m where m.client_id = c.id),
    -- average of the last 3 full days that have any food logged
    (select round(avg(d.kcal))::int from (
       select sum(m.total_calories) as kcal from public.meal_logs m
       where m.client_id = c.id and m.eaten_on between c.today - 3 and c.today - 1
       group by m.eaten_on
     ) d),
    (select t.calories from public.targets t
      where t.client_id = c.id and t.effective_from <= c.today
      order by t.effective_from desc, t.created_at desc limit 1),
    (select pa.start_date from public.plan_assignments pa
      where pa.client_id = c.id and pa.is_active limit 1),
    (select max(w.performed_on) from public.workout_logs w where w.client_id = c.id),
    (select a.status = 'missed' from public.session_attendees a
       join public.sessions s on s.id = a.session_id
      where a.client_id = c.id and s.status = 'scheduled' and s.starts_at < now()
      order by s.starts_at desc limit 1),
    exists (select 1 from public.weekly_summaries ws
             where ws.client_id = c.id and ws.status = 'draft')
  from c
$$;

revoke execute on function public.trainer_dashboard() from public, anon;
grant execute on function public.trainer_dashboard() to authenticated;

-- Monday 06:00 IST (00:30 UTC): draft last week's summaries.
select cron.schedule(
  'cron-weekly-summary',
  '30 0 * * 1',
  $$ select public.call_cron_function('cron-weekly-summary') $$
);
