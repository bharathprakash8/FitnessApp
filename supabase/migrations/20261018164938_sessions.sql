-- Milestone 7: training sessions (in person / Google Meet), repeating series, attendance,
-- and each trainer's Google Calendar connection.
-- Sessions are created, changed and cancelled only by the calendar-session Edge Function
-- (it keeps Google Calendar in step); the app reads them and the trainer marks attendance.

create table public.session_series (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  type text not null check (type in ('in_person', 'online')),
  location text check (location is null or length(location) <= 200),
  notes text check (notes is null or length(notes) <= 1000),
  duration_min int not null check (duration_min between 5 and 480),
  time_zone text not null default 'Asia/Kolkata',
  start_date date not null,
  start_time time not null,
  repeat text not null check (repeat in ('daily', 'weekly')),
  -- ISO weekdays (1 = Monday) for weekly series
  weekdays smallint[] not null default '{}'
    check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  ends_after int check (ends_after is null or ends_after between 1 and 60),
  ends_on date,
  meet_url text check (meet_url is null or meet_url ~ '^https://'),
  calendar_event_id text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  series_id uuid references public.session_series (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 5 and 480),
  time_zone text not null default 'Asia/Kolkata',
  type text not null check (type in ('in_person', 'online')),
  location text check (location is null or length(location) <= 200),
  notes text check (notes is null or length(notes) <= 1000),
  meet_url text check (meet_url is null or meet_url ~ '^https://'),
  -- Google Calendar event (single session) – series sessions use the series' event
  calendar_event_id text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_attendees (
  session_id uuid not null references public.sessions (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'present', 'missed')),
  primary key (session_id, client_id)
);

-- Refresh tokens are encrypted (AES-GCM) by the Edge Function; nobody can read this table
-- through the API – service role only.
create table public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  refresh_token_encrypted text not null,
  google_email text,
  scope text,
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

alter table public.session_series enable row level security;
alter table public.sessions enable row level security;
alter table public.session_attendees enable row level security;
alter table public.integration_tokens enable row level security;
revoke all on public.session_series, public.sessions, public.session_attendees,
  public.integration_tokens from anon;
revoke all on public.integration_tokens from authenticated;

create index sessions_trainer_idx on public.sessions (trainer_id, starts_at);
create index sessions_series_idx on public.sessions (series_id);
create index sessions_starts_idx on public.sessions (starts_at) where status = 'scheduled';
create index session_attendees_client_idx on public.session_attendees (client_id);
create index session_series_trainer_idx on public.session_series (trainer_id);

create trigger touch_sessions
  before update on public.sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.session_owner(s uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select trainer_id from public.sessions where id = s
$$;

create function public.is_session_attendee(s uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_attendees
    where session_id = s and client_id = (select auth.uid())
  )
$$;

-- The signed-in trainer's connected Google account (email), or null.
create function public.my_google_connection()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select google_email from public.integration_tokens
  where owner_id = (select auth.uid()) and provider = 'google_calendar'
$$;

revoke execute on function public.my_google_connection() from public, anon;
grant execute on function public.my_google_connection() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS (writes go through the Edge Function, except attendance)
-- ---------------------------------------------------------------------------
create policy "session_series_select" on public.session_series
  for select to authenticated
  using ((trainer_id = (select auth.uid()) and public.app_role() = 'trainer') or public.is_admin());

create policy "sessions_select" on public.sessions
  for select to authenticated
  using (
    (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or (public.app_role() = 'client' and public.is_session_attendee(id))
    or public.is_admin()
  );

create policy "session_attendees_select" on public.session_attendees
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or (public.session_owner(session_id) = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

-- The trainer marks attendance (status only).
revoke update on public.session_attendees from authenticated;
grant update (status) on public.session_attendees to authenticated;

create policy "session_attendees_update" on public.session_attendees
  for update to authenticated
  using (
    (public.session_owner(session_id) = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  )
  with check (
    (public.session_owner(session_id) = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Users with sessions can only be deactivated, not deleted.
-- ---------------------------------------------------------------------------
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
    or exists (select 1 from public.sessions where trainer_id = uid)
    or exists (select 1 from public.session_attendees where client_id = uid)
$$;
