-- Self workouts: a client (or a trainer, for their own training) saves a few simple workouts
-- built from the exercise library and logs them. Their logs are tagged source = 'self' so
-- the trainer can tell them apart from plan workouts; they never move the plan forward.

-- Anyone who tracks their own fitness: clients, and trainers for themselves.
create function public.tracks_self()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('client', 'trainer'), false)
$$;

create table public.self_workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.self_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  self_workout_id uuid not null references public.self_workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sort_order int not null default 0,
  sets int not null default 3 check (sets between 1 and 20),
  reps text check (reps is null or length(reps) <= 20),
  rest_seconds int not null default 60 check (rest_seconds between 0 and 600),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);

alter table public.self_workouts enable row level security;
alter table public.self_workout_exercises enable row level security;
revoke all on public.self_workouts, public.self_workout_exercises from anon;

create index self_workouts_client_idx on public.self_workouts (client_id);
create index self_workout_exercises_workout_idx
  on public.self_workout_exercises (self_workout_id, sort_order);
create index self_workout_exercises_exercise_idx on public.self_workout_exercises (exercise_id);

alter table public.workout_logs
  add column source text not null default 'plan' check (source in ('plan', 'self')),
  add column self_workout_id uuid references public.self_workouts (id) on delete set null;

create index workout_logs_self_workout_idx on public.workout_logs (self_workout_id);

-- ---------------------------------------------------------------------------
-- Helpers and triggers
-- ---------------------------------------------------------------------------

create function public.self_workout_owner(w uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_id from public.self_workouts where id = w
$$;

-- At most 10 saved workouts per person.
create function public.check_self_workout_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.self_workouts where client_id = new.client_id) >= 10 then
    raise exception 'You can save up to 10 workouts. Delete one to add another.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_self_workout_limit
  before insert on public.self_workouts
  for each row execute function public.check_self_workout_limit();

create trigger touch_self_workouts
  before update on public.self_workouts
  for each row execute function public.touch_updated_at();

-- Only library exercises: shared ones, the owner's trainer's, or (for a trainer) their own.
create function public.check_self_workout_exercise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := public.self_workout_owner(new.self_workout_id);
  ex_trainer uuid;
begin
  select trainer_id into ex_trainer from public.exercises where id = new.exercise_id;
  if ex_trainer is not null and ex_trainer <> owner and not exists (
    select 1 from public.trainer_clients tc
    where tc.client_id = owner and tc.trainer_id = ex_trainer
  ) then
    raise exception 'This exercise is not in your library' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_self_workout_exercise
  before insert or update on public.self_workout_exercises
  for each row execute function public.check_self_workout_exercise();

-- A log's self workout must belong to the same person; self logs are always source 'self'.
create function public.check_workout_log_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.self_workout_id is not null then
    if public.self_workout_owner(new.self_workout_id) is distinct from new.client_id then
      raise exception 'This workout belongs to someone else' using errcode = '42501';
    end if;
    new.source := 'self';
  end if;
  if new.source = 'self' then
    new.plan_day_id := null;
  end if;
  return new;
end;
$$;

create trigger check_workout_log_source
  before insert or update on public.workout_logs
  for each row execute function public.check_workout_log_source();

-- ---------------------------------------------------------------------------
-- RLS: owner full CRUD; their trainer and admins read.
-- ---------------------------------------------------------------------------
create policy "self_workouts_select" on public.self_workouts
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "self_workouts_insert" on public.self_workouts
  for insert to authenticated
  with check (client_id = (select auth.uid()) and public.tracks_self());

create policy "self_workouts_update" on public.self_workouts
  for update to authenticated
  using (client_id = (select auth.uid()) and public.tracks_self())
  with check (client_id = (select auth.uid()) and public.tracks_self());

create policy "self_workouts_delete" on public.self_workouts
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

create policy "self_workout_exercises_select" on public.self_workout_exercises
  for select to authenticated
  using (
    (public.self_workout_owner(self_workout_id) = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(public.self_workout_owner(self_workout_id))
    or public.is_admin()
  );

create policy "self_workout_exercises_write" on public.self_workout_exercises
  for all to authenticated
  using (public.self_workout_owner(self_workout_id) = (select auth.uid()) and public.tracks_self())
  with check (
    public.self_workout_owner(self_workout_id) = (select auth.uid()) and public.tracks_self()
  );
