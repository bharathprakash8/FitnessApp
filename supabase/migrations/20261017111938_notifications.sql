-- Milestone 5: push tokens, reminder settings and a log that prevents duplicate reminders.

create table public.reminder_settings (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  breakfast_on boolean not null default true,
  breakfast_time time not null default '08:30',
  lunch_on boolean not null default true,
  lunch_time time not null default '13:30',
  snack_on boolean not null default false,
  snack_time time not null default '17:00',
  dinner_on boolean not null default true,
  dinner_time time not null default '20:30',
  workout_reminder_time time,
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) between 20 and 4096),
  platform text not null check (platform in ('web', 'android')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref_date)
);

alter table public.reminder_settings enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_log enable row level security;
revoke all on public.reminder_settings, public.push_tokens, public.notification_log from anon;

create index push_tokens_user_idx on public.push_tokens (user_id);
create index notification_log_sent_idx on public.notification_log (sent_at);

create trigger touch_reminder_settings
  before update on public.reminder_settings
  for each row execute function public.touch_updated_at();

-- reminder_settings: the client manages their own; admin can read
create policy "reminder_settings_select" on public.reminder_settings
  for select to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

create policy "reminder_settings_insert" on public.reminder_settings
  for insert to authenticated
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

create policy "reminder_settings_update" on public.reminder_settings
  for update to authenticated
  using (client_id = (select auth.uid()) and public.app_role() = 'client')
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

-- push_tokens: every signed-in user manages their own devices
create policy "push_tokens_select" on public.push_tokens
  for select to authenticated
  using ((user_id = (select auth.uid()) and public.app_role() is not null) or public.is_admin());

create policy "push_tokens_insert" on public.push_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.app_role() is not null);

create policy "push_tokens_update" on public.push_tokens
  for update to authenticated
  using (user_id = (select auth.uid()) and public.app_role() is not null)
  with check (user_id = (select auth.uid()) and public.app_role() is not null);

create policy "push_tokens_delete" on public.push_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- notification_log: written by Edge Functions only; admin can read
create policy "notification_log_admin_select" on public.notification_log
  for select to authenticated
  using (public.is_admin());

-- A token moves to whoever registers it last (e.g. a shared phone after logging in as
-- someone else). Runs as owner so it can remove the previous user's row.
create function public.claim_push_token(t text, p text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.app_role() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p not in ('web', 'android') then
    raise exception 'Unknown platform' using errcode = '22023';
  end if;
  insert into public.push_tokens (user_id, token, platform, last_seen_at)
  values ((select auth.uid()), t, p, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

revoke execute on function public.claim_push_token(text, text) from public, anon;
grant execute on function public.claim_push_token(text, text) to authenticated;

-- Reminders run every 15 minutes (see docs/scheduled-jobs.md).
select cron.schedule(
  'cron-meal-reminders',
  '*/15 * * * *',
  $$ select public.call_cron_function('cron-meal-reminders') $$
);
