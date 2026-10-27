-- AI coach (owner, 27 Oct 2026): an AI trainer account that clients can be mapped to like a
-- human trainer. A Claude "head coach" reviews each person's day every morning through the
-- coach function (checks meal calories, picks today's workout, writes a note and keeps a
-- playbook); a fast AI "day coach" answers questions in the app and writes short notes.
-- Writes happen only through the coach / coach-ai functions (service role), which check the
-- safety rules. Every change is recorded in coach_actions so the admin can undo it.

-- ---------------------------------------------------------------------------
-- profiles: AI coach flag, health conditions, coach consent
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column is_ai_coach boolean not null default false,
  add column health_conditions text[] not null default '{}'
    check (health_conditions <@ array['knee', 'back', 'bp', 'diabetes', 'heart', 'thyroid',
      'pregnancy', 'other']::text[]),
  add column conditions_note text check (conditions_note is null or length(conditions_note) <= 300),
  add column doctor_ok boolean,
  add column coach_consent_at timestamptz;

-- Only admins (or the service role) may change id, email, role, active status or the AI
-- coach flag. (Same as before, plus is_ai_coach.)
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_admin()) then
    if new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.is_ai_coach is distinct from old.is_ai_coach
    then
      raise exception 'Only an admin can change id, email, role or active status'
        using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role and exists (
    select 1 from public.trainer_clients tc
    where tc.client_id = old.id or tc.trainer_id = old.id
  ) then
    raise exception 'Reassign or remove this user''s trainer–client links before changing their role'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- The AI coach account (at most one).
create unique index profiles_one_ai_coach on public.profiles (is_ai_coach) where is_ai_coach;

-- ---------------------------------------------------------------------------
-- exercises: safety tags the AI coach must respect
-- ---------------------------------------------------------------------------
alter table public.exercises
  add column safety_tags text[] not null default '{}'
    check (safety_tags <@ array['senior_safe', 'knee_friendly', 'back_friendly',
      'low_impact']::text[]);

-- Gentle exercises for older adults (shared library).
insert into public.exercises (name, muscle_group, equipment, log_type, cues) values
  ('Sit-to-stand (chair squat)', 'Legs', 'Chair', 'bodyweight', 'Sit on the front of a sturdy chair, feet flat. Lean forward slightly and stand up without using your hands if you can, then sit down slowly. Use your hands on your thighs if needed.'),
  ('Wall push-up', 'Chest', 'Wall', 'bodyweight', 'Hands on the wall at shoulder height, a step away from it. Bend your elbows to bring your chest towards the wall, then push back. Keep your body straight.'),
  ('Seated knee extension', 'Quads', 'Chair', 'bodyweight', 'Sit tall on a chair. Slowly straighten one knee until the leg is level, hold for 2 seconds, lower slowly. Stop if the knee hurts.'),
  ('Heel raises (holding a chair)', 'Calves', 'Chair', 'bodyweight', 'Stand behind a chair holding its back. Rise slowly onto your toes, hold for a second, lower slowly.'),
  ('Standing march (holding a chair)', 'Full body', 'Chair', 'timed', 'Hold the back of a chair and march on the spot, lifting your knees gently. Breathe normally.'),
  ('Seated arm raises', 'Shoulders', 'Chair', 'bodyweight', 'Sit tall. Raise both arms slowly in front of you to shoulder height (or overhead if comfortable), then lower slowly.');

update public.exercises set safety_tags = array['senior_safe', 'knee_friendly', 'back_friendly', 'low_impact']
where trainer_id is null and name in (
  'Brisk walk / treadmill', 'Stationary bike', 'Wall push-up', 'Seated knee extension',
  'Heel raises (holding a chair)', 'Standing march (holding a chair)', 'Seated arm raises',
  'Tadasana (Mountain pose)', 'Marjariasana–Bitilasana (Cat–cow)', 'Baddha Konasana (Butterfly pose)',
  'Anulom Vilom (Alternate nostril breathing)', 'Shavasana (Relaxation)', 'Glute bridge',
  'Setu Bandhasana (Bridge pose)', 'Lat pulldown', 'Seated cable row', 'Face pull',
  'Rear delt fly', 'Lateral raise', 'Dumbbell biceps curl', 'Hammer curl', 'Triceps pushdown');

update public.exercises set safety_tags = array['senior_safe', 'back_friendly', 'low_impact']
where trainer_id is null and name in ('Sit-to-stand (chair squat)', 'Bhujangasana (Cobra pose)',
  'Vrikshasana (Tree pose)', 'Knee push-up');

update public.exercises set safety_tags = array['senior_safe', 'knee_friendly', 'low_impact']
where trainer_id is null and name in ('Trikonasana (Triangle pose)', 'Seated dumbbell shoulder press',
  'Incline dumbbell press', 'Dumbbell chest fly');

update public.exercises set safety_tags = array['knee_friendly', 'back_friendly', 'low_impact']
where trainer_id is null and name in ('Plank', 'Side plank', 'Push-up', 'Inverted row',
  'Surya Namaskar (Sun Salutation)', 'Lying leg curl', 'One-arm dumbbell row');

update public.exercises set safety_tags = array['low_impact']
where trainer_id is null and safety_tags = '{}' and name not in (
  'Burpee', 'Skipping', 'Mountain climbers', 'Kettlebell swing');

-- ---------------------------------------------------------------------------
-- Coach tables
-- ---------------------------------------------------------------------------

-- Playbook: what the day coach follows. client_id null = shared rules, else one page per person.
create table public.coach_playbook (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 20000),
  updated_by text not null default 'admin' check (updated_by in ('claude', 'admin')),
  updated_at timestamptz not null default now()
);
create unique index coach_playbook_scope on public.coach_playbook (client_id) nulls not distinct;

-- Today's plan from the coach (overrides the normal plan rotation for that day).
create table public.coach_day_plans (
  client_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  kind text not null check (kind in ('workout', 'light', 'rest')),
  plan_day_id uuid references public.plan_days (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  kcal_adjust int not null default 0 check (kcal_adjust between -200 and 200),
  status text not null default 'active' check (status in ('proposed', 'active', 'undone')),
  created_at timestamptz not null default now(),
  primary key (client_id, plan_date)
);

-- Notes to the person: 'head' (head coach, morning), 'morning' / 'evening' (day coach).
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  note_date date not null,
  kind text not null check (kind in ('head', 'morning', 'evening')),
  body text not null check (length(body) between 1 and 1500),
  source text not null check (source in ('claude', 'ai', 'admin')),
  status text not null default 'shared' check (status in ('proposed', 'shared', 'undone')),
  created_at timestamptz not null default now(),
  unique (client_id, note_date, kind)
);

-- "Ask the coach": questions and answers.
create table public.coach_queries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (length(question) between 1 and 1000),
  answer text check (answer is null or length(answer) <= 2000),
  model text,
  red_flag boolean not null default false,
  status text not null default 'answered' check (status in ('answered', 'escalated', 'resolved')),
  escalate_reason text check (escalate_reason is null or length(escalate_reason) <= 300),
  follow_up text check (follow_up is null or length(follow_up) <= 2000),
  follow_up_by text check (follow_up_by is null or follow_up_by in ('claude', 'admin')),
  followed_up_at timestamptz,
  created_at timestamptz not null default now()
);

-- Head coach runs (one per morning) and every change it made or proposed.
create table public.coach_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('dry_run', 'live')),
  source text not null default 'claude' check (source in ('claude', 'claude_api', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  people int not null default 0,
  photos int not null default 0,
  actions int not null default 0,
  report text check (report is null or length(report) <= 20000),
  error text check (error is null or length(error) <= 2000)
);

create table public.coach_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.coach_runs (id) on delete set null,
  client_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('check_meal', 'correct_meal', 'suggest_meal', 'day_plan',
    'note', 'answer', 'playbook', 'target', 'assign_plan', 'flag')),
  target_id text,
  before jsonb,
  after jsonb,
  reason text check (reason is null or length(reason) <= 1000),
  status text not null check (status in ('applied', 'proposed', 'undone', 'rejected', 'refused')),
  refused_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.coach_playbook enable row level security;
alter table public.coach_day_plans enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_queries enable row level security;
alter table public.coach_runs enable row level security;
alter table public.coach_actions enable row level security;
revoke all on public.coach_playbook, public.coach_day_plans, public.coach_notes,
  public.coach_queries, public.coach_runs, public.coach_actions from anon;

create index coach_notes_client_date_idx on public.coach_notes (client_id, note_date desc);
create index coach_queries_client_idx on public.coach_queries (client_id, created_at desc);
create index coach_queries_status_idx on public.coach_queries (status) where status = 'escalated';
create index coach_actions_run_idx on public.coach_actions (run_id);
create index coach_actions_status_idx on public.coach_actions (status, created_at desc);
create index coach_actions_client_idx on public.coach_actions (client_id, created_at desc);

-- Admins read everything; changes go through the coach functions (service role).
create policy "coach_playbook_admin" on public.coach_playbook
  for select to authenticated using (public.is_admin());
create policy "coach_runs_admin" on public.coach_runs
  for select to authenticated using (public.is_admin());
create policy "coach_actions_admin" on public.coach_actions
  for select to authenticated using (public.is_admin());

-- The person sees their own active plan, shared notes and their questions.
create policy "coach_day_plans_select" on public.coach_day_plans
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and status = 'active')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
create policy "coach_notes_select" on public.coach_notes
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and status = 'shared')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
create policy "coach_queries_select" on public.coach_queries
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- meal_logs: coach checks and corrections
-- ---------------------------------------------------------------------------
alter table public.meal_logs
  add column coach_checked_at timestamptz,
  add column coach_original jsonb,
  add column coach_suggestion jsonb,
  add column coach_reason text check (coach_reason is null or length(coach_reason) <= 300);

-- ---------------------------------------------------------------------------
-- Settings: off | dry_run (proposes only) | live
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values ('coach_mode', '"dry_run"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Starter plans for the AI coach account (called once by the coach function at setup).
-- ---------------------------------------------------------------------------
create function public.seed_coach_plans(coach uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  plans jsonb := $j$[
    {"name": "Gentle start (55+)", "description": "Walking, chair exercises and gentle yoga. Safe for older adults and sore knees.",
     "days": [
       {"title": "Walk + chair strength", "ex": [["Brisk walk / treadmill", 1, "20 min"], ["Sit-to-stand (chair squat)", 2, "8"], ["Wall push-up", 2, "8"], ["Seated knee extension", 2, "10"], ["Anulom Vilom (Alternate nostril breathing)", 1, "5 min"]]},
       {"title": "Gentle yoga", "ex": [["Tadasana (Mountain pose)", 1, "1 min"], ["Marjariasana–Bitilasana (Cat–cow)", 2, "8"], ["Setu Bandhasana (Bridge pose)", 2, "5"], ["Baddha Konasana (Butterfly pose)", 1, "1 min"], ["Shavasana (Relaxation)", 1, "5 min"]]},
       {"title": "Walk + balance", "ex": [["Brisk walk / treadmill", 1, "25 min"], ["Heel raises (holding a chair)", 2, "10"], ["Standing march (holding a chair)", 2, "1 min"], ["Glute bridge", 2, "8"], ["Seated arm raises", 2, "10"]]}
     ]},
    {"name": "Knee-friendly", "description": "No deep knee bends or jumping.",
     "days": [
       {"title": "Bike + upper body", "ex": [["Stationary bike", 1, "15 min"], ["Wall push-up", 3, "10"], ["Seated cable row", 3, "10"], ["Glute bridge", 3, "10"], ["Plank", 2, "20 s"]]},
       {"title": "Walk + yoga", "ex": [["Brisk walk / treadmill", 1, "20 min"], ["Setu Bandhasana (Bridge pose)", 2, "5"], ["Marjariasana–Bitilasana (Cat–cow)", 2, "8"], ["Shavasana (Relaxation)", 1, "5 min"]]},
       {"title": "Bike + core", "ex": [["Stationary bike", 1, "20 min"], ["Lat pulldown", 3, "10"], ["Side plank", 2, "15 s"], ["Seated knee extension", 2, "10"]]}
     ]},
    {"name": "Home fitness", "description": "Bodyweight strength, walking and yoga at home.",
     "days": [
       {"title": "Full body", "ex": [["Bodyweight squat", 3, "12"], ["Knee push-up", 3, "10"], ["Glute bridge", 3, "12"], ["Plank", 3, "30 s"], ["Brisk walk / treadmill", 1, "20 min"]]},
       {"title": "Yoga flow", "ex": [["Surya Namaskar (Sun Salutation)", 3, "5 rounds"], ["Trikonasana (Triangle pose)", 2, "30 s"], ["Bhujangasana (Cobra pose)", 2, "5"], ["Shavasana (Relaxation)", 1, "5 min"]]},
       {"title": "Legs + core", "ex": [["Reverse lunge", 3, "10"], ["Step-up", 3, "10"], ["Inverted row", 3, "8"], ["Side plank", 2, "20 s"], ["Brisk walk / treadmill", 1, "20 min"]]}
     ]},
    {"name": "Gym strength (3 days)", "description": "Upper, lower and full body in the gym.",
     "days": [
       {"title": "Upper body", "ex": [["Incline dumbbell press", 3, "8-10"], ["Lat pulldown", 3, "10"], ["Seated dumbbell shoulder press", 3, "10"], ["Seated cable row", 3, "10"], ["Triceps pushdown", 2, "12"], ["Dumbbell biceps curl", 2, "12"]]},
       {"title": "Lower body", "ex": [["Goblet squat", 3, "10"], ["Romanian deadlift", 3, "10"], ["Leg press", 3, "12"], ["Lying leg curl", 2, "12"], ["Plank", 3, "40 s"]]},
       {"title": "Full body + cardio", "ex": [["Push-up", 3, "10"], ["One-arm dumbbell row", 3, "10"], ["Walking lunge", 2, "10"], ["Glute bridge", 3, "12"], ["Stationary bike", 1, "15 min"]]}
     ]}
  ]$j$;
  p jsonb;
  d jsonb;
  e jsonb;
  plan_id uuid;
  day_id uuid;
  di int;
  ei int;
  n int := 0;
begin
  if exists (select 1 from public.workout_plans where trainer_id = coach) then
    return 0;
  end if;
  for p in select * from jsonb_array_elements(plans) loop
    insert into public.workout_plans (trainer_id, name, description)
    values (coach, p ->> 'name', p ->> 'description') returning id into plan_id;
    di := 0;
    for d in select * from jsonb_array_elements(p -> 'days') loop
      insert into public.plan_days (plan_id, day_index, title)
      values (plan_id, di, d ->> 'title') returning id into day_id;
      ei := 0;
      for e in select * from jsonb_array_elements(d -> 'ex') loop
        insert into public.plan_exercises (plan_day_id, exercise_id, sort_order, sets, reps, rest_seconds)
        select day_id, x.id, ei, (e ->> 1)::int, e ->> 2, 60
        from public.exercises x
        where x.trainer_id is null and x.name = e ->> 0
        limit 1;
        ei := ei + 1;
      end loop;
      di := di + 1;
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.seed_coach_plans(uuid) from public, anon, authenticated;
grant execute on function public.seed_coach_plans(uuid) to service_role;
