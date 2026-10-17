-- Milestone 2: exercise library, workout plans, assignments and workout logs.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- trainer_id null = shared library (edited by admins)
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  muscle_group text check (muscle_group is null or length(muscle_group) <= 40),
  equipment text check (equipment is null or length(equipment) <= 40),
  -- what the client logs: weights = kg x reps, bodyweight = reps, timed = minutes
  log_type text not null default 'weights' check (log_type in ('weights', 'bodyweight', 'timed')),
  demo_url text check (demo_url is null or demo_url ~ '^https://'),
  cues text check (cues is null or length(cues) <= 1000),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  description text check (description is null or length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_index int not null check (day_index >= 0),
  title text not null check (length(title) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sort_order int not null default 0,
  sets int not null default 3 check (sets between 1 and 20),
  reps text check (reps is null or length(reps) <= 20),
  rest_seconds int not null default 60 check (rest_seconds between 0 and 600),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);

create table public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null default current_date,
  is_active boolean not null default true,
  assigned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per logged set
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  performed_on date not null default current_date,
  plan_day_id uuid references public.plan_days (id) on delete set null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  set_number int not null check (set_number between 1 and 50),
  reps int check (reps is null or reps between 0 and 500),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),
  duration_min numeric(6, 2) check (duration_min is null or duration_min between 0 and 600),
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.plan_assignments enable row level security;
alter table public.workout_logs enable row level security;

revoke all on public.exercises, public.workout_plans, public.plan_days, public.plan_exercises,
  public.plan_assignments, public.workout_logs from anon;

create index exercises_trainer_idx on public.exercises (trainer_id);
create index workout_plans_trainer_idx on public.workout_plans (trainer_id);
create index plan_days_plan_idx on public.plan_days (plan_id, day_index);
create index plan_exercises_day_idx on public.plan_exercises (plan_day_id, sort_order);
create index plan_exercises_exercise_idx on public.plan_exercises (exercise_id);
create index plan_assignments_client_idx on public.plan_assignments (client_id, is_active);
create index plan_assignments_plan_idx on public.plan_assignments (plan_id);
create unique index plan_assignments_one_active on public.plan_assignments (client_id) where is_active;
create index workout_logs_client_date_idx on public.workout_logs (client_id, performed_on desc);
create index workout_logs_exercise_idx on public.workout_logs (client_id, exercise_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- The trainer who owns a plan.
create function public.plan_owner(plan uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select trainer_id from public.workout_plans where id = plan
$$;

-- Plan owner (trainer), admin, or a client the plan is (or was) assigned to.
create function public.can_read_plan(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or (public.app_role() = 'trainer' and public.plan_owner(plan) = (select auth.uid()))
    or (public.app_role() = 'client' and exists (
      select 1 from public.plan_assignments pa
      where pa.plan_id = plan and pa.client_id = (select auth.uid())
    ))
$$;

create function public.can_edit_plan(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or (public.app_role() = 'trainer' and public.plan_owner(plan) = (select auth.uid()))
$$;

create function public.plan_of_day(day uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select plan_id from public.plan_days where id = day
$$;

-- A client can see an exercise used in a plan assigned to them or in their own logs.
create function public.exercise_used_by_me(ex uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_role() = 'client' and (
    exists (
      select 1
      from public.plan_assignments pa
      join public.plan_days pd on pd.plan_id = pa.plan_id
      join public.plan_exercises pe on pe.plan_day_id = pd.id
      where pa.client_id = (select auth.uid()) and pe.exercise_id = ex
    )
    or exists (
      select 1 from public.workout_logs wl
      where wl.client_id = (select auth.uid()) and wl.exercise_id = ex
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A plan may only use shared exercises or exercises of the plan's own trainer.
create function public.check_plan_exercise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := public.plan_owner(public.plan_of_day(new.plan_day_id));
  ex_trainer uuid;
begin
  select trainer_id into ex_trainer from public.exercises where id = new.exercise_id;
  if ex_trainer is not null and ex_trainer <> owner then
    raise exception 'This exercise belongs to another trainer' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_plan_exercise
  before insert or update on public.plan_exercises
  for each row execute function public.check_plan_exercise();

-- Assigning a new active plan ends the client's previous one.
create function public.end_previous_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.plan_assignments
    set is_active = false
    where client_id = new.client_id and is_active and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger end_previous_assignments
  before insert or update of is_active on public.plan_assignments
  for each row execute function public.end_previous_assignments();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_workout_plans
  before update on public.workout_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- exercises
create policy "exercises_select" on public.exercises
  for select to authenticated
  using (
    (trainer_id is null and public.app_role() is not null)
    or (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or (trainer_id = public.my_trainer())
    or public.exercise_used_by_me(id)
    or public.is_admin()
  );

create policy "exercises_insert" on public.exercises
  for insert to authenticated
  with check (
    (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

create policy "exercises_update" on public.exercises
  for update to authenticated
  using ((trainer_id = (select auth.uid()) and public.app_role() = 'trainer') or public.is_admin())
  with check ((trainer_id = (select auth.uid()) and public.app_role() = 'trainer') or public.is_admin());

create policy "exercises_delete" on public.exercises
  for delete to authenticated
  using ((trainer_id = (select auth.uid()) and public.app_role() = 'trainer') or public.is_admin());

-- workout_plans
create policy "workout_plans_select" on public.workout_plans
  for select to authenticated
  using (public.can_read_plan(id));

create policy "workout_plans_insert" on public.workout_plans
  for insert to authenticated
  with check (
    (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

create policy "workout_plans_update" on public.workout_plans
  for update to authenticated
  using (public.can_edit_plan(id))
  with check (
    (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

create policy "workout_plans_delete" on public.workout_plans
  for delete to authenticated
  using (public.can_edit_plan(id));

-- plan_days
create policy "plan_days_select" on public.plan_days
  for select to authenticated
  using (public.can_read_plan(plan_id));

create policy "plan_days_write" on public.plan_days
  for all to authenticated
  using (public.can_edit_plan(plan_id))
  with check (public.can_edit_plan(plan_id));

-- plan_exercises
create policy "plan_exercises_select" on public.plan_exercises
  for select to authenticated
  using (public.can_read_plan(public.plan_of_day(plan_day_id)));

create policy "plan_exercises_write" on public.plan_exercises
  for all to authenticated
  using (public.can_edit_plan(public.plan_of_day(plan_day_id)))
  with check (public.can_edit_plan(public.plan_of_day(plan_day_id)));

-- plan_assignments
create policy "plan_assignments_select" on public.plan_assignments
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.can_edit_plan(plan_id)
    or public.is_admin()
  );

create policy "plan_assignments_insert" on public.plan_assignments
  for insert to authenticated
  with check (
    (public.can_edit_plan(plan_id) and public.is_trainer_of(client_id))
    or public.is_admin()
  );

create policy "plan_assignments_update" on public.plan_assignments
  for update to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin())
  with check (public.is_trainer_of(client_id) or public.is_admin());

create policy "plan_assignments_delete" on public.plan_assignments
  for delete to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin());

-- workout_logs: client full CRUD on own; trainer reads mapped clients; admin all
create policy "workout_logs_select" on public.workout_logs
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "workout_logs_insert" on public.workout_logs
  for insert to authenticated
  with check (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_admin()
  );

create policy "workout_logs_update" on public.workout_logs
  for update to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin())
  with check ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

create policy "workout_logs_delete" on public.workout_logs
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

-- ---------------------------------------------------------------------------
-- Users with workout data can only be deactivated, not deleted.
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
$$;

-- ---------------------------------------------------------------------------
-- Shared starter library (demo links are left for trainers to add)
-- ---------------------------------------------------------------------------
insert into public.exercises (name, muscle_group, equipment, log_type, cues) values
  -- legs and glutes
  ('Barbell back squat', 'Legs', 'Barbell', 'weights', 'Feet shoulder-width, chest up. Sit back and down until thighs are at least parallel, knees tracking over toes. Drive up through the whole foot.'),
  ('Goblet squat', 'Legs', 'Dumbbell', 'weights', 'Hold the dumbbell at your chest, elbows down. Squat between your knees with a tall back, then stand up tall.'),
  ('Leg press', 'Legs', 'Machine', 'weights', 'Feet hip-width in the middle of the platform. Lower until knees reach about 90 degrees without the lower back lifting. Do not lock the knees at the top.'),
  ('Walking lunge', 'Legs', 'Dumbbells', 'weights', 'Long step forward, lower the back knee towards the floor, front knee over the ankle. Push through the front heel into the next step.'),
  ('Bulgarian split squat', 'Legs', 'Dumbbells', 'weights', 'Back foot on a bench, front foot well forward. Lower straight down, keep the torso upright, push through the front heel.'),
  ('Romanian deadlift', 'Hamstrings', 'Barbell', 'weights', 'Soft knees, push the hips back and slide the bar down the thighs with a flat back. Stop when you feel a hamstring stretch, then squeeze the glutes to stand.'),
  ('Deadlift', 'Back and legs', 'Barbell', 'weights', 'Bar over mid-foot, grip just outside the legs. Brace, flat back, push the floor away and stand tall. Lower with control, bar close to the body.'),
  ('Lying leg curl', 'Hamstrings', 'Machine', 'weights', 'Pad just above the heels. Curl the heels towards the glutes without lifting the hips, lower slowly.'),
  ('Leg extension', 'Quads', 'Machine', 'weights', 'Knees in line with the machine pivot. Straighten the legs, pause briefly at the top, lower slowly.'),
  ('Standing calf raise', 'Calves', 'Machine', 'weights', 'Balls of the feet on the edge. Rise as high as you can, pause, then lower the heels below the step for a full stretch.'),
  ('Barbell hip thrust', 'Glutes', 'Barbell', 'weights', 'Upper back on a bench, bar over the hips with a pad. Drive the hips up until the body is straight from shoulders to knees, chin tucked, squeeze the glutes.'),
  ('Kettlebell swing', 'Glutes', 'Kettlebell', 'weights', 'Hinge at the hips, hike the bell back between the legs, then snap the hips forward to float it to chest height. Arms stay relaxed.'),
  -- chest, shoulders, arms
  ('Barbell bench press', 'Chest', 'Barbell', 'weights', 'Eyes under the bar, shoulder blades squeezed together, feet planted. Lower to mid-chest with elbows at about 45 degrees, press back up.'),
  ('Incline dumbbell press', 'Chest', 'Dumbbells', 'weights', 'Bench at 30 to 45 degrees. Lower the dumbbells to the sides of the upper chest, press up and slightly together.'),
  ('Dumbbell chest fly', 'Chest', 'Dumbbells', 'weights', 'Slight bend in the elbows. Open the arms wide until you feel a chest stretch, then bring the dumbbells back together over the chest.'),
  ('Overhead press', 'Shoulders', 'Barbell', 'weights', 'Bar on the front of the shoulders, glutes and core tight. Press straight up, moving the head back slightly, then through to lock out overhead.'),
  ('Seated dumbbell shoulder press', 'Shoulders', 'Dumbbells', 'weights', 'Back against the bench, dumbbells at shoulder height. Press up without arching the lower back, lower with control.'),
  ('Lateral raise', 'Shoulders', 'Dumbbells', 'weights', 'Slight bend in the elbows. Raise the arms out to the sides to shoulder height, lead with the elbows, lower slowly. Use a light weight.'),
  ('Rear delt fly', 'Shoulders', 'Dumbbells', 'weights', 'Hinge forward with a flat back. Raise the dumbbells out to the sides, squeezing the back of the shoulders, lower slowly.'),
  ('Dumbbell biceps curl', 'Arms', 'Dumbbells', 'weights', 'Elbows fixed by your sides. Curl up while turning the palms up, squeeze, lower all the way down without swinging.'),
  ('Hammer curl', 'Arms', 'Dumbbells', 'weights', 'Palms facing each other, elbows by your sides. Curl up, lower slowly.'),
  ('Triceps pushdown', 'Arms', 'Cable', 'weights', 'Elbows pinned to your sides. Push the bar or rope down until the arms are straight, control it back up to about 90 degrees.'),
  ('Overhead triceps extension', 'Arms', 'Dumbbell', 'weights', 'Hold one dumbbell overhead with both hands. Lower it behind the head keeping elbows pointing up, then straighten the arms.'),
  -- back
  ('Lat pulldown', 'Back', 'Cable', 'weights', 'Grip a little wider than shoulders, chest up. Pull the bar to the upper chest by driving the elbows down, control it back up.'),
  ('Seated cable row', 'Back', 'Cable', 'weights', 'Sit tall, slight knee bend. Pull the handle to your stomach, squeeze the shoulder blades together, return slowly without rounding.'),
  ('One-arm dumbbell row', 'Back', 'Dumbbell', 'weights', 'One hand and knee on a bench, flat back. Pull the dumbbell to the hip, keep the elbow close, lower fully.'),
  ('Barbell row', 'Back', 'Barbell', 'weights', 'Hinge forward to about 45 degrees with a flat back. Pull the bar to the lower ribs, squeeze, lower with control.'),
  ('Face pull', 'Shoulders', 'Cable', 'weights', 'Rope at face height. Pull towards the eyes, elbows high, and finish with hands beside the ears.'),
  -- bodyweight
  ('Push-up', 'Chest', 'Bodyweight', 'bodyweight', 'Hands under the shoulders, body in a straight line. Lower the chest to just above the floor, elbows at about 45 degrees, push back up.'),
  ('Knee push-up', 'Chest', 'Bodyweight', 'bodyweight', 'Like a push-up but from the knees. Keep a straight line from knees to head.'),
  ('Pull-up', 'Back', 'Bar', 'bodyweight', 'Hang with straight arms, grip just wider than shoulders. Pull until the chin clears the bar, lower all the way down.'),
  ('Inverted row', 'Back', 'Bar or table', 'bodyweight', 'Lie under a bar at waist height, body straight. Pull the chest to the bar, lower with control.'),
  ('Bodyweight squat', 'Legs', 'Bodyweight', 'bodyweight', 'Feet shoulder-width, arms forward for balance. Sit back and down, chest up, stand tall.'),
  ('Glute bridge', 'Glutes', 'Bodyweight', 'bodyweight', 'Lie on your back, knees bent, feet flat. Push through the heels and lift the hips until the body is straight from shoulders to knees, squeeze, lower.'),
  ('Reverse lunge', 'Legs', 'Bodyweight', 'bodyweight', 'Step back, lower the back knee towards the floor, front knee over the ankle. Push through the front heel to return.'),
  ('Step-up', 'Legs', 'Bench or step', 'bodyweight', 'Whole foot on the step. Drive up through that heel without pushing off the back foot, step down with control.'),
  ('Bench dip', 'Arms', 'Bench', 'bodyweight', 'Hands on the bench edge behind you, legs out in front. Bend the elbows to about 90 degrees, keep the back close to the bench, press up.'),
  ('Crunch', 'Core', 'Bodyweight', 'bodyweight', 'Knees bent, hands lightly by the ears. Curl the shoulders off the floor using the abs, do not pull on the neck.'),
  ('Burpee', 'Full body', 'Bodyweight', 'bodyweight', 'Squat, hands down, jump the feet back to a plank, jump them back in, then stand and jump. Move at a pace you can keep with good form.'),
  -- timed and cardio
  ('Plank', 'Core', 'Bodyweight', 'timed', 'Forearms under the shoulders, body straight from head to heels. Squeeze glutes and abs, do not let the hips sag.'),
  ('Side plank', 'Core', 'Bodyweight', 'timed', 'Forearm under the shoulder, feet stacked, hips lifted in a straight line. Switch sides.'),
  ('Wall sit', 'Legs', 'Wall', 'timed', 'Back against the wall, slide down until knees are at about 90 degrees, hold.'),
  ('Mountain climbers', 'Core', 'Bodyweight', 'timed', 'Plank position, drive the knees towards the chest one after the other, hips level.'),
  ('Brisk walk / treadmill', 'Cardio', 'Treadmill', 'timed', 'Walk at a pace where you can talk but not sing.'),
  ('Stationary bike', 'Cardio', 'Bike', 'timed', 'Seat at hip height so the knee is almost straight at the bottom. Keep a steady, comfortable pace.'),
  ('Skipping', 'Cardio', 'Rope', 'timed', 'Small jumps on the balls of the feet, turn the rope with the wrists, elbows close to the body.');
