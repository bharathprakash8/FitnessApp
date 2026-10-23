-- Admin support tools (23 Oct 2026):
--  * app_errors: problems the app and the server run into (crashes, failed saves, sync and
--    AI errors) and "Report a problem" messages. The app writes its own rows (max 50 per
--    person per day); only admins read and resolve them. Kept 30 days (reports kept).
--  * problem-shots bucket: optional screenshot attached to a report.
--  * profiles.last_app_version / last_platform / last_device / last_seen_at: which app the
--    person last used (for the admin's Diagnostics page).
--  * impersonation_log: private list of admin "log in as user" sessions (admin-only).
--  * admin_user_diagnostics(uid): one call for the Diagnostics page.

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('crash', 'js', 'api', 'sync', 'ai', 'server', 'report')),
  screen text check (screen is null or length(screen) <= 200),
  message text not null check (length(message) <= 2000),
  details jsonb not null default '{}' check (length(details::text) <= 20000),
  app_version text check (app_version is null or length(app_version) <= 60),
  platform text check (platform is null or length(platform) <= 30),
  device text check (device is null or length(device) <= 300),
  screenshot_path text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon;
create index app_errors_created_idx on public.app_errors (created_at desc);
create index app_errors_user_idx on public.app_errors (user_id, created_at desc);

-- People write only their own rows, never mark them resolved; at most 50 a day each
-- (extra rows are dropped quietly so a crash loop can't fill the database).
create function public.limit_app_errors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new; -- server (service role)
  end if;
  new.resolved := false;
  new.resolved_at := null;
  if (select count(*) from public.app_errors
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 50 then
    return null;
  end if;
  return new;
end;
$$;

create trigger limit_app_errors
  before insert on public.app_errors
  for each row execute function public.limit_app_errors();

create policy "app_errors_insert_own" on public.app_errors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "app_errors_select_admin" on public.app_errors
  for select to authenticated
  using (public.is_admin());

revoke update on public.app_errors from authenticated;
grant update (resolved, resolved_at) on public.app_errors to authenticated;

create policy "app_errors_update_admin" on public.app_errors
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "app_errors_delete_admin" on public.app_errors
  for delete to authenticated
  using (public.is_admin());

-- Old automatic entries are removed daily (reports are kept until the admin deletes them).
select cron.schedule(
  'app-errors-cleanup',
  '20 0 * * *',
  $$delete from public.app_errors where kind <> 'report' and created_at < now() - interval '30 days'$$
);

-- ---------------------------------------------------------------------------
-- Screenshot for a report: private bucket, path {owner_id}/{uuid}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('problem-shots', 'problem-shots', false, 512000, array['image/jpeg']);

create policy "problem_shots_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'problem-shots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "problem_shots_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'problem-shots'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

create policy "problem_shots_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'problem-shots' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Which app each person last used
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column last_app_version text check (last_app_version is null or length(last_app_version) <= 60),
  add column last_platform text check (last_platform is null or length(last_platform) <= 30),
  add column last_device text check (last_device is null or length(last_device) <= 300),
  add column last_seen_at timestamptz;

create function public.touch_client_info(app_version text, platform text, device text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_app_version = left(app_version, 60),
      last_platform = left(platform, 30),
      last_device = left(device, 300),
      last_seen_at = now()
  where id = (select auth.uid());
$$;
revoke execute on function public.touch_client_info(text, text, text) from public, anon;
grant execute on function public.touch_client_info(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin "log in as user" – private list, written only by the admin-users function
-- ---------------------------------------------------------------------------
create table public.impersonation_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  user_id uuid references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.impersonation_log enable row level security;
revoke all on public.impersonation_log from anon;
revoke insert, update, delete on public.impersonation_log from authenticated;

create policy "impersonation_log_select_admin" on public.impersonation_log
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Diagnostics for one person (admin only)
-- ---------------------------------------------------------------------------
create function public.admin_user_diagnostics(uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  tz text;
  today date;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = uid;
  if not found then
    return null;
  end if;
  tz := coalesce(p.timezone, 'Asia/Kolkata');
  today := (now() at time zone tz)::date;
  return jsonb_build_object(
    'today', today,
    'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = uid),
    'last_seen_at', p.last_seen_at,
    'app_version', p.last_app_version,
    'platform', p.last_platform,
    'device', p.last_device,
    'timezone', tz,
    'onboarded', p.onboarded_at is not null,
    'push_devices', coalesce((
      select jsonb_agg(jsonb_build_object('platform', t.platform, 'last_seen_at', t.last_seen_at)
                       order by t.last_seen_at desc)
      from public.push_tokens t where t.user_id = uid), '[]'::jsonb),
    'iphone_code_set', p.health_sync_token_hash is not null,
    'last_sync', (
      select jsonb_build_object('source', a.source, 'at', a.updated_at, 'date', a.activity_date)
      from public.activity_daily a
      where a.client_id = uid and a.source in ('apple_shortcut', 'health_connect')
      order by a.updated_at desc limit 1),
    'synced_days_7', (
      select count(*) from public.activity_daily a
      where a.client_id = uid and a.source in ('apple_shortcut', 'health_connect')
        and a.activity_date > today - 7),
    'watch_days_7', (
      select count(*) from public.activity_daily a
      where a.client_id = uid and a.activity_date > today - 7
        and coalesce(array_length(a.worn_hours, 1), 0) > 0),
    'meals_today', (select count(*) from public.meal_logs m where m.client_id = uid and m.eaten_on = today),
    'last_meal_on', (select max(m.eaten_on) from public.meal_logs m where m.client_id = uid),
    'last_workout_on', (select max(w.performed_on) from public.workout_logs w where w.client_id = uid),
    'ai_today', coalesce((
      select jsonb_object_agg(u.feature, u.count) from public.ai_usage u
      where u.user_id = uid and u.used_on = today), '{}'::jsonb),
    'errors_7d', (
      select count(*) from public.app_errors e
      where e.user_id = uid and e.created_at > now() - interval '7 days' and e.kind <> 'report'),
    'admin_logins', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.started_at, 'admin', ap.full_name)
                       order by l.started_at desc)
      from (select * from public.impersonation_log where user_id = uid
            order by started_at desc limit 10) l
      left join public.profiles ap on ap.id = l.admin_id), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_user_diagnostics(uuid) from public, anon;
grant execute on function public.admin_user_diagnostics(uuid) to authenticated;
