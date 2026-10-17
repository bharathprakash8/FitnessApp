-- Milestone 4: daily activity (calories burnt, steps, sleep) from Health Connect, the iPhone
-- Shortcut or manual entry.

create table public.activity_daily (
  client_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  active_calories int check (active_calories is null or active_calories between 0 and 10000),
  resting_calories int check (resting_calories is null or resting_calories between 0 and 6000),
  steps int check (steps is null or steps between 0 and 200000),
  sleep_minutes int check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  source text not null check (source in ('health_connect', 'apple_shortcut', 'manual', 'estimated')),
  updated_at timestamptz not null default now(),
  primary key (client_id, activity_date)
);

alter table public.activity_daily enable row level security;
revoke all on public.activity_daily from anon;

create trigger touch_activity_daily
  before update on public.activity_daily
  for each row execute function public.touch_updated_at();

create policy "activity_daily_select" on public.activity_daily
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "activity_daily_insert" on public.activity_daily
  for insert to authenticated
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

create policy "activity_daily_update" on public.activity_daily
  for update to authenticated
  using (client_id = (select auth.uid()) and public.app_role() = 'client')
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

create policy "activity_daily_delete" on public.activity_daily
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

-- The iPhone Shortcut token is looked up by its SHA-256 hash; each hash belongs to one user.
create unique index profiles_health_sync_token_hash_key
  on public.profiles (health_sync_token_hash)
  where health_sync_token_hash is not null;

create or replace function public.user_has_data(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trainer_clients where trainer_id = uid)
    or exists (select 1 from public.targets where client_id = uid)
    or exists (select 1 from public.measurements where client_id = uid)
    or exists (select 1 from public.workout_logs where client_id = uid)
    or exists (select 1 from public.workout_plans where trainer_id = uid)
    or exists (select 1 from public.exercises where trainer_id = uid)
    or exists (select 1 from public.meal_logs where client_id = uid)
    or exists (select 1 from public.activity_daily where client_id = uid)
$$;
