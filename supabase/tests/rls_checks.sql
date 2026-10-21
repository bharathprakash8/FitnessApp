-- RLS checks. Run with: npm run db:test
-- Creates test users inside a transaction, acts as each of them, and rolls everything back.
-- Any failed check stops the script with an error starting "FAIL:".

begin;

-- ---------------------------------------------------------------------------
-- Test data (as postgres)
--   A  admin
--   T1 trainer of C1 and C3      T2 trainer of C2
--   C3 is deactivated
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', 'rls-admin@test.local',   '{"role":"admin"}',   '{"full_name":"Test Admin"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000f1', 'authenticated', 'authenticated', 'rls-trainer1@test.local', '{"role":"trainer"}', '{"full_name":"Test Trainer 1"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000f2', 'authenticated', 'authenticated', 'rls-trainer2@test.local', '{"role":"trainer"}', '{"full_name":"Test Trainer 2"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000c1', 'authenticated', 'authenticated', 'rls-client1@test.local',  '{"role":"client"}',  '{"full_name":"Test Client 1"}',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000c2', 'authenticated', 'authenticated', 'rls-client2@test.local',  '{}',                 '{"full_name":"Test Client 2"}',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000c3', 'authenticated', 'authenticated', 'rls-client3@test.local',  '{"role":"client"}',  '{"full_name":"Test Client 3"}',  now(), now());

insert into public.trainer_clients (client_id, trainer_id) values
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-0000000000f1'),
  ('00000000-0000-4000-a000-0000000000c3', '00000000-0000-4000-a000-0000000000f1'),
  ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-0000000000f2');

update public.profiles set is_active = false where id = '00000000-0000-4000-a000-0000000000c3';

-- Milestone 1 data: one target and one weight for each of C1 and C2
insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g, set_by) values
  ('00000000-0000-4000-a000-0000000000c1', 2000, 120, 220, 60, '00000000-0000-4000-a000-0000000000f1'),
  ('00000000-0000-4000-a000-0000000000c2', 1800, 110, 200, 55, '00000000-0000-4000-a000-0000000000f2');
insert into public.measurements (client_id, weight_kg) values
  ('00000000-0000-4000-a000-0000000000c1', 72.5),
  ('00000000-0000-4000-a000-0000000000c2', 64.0);

-- Trigger checks (as postgres)
do $$
begin
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000f1') <> 'trainer' then
    raise exception 'FAIL: profile trigger did not take role from app_metadata';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000c2') <> 'client' then
    raise exception 'FAIL: profile trigger did not default role to client';
  end if;
  begin
    insert into public.trainer_clients (client_id, trainer_id)
    values ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000f2');
  exception when others then
    return;
  end;
  raise exception 'FAIL: a trainer was mapped as a client';
end $$;

-- ---------------------------------------------------------------------------
-- Client C1
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);

do $$
declare n int;
begin
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000c1') <> 1 then
    raise exception 'FAIL: client cannot read own profile';
  end if;
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: client A can read client B profile';
  end if;
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000f1') <> 1 then
    raise exception 'FAIL: client cannot read own trainer profile';
  end if;
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000f2') <> 0 then
    raise exception 'FAIL: client can read another trainer profile';
  end if;
  if (select count(*) from public.trainer_clients) <> 1 then
    raise exception 'FAIL: client sees trainer_clients rows other than own';
  end if;

  update public.profiles set full_name = 'Renamed' where id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: client cannot update own name'; end if;

  update public.profiles set full_name = 'Hacked' where id = '00000000-0000-4000-a000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client updated another client profile'; end if;
end $$;

do $$
begin
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000000000c1';
  exception when others then
    return;
  end;
  raise exception 'FAIL: client changed own role';
end $$;

do $$
begin
  begin
    update public.profiles set is_active = false where id = '00000000-0000-4000-a000-0000000000c1';
  exception when others then
    return;
  end;
  raise exception 'FAIL: client changed own active status';
end $$;

do $$
begin
  begin
    insert into public.trainer_clients (client_id, trainer_id)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-0000000000f2');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client inserted a trainer mapping';
end $$;

-- ---------------------------------------------------------------------------
-- Trainer T1
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);

do $$
declare n int;
begin
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000c1') <> 1 then
    raise exception 'FAIL: trainer cannot read mapped client';
  end if;
  if (select count(*) from public.profiles where id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: trainer X can read client of trainer Y';
  end if;
  if (select count(*) from public.trainer_clients where trainer_id <> '00000000-0000-4000-a000-0000000000f1') <> 0 then
    raise exception 'FAIL: trainer sees mappings of another trainer';
  end if;
  if (select count(*) from public.trainer_clients) <> 2 then
    raise exception 'FAIL: trainer does not see exactly own 2 mappings';
  end if;

  update public.profiles set full_name = 'Changed by trainer' where id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: trainer updated a client profile'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Deactivated client C3
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c3","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FAIL: deactivated user can read profiles';
  end if;
  if (select count(*) from public.trainer_clients) <> 0 then
    raise exception 'FAIL: deactivated user can read trainer_clients';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 1: targets and measurements
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.targets) <> 1 then
    raise exception 'FAIL: client does not see exactly own targets';
  end if;
  if (select count(*) from public.measurements) <> 1 then
    raise exception 'FAIL: client does not see exactly own measurements';
  end if;
  insert into public.measurements (client_id, weight_kg) values ('00000000-0000-4000-a000-0000000000c1', 72.0);
  begin
    insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g)
    values ('00000000-0000-4000-a000-0000000000c1', 3000, 200, 300, 100);
  exception when others then
    return;
  end;
  raise exception 'FAIL: client set their own targets';
end $$;

do $$
begin
  begin
    insert into public.measurements (client_id, weight_kg) values ('00000000-0000-4000-a000-0000000000c2', 50);
  exception when others then
    return;
  end;
  raise exception 'FAIL: client added a measurement for another client';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.targets where client_id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: trainer sees targets of another trainer''s client';
  end if;
  if (select count(*) from public.measurements where client_id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: trainer sees measurements of another trainer''s client';
  end if;
  if (select count(*) from public.measurements where client_id = '00000000-0000-4000-a000-0000000000c1') <> 2 then
    raise exception 'FAIL: trainer cannot see own client measurements';
  end if;
  insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-4000-a000-0000000000c1', 2100, 130, 230, 62);
  if (select set_by from public.targets where calories = 2100) <> '00000000-0000-4000-a000-0000000000f1' then
    raise exception 'FAIL: set_by was not filled with the trainer';
  end if;
end $$;

do $$
begin
  begin
    insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g)
    values ('00000000-0000-4000-a000-0000000000c2', 2000, 100, 200, 60);
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer set targets for another trainer''s client';
end $$;

do $$
begin
  begin
    insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g, set_by)
    values ('00000000-0000-4000-a000-0000000000c1', 2000, 100, 200, 60, '00000000-0000-4000-a000-0000000000f2');
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer saved a target with someone else as set_by';
end $$;

do $$
begin
  begin
    insert into public.measurements (client_id, weight_kg) values ('00000000-0000-4000-a000-0000000000c1', 70);
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer added a measurement for a client';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c3","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.targets) + (select count(*) from public.measurements) <> 0 then
    raise exception 'FAIL: deactivated user can read targets or measurements';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 2: exercises, plans, assignments, workout logs
--   E1 = T1's own exercise, E2 = T2's own exercise, P1 = T1's plan (day D1) assigned to C1
-- ---------------------------------------------------------------------------
reset role;
insert into public.exercises (id, trainer_id, name, log_type) values
  ('00000000-0000-4000-b000-0000000000e1', '00000000-0000-4000-a000-0000000000f1', 'T1 special', 'weights'),
  ('00000000-0000-4000-b000-0000000000e2', '00000000-0000-4000-a000-0000000000f2', 'T2 special', 'weights');
insert into public.workout_plans (id, trainer_id, name) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000f1', 'T1 plan');
insert into public.plan_days (id, plan_id, day_index, title) values
  ('00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-b000-0000000000b1', 0, 'Day 1');
insert into public.plan_exercises (plan_day_id, exercise_id, sets, reps) values
  ('00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-b000-0000000000e1', 3, '8-10'),
  ('00000000-0000-4000-b000-0000000000d1', (select id from public.exercises where name = 'Push-up' and trainer_id is null), 3, '10');
insert into public.plan_assignments (plan_id, client_id) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000c1');
insert into public.workout_logs (client_id, plan_day_id, exercise_id, set_number, reps, weight_kg) values
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-b000-0000000000e1', 1, 8, 40),
  ('00000000-0000-4000-a000-0000000000c2', null, '00000000-0000-4000-b000-0000000000e2', 1, 10, 20);

set local role authenticated;

-- Client C1
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_plans) <> 1 then
    raise exception 'FAIL: client does not see exactly the assigned plan';
  end if;
  if (select count(*) from public.plan_exercises) <> 2 then
    raise exception 'FAIL: client cannot see the exercises of the assigned plan';
  end if;
  if (select count(*) from public.exercises where id = '00000000-0000-4000-b000-0000000000e1') <> 1 then
    raise exception 'FAIL: client cannot see own trainer''s exercise';
  end if;
  if (select count(*) from public.exercises where id = '00000000-0000-4000-b000-0000000000e2') <> 0 then
    raise exception 'FAIL: client can see another trainer''s exercise';
  end if;
  if (select count(*) from public.exercises where trainer_id is null) < 40 then
    raise exception 'FAIL: client cannot see the shared library';
  end if;
  if (select count(*) from public.workout_logs) <> 1 then
    raise exception 'FAIL: client does not see exactly own workout logs';
  end if;
  insert into public.workout_logs (client_id, exercise_id, set_number, reps, weight_kg)
  values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000e1', 2, 8, 42.5);
end $$;

do $$
begin
  begin
    insert into public.workout_logs (client_id, exercise_id, set_number, reps)
    values ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-b000-0000000000e2', 1, 5);
  exception when others then
    return;
  end;
  raise exception 'FAIL: client logged a workout for another client';
end $$;

do $$
begin
  begin
    insert into public.workout_plans (trainer_id, name) values ('00000000-0000-4000-a000-0000000000c1', 'Mine');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client created a workout plan';
end $$;

-- Client C2 (trainer T2)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_plans) + (select count(*) from public.plan_days) <> 0 then
    raise exception 'FAIL: client can see a plan not assigned to them';
  end if;
  if (select count(*) from public.exercises where id = '00000000-0000-4000-b000-0000000000e1') <> 0 then
    raise exception 'FAIL: client can see another trainer''s exercise';
  end if;
end $$;

-- Trainer T2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
declare new_plan uuid;
begin
  if (select count(*) from public.workout_plans where id = '00000000-0000-4000-b000-0000000000b1') <> 0 then
    raise exception 'FAIL: trainer can see another trainer''s plan';
  end if;
  if (select count(*) from public.workout_logs where client_id = '00000000-0000-4000-a000-0000000000c1') <> 0 then
    raise exception 'FAIL: trainer can see logs of another trainer''s client';
  end if;
  -- the app creates plans with INSERT ... RETURNING (checks the SELECT policy on the new row)
  insert into public.workout_plans (id, trainer_id, name)
  values ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-0000000000f2', 'T2 plan')
  returning id into new_plan;
  insert into public.plan_days (id, plan_id, day_index, title)
  values ('00000000-0000-4000-b000-0000000000d2', '00000000-0000-4000-b000-0000000000b2', 0, 'Day 1');
  begin
    insert into public.plan_exercises (plan_day_id, exercise_id)
    values ('00000000-0000-4000-b000-0000000000d2', '00000000-0000-4000-b000-0000000000e1');
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer used another trainer''s exercise in a plan';
end $$;

do $$
begin
  begin
    update public.exercises set cues = 'hacked' where trainer_id is null and name = 'Push-up';
    if found then raise exception 'FAIL: trainer edited a shared exercise'; end if;
  end;
end $$;

-- Trainer T1
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_logs where client_id = '00000000-0000-4000-a000-0000000000c1') <> 2 then
    raise exception 'FAIL: trainer cannot see own client''s workout logs';
  end if;
  -- a second plan for C1 ends the first assignment
  insert into public.workout_plans (id, trainer_id, name)
  values ('00000000-0000-4000-b000-0000000000b3', '00000000-0000-4000-a000-0000000000f1', 'T1 plan 2');
  insert into public.plan_assignments (plan_id, client_id)
  values ('00000000-0000-4000-b000-0000000000b3', '00000000-0000-4000-a000-0000000000c1');
  if (select count(*) from public.plan_assignments
      where client_id = '00000000-0000-4000-a000-0000000000c1' and is_active) <> 1 then
    raise exception 'FAIL: client has more than one active plan';
  end if;
  begin
    insert into public.plan_assignments (plan_id, client_id)
    values ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000c2');
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer assigned a plan to another trainer''s client';
end $$;

-- Trainers may log workouts for their own clients (21 Oct 2026); only theirs, and only
-- what they logged can they change. "Logged by" is stamped by the database.
do $$
declare
  t1 uuid := '00000000-0000-4000-a000-0000000000f1';
  c1 uuid := '00000000-0000-4000-a000-0000000000c1';
  logger uuid;
  n int;
begin
  insert into public.workout_logs (client_id, exercise_id, set_number, reps, source, logged_by)
  values (c1, '00000000-0000-4000-b000-0000000000e1', 9, 5, 'trainer', c1)
  returning logged_by into logger;
  if logger is distinct from t1 then
    raise exception 'FAIL: logged_by was not stamped as the trainer';
  end if;
  begin
    insert into public.workout_logs (client_id, exercise_id, set_number, reps, source)
    values ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-b000-0000000000e1', 9, 5, 'trainer');
    raise exception 'FAIL: trainer logged a workout for another trainer''s client';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.workout_logs (client_id, exercise_id, set_number, reps, source)
    values (c1, '00000000-0000-4000-b000-0000000000e1', 9, 5, 'self');
    raise exception 'FAIL: trainer logged a "self" workout for a client';
  exception when insufficient_privilege then null;
  end;
  -- the client's own sets are not the trainer's to change
  update public.workout_logs set reps = 99
  where client_id = c1 and logged_by is distinct from t1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: trainer changed sets the client logged'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.workout_logs
  where logged_by = '00000000-0000-4000-a000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client deleted a set their trainer logged'; end if;
  if (select count(*) from public.workout_logs where logged_by = '00000000-0000-4000-a000-0000000000f1') <> 1 then
    raise exception 'FAIL: client cannot see the set their trainer logged';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Milestone 3: meal logs, ai_usage, meal-photos storage
-- ---------------------------------------------------------------------------
reset role;
insert into public.meal_logs (client_id, meal_type, source, total_calories) values
  ('00000000-0000-4000-a000-0000000000c1', 'lunch', 'text', 600),
  ('00000000-0000-4000-a000-0000000000c2', 'lunch', 'text', 500);
insert into public.ai_usage (user_id, used_on, feature, count)
  values ('00000000-0000-4000-a000-0000000000c1', current_date, 'analyze-meal', 3);
insert into storage.objects (bucket_id, name, owner_id) values
  ('meal-photos', '00000000-0000-4000-a000-0000000000c1/2026-10-17/a.jpg', '00000000-0000-4000-a000-0000000000c1'),
  ('meal-photos', '00000000-0000-4000-a000-0000000000c2/2026-10-17/b.jpg', '00000000-0000-4000-a000-0000000000c2');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.meal_logs) <> 1 then
    raise exception 'FAIL: client does not see exactly own meal logs';
  end if;
  if (select count(*) from public.ai_usage) <> 0 then
    raise exception 'FAIL: client can read ai_usage';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'meal-photos') <> 1 then
    raise exception 'FAIL: client does not see exactly own meal photos';
  end if;
  insert into public.meal_logs (client_id, meal_type, source, total_calories)
  values ('00000000-0000-4000-a000-0000000000c1', 'snack', 'manual', 150);
end $$;

do $$
begin
  begin
    insert into public.meal_logs (client_id, meal_type, source)
    values ('00000000-0000-4000-a000-0000000000c2', 'snack', 'manual');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client logged a meal for another client';
end $$;

do $$
begin
  begin
    insert into public.ai_usage (user_id, used_on, feature, count)
    values ('00000000-0000-4000-a000-0000000000c1', current_date, 'analyze-meal', 0);
  exception when others then
    return;
  end;
  raise exception 'FAIL: client wrote to ai_usage';
end $$;

do $$
begin
  begin
    perform public.bump_ai_usage('00000000-0000-4000-a000-0000000000c1', current_date, 'analyze-meal');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client could call bump_ai_usage';
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('meal-photos', '00000000-0000-4000-a000-0000000000c2/2026-10-17/x.jpg', '00000000-0000-4000-a000-0000000000c1');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client uploaded into another client''s photo folder';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.meal_logs where client_id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: trainer sees meals of another trainer''s client';
  end if;
  if (select count(*) from public.meal_logs where client_id = '00000000-0000-4000-a000-0000000000c1') <> 2 then
    raise exception 'FAIL: trainer cannot see own client''s meals';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'meal-photos') <> 1 then
    raise exception 'FAIL: trainer does not see exactly own client''s meal photos';
  end if;
  update public.meal_logs set total_calories = 1 where client_id = '00000000-0000-4000-a000-0000000000c1';
  if found then raise exception 'FAIL: trainer edited a client''s meal'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 4: activity_daily
-- ---------------------------------------------------------------------------
reset role;
insert into public.activity_daily (client_id, activity_date, active_calories, source) values
  ('00000000-0000-4000-a000-0000000000c1', current_date, 400, 'health_connect'),
  ('00000000-0000-4000-a000-0000000000c2', current_date, 300, 'apple_shortcut');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.activity_daily) <> 1 then
    raise exception 'FAIL: client does not see exactly own activity';
  end if;
  insert into public.activity_daily (client_id, activity_date, active_calories, source)
  values ('00000000-0000-4000-a000-0000000000c1', current_date - 1, 250, 'manual');
end $$;

do $$
begin
  begin
    insert into public.activity_daily (client_id, activity_date, active_calories, source)
    values ('00000000-0000-4000-a000-0000000000c2', current_date - 1, 999, 'manual');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client wrote activity for another client';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.activity_daily where client_id = '00000000-0000-4000-a000-0000000000c2') <> 0 then
    raise exception 'FAIL: trainer sees activity of another trainer''s client';
  end if;
  if (select count(*) from public.activity_daily where client_id = '00000000-0000-4000-a000-0000000000c1') <> 2 then
    raise exception 'FAIL: trainer cannot see own client''s activity';
  end if;
  update public.activity_daily set active_calories = 1 where client_id = '00000000-0000-4000-a000-0000000000c1';
  if found then raise exception 'FAIL: trainer edited a client''s activity'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 5: reminder_settings, push_tokens, notification_log
-- ---------------------------------------------------------------------------
reset role;
insert into public.push_tokens (user_id, token, platform) values
  ('00000000-0000-4000-a000-0000000000c2', 'token-of-client-two-0000000000', 'web');
insert into public.notification_log (user_id, kind, ref_date)
  values ('00000000-0000-4000-a000-0000000000c1', 'meal_lunch', current_date);
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  insert into public.reminder_settings (client_id, lunch_time) values ('00000000-0000-4000-a000-0000000000c1', '13:00');
  if (select count(*) from public.push_tokens) <> 0 then
    raise exception 'FAIL: client can see another user''s push token';
  end if;
  if (select count(*) from public.notification_log) <> 0 then
    raise exception 'FAIL: client can read notification_log';
  end if;
  -- claiming a token moves it to the caller
  perform public.claim_push_token('token-of-client-one-1111111111', 'android');
  if (select count(*) from public.push_tokens) <> 1 then
    raise exception 'FAIL: client cannot see own push token after claiming';
  end if;
end $$;

do $$
begin
  begin
    insert into public.reminder_settings (client_id) values ('00000000-0000-4000-a000-0000000000c2');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client created reminder settings for another client';
end $$;

do $$
begin
  begin
    insert into public.push_tokens (user_id, token, platform)
    values ('00000000-0000-4000-a000-0000000000c2', 'forged-token-for-client-two-xx', 'web');
  exception when others then
    return;
  end;
  raise exception 'FAIL: client added a push token for another user';
end $$;

do $$
begin
  begin
    insert into public.notification_log (user_id, kind, ref_date)
    values ('00000000-0000-4000-a000-0000000000c1', 'x', current_date);
  exception when others then
    return;
  end;
  raise exception 'FAIL: client wrote to notification_log';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  -- Trainers see their own clients' reminder settings (to set them), never device tokens.
  if (select count(*) from public.push_tokens) <> 0 then
    raise exception 'FAIL: trainer can see client push tokens';
  end if;
  if (select count(*) from public.reminder_settings) <> 1 then
    raise exception 'FAIL: trainer does not see exactly their client''s reminder settings';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Self workouts (client's own saved workouts, logged as source 'self')
--   S2 = C2's saved workout
-- ---------------------------------------------------------------------------
reset role;
insert into public.self_workouts (id, client_id, name) values
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-0000000000c2', 'C2 home');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare w uuid;
declare src text;
declare pd uuid;
begin
  insert into public.self_workouts (name) values ('C1 legs') returning id into w;
  if (select client_id from public.self_workouts where id = w) <> '00000000-0000-4000-a000-0000000000c1' then
    raise exception 'FAIL: self workout not owned by its creator';
  end if;
  insert into public.self_workout_exercises (self_workout_id, exercise_id)
  values (w, (select id from public.exercises where name = 'Push-up' and trainer_id is null));
  insert into public.self_workout_exercises (self_workout_id, exercise_id)
  values (w, '00000000-0000-4000-b000-0000000000e1');
  if (select count(*) from public.self_workouts) <> 1 then
    raise exception 'FAIL: client sees self workouts of others';
  end if;
  begin
    insert into public.self_workout_exercises (self_workout_id, exercise_id)
    values (w, '00000000-0000-4000-b000-0000000000e2');
    raise exception 'FAIL: client used another trainer''s exercise in a self workout';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.self_workout_exercises (self_workout_id, exercise_id)
    values ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-b000-0000000000e1');
    raise exception 'FAIL: client added to another client''s self workout';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.self_workouts (client_id, name) values ('00000000-0000-4000-a000-0000000000c2', 'x');
    raise exception 'FAIL: client created a self workout for another client';
  exception when insufficient_privilege then null;
  end;
  -- A log against a self workout is always 'self' and never counts for the plan.
  insert into public.workout_logs (client_id, plan_day_id, self_workout_id, exercise_id, set_number, reps)
  values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000d1', w,
    '00000000-0000-4000-b000-0000000000e1', 1, 10)
  returning source, plan_day_id into src, pd;
  if src <> 'self' or pd is not null then
    raise exception 'FAIL: self workout log not tagged self';
  end if;
  begin
    insert into public.workout_logs (client_id, self_workout_id, exercise_id, set_number, reps)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000a2',
      '00000000-0000-4000-b000-0000000000e1', 1, 10);
    raise exception 'FAIL: client logged against another client''s self workout';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.self_workouts) <> 1
    or (select count(*) from public.self_workout_exercises) <> 2 then
    raise exception 'FAIL: trainer T1 does not see exactly C1''s self workouts';
  end if;
  update public.self_workouts set name = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: trainer renamed a client''s self workout'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.self_workouts where client_id = '00000000-0000-4000-a000-0000000000c1') <> 0 then
    raise exception 'FAIL: trainer T2 sees self workouts of T1''s client';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trainer-set reminders: reminder_settings lock and custom_reminders
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.reminder_settings set lunch_time = '13:15', meal_times_locked = true
  where client_id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: trainer cannot set a client''s reminder times'; end if;
  insert into public.custom_reminders (id, client_id, kind, title, remind_at, days, client_can_mute)
  values ('00000000-0000-4000-b000-0000000000c9', '00000000-0000-4000-a000-0000000000c1',
    'cardio', 'Cardio', '06:30', '{1,3,5}', false);
  if not public.has_push_device('00000000-0000-4000-a000-0000000000c1') then
    raise exception 'FAIL: trainer cannot see that their client has a device';
  end if;
  if public.has_push_device('00000000-0000-4000-a000-0000000000c2') then
    raise exception 'FAIL: trainer can probe devices of another trainer''s client';
  end if;
  begin
    insert into public.custom_reminders (client_id, title, remind_at)
    values ('00000000-0000-4000-a000-0000000000c2', 'x', '07:00');
    raise exception 'FAIL: trainer set a reminder for another trainer''s client';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.custom_reminders) <> 0 then
    raise exception 'FAIL: trainer T2 sees reminders of T1''s client';
  end if;
  update public.reminder_settings set lunch_time = '15:00';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: trainer T2 changed reminders of T1''s client'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  -- the client's own pause switch still works when times are locked
  update public.reminder_settings set enabled = false where client_id = '00000000-0000-4000-a000-0000000000c1';
  begin
    update public.reminder_settings set lunch_time = '14:00' where client_id = '00000000-0000-4000-a000-0000000000c1';
    raise exception 'FAIL: client changed reminder times locked by the trainer';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reminder_settings set meal_times_locked = false where client_id = '00000000-0000-4000-a000-0000000000c1';
    raise exception 'FAIL: client unlocked their reminder times';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.custom_reminders) <> 1 then
    raise exception 'FAIL: client cannot see their trainer''s reminder';
  end if;
  begin
    update public.custom_reminders set muted = true where id = '00000000-0000-4000-b000-0000000000c9';
    raise exception 'FAIL: client muted an always-on reminder';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.custom_reminders set title = 'nope' where id = '00000000-0000-4000-b000-0000000000c9';
    raise exception 'FAIL: client changed the trainer''s reminder';
  exception when insufficient_privilege then null;
  end;
  delete from public.custom_reminders;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client deleted the trainer''s reminder'; end if;
  begin
    insert into public.custom_reminders (client_id, title, remind_at)
    values ('00000000-0000-4000-a000-0000000000c1', 'x', '07:00');
    raise exception 'FAIL: client created a custom reminder';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
update public.custom_reminders set client_can_mute = true where id = '00000000-0000-4000-b000-0000000000c9';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.custom_reminders set muted = true where id = '00000000-0000-4000-b000-0000000000c9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: client cannot mute a mutable reminder'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
begin
  update public.custom_reminders set client_can_mute = false where id = '00000000-0000-4000-b000-0000000000c9';
  if (select muted from public.custom_reminders where id = '00000000-0000-4000-b000-0000000000c9') then
    raise exception 'FAIL: making a reminder always-on did not unmute it';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trainer "My fitness": a trainer tracks their own data; nobody but admins sees it
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare me uuid := '00000000-0000-4000-a000-0000000000f1';
begin
  insert into public.meal_logs (client_id, eaten_at, meal_type, source, total_calories)
  values (me, now(), 'lunch', 'manual', 600);
  insert into public.workout_logs (client_id, exercise_id, set_number, reps, weight_kg)
  values (me, '00000000-0000-4000-b000-0000000000e1', 1, 5, 100);
  insert into public.activity_daily (client_id, activity_date, active_calories, source)
  values (me, current_date, 450, 'manual');
  insert into public.measurements (client_id, weight_kg) values (me, 80);
  insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g, set_by)
  values (me, 2600, 150, 300, 80, me);
  insert into public.plan_assignments (plan_id, client_id)
  values ('00000000-0000-4000-b000-0000000000b1', me);
  insert into public.reminder_settings (client_id) values (me);
  if (select count(*) from public.meal_logs where client_id = me) <> 1
    or (select count(*) from public.targets where client_id = me) <> 1
    or (select count(*) from public.plan_assignments where client_id = me and is_active) <> 1 then
    raise exception 'FAIL: trainer cannot read back their own tracking data';
  end if;
  begin
    insert into public.targets (client_id, calories, protein_g, carbs_g, fat_g, set_by)
    values ('00000000-0000-4000-a000-0000000000f2', 2000, 100, 200, 60, me);
    raise exception 'FAIL: trainer set targets for another trainer';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.meal_logs (client_id, eaten_at, meal_type, source)
    values ('00000000-0000-4000-a000-0000000000c1', now(), 'lunch', 'manual');
    raise exception 'FAIL: trainer logged a meal for a client';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
declare t1 uuid := '00000000-0000-4000-a000-0000000000f1';
begin
  if (select count(*) from public.meal_logs where client_id = t1)
     + (select count(*) from public.workout_logs where client_id = t1)
     + (select count(*) from public.activity_daily where client_id = t1)
     + (select count(*) from public.measurements where client_id = t1)
     + (select count(*) from public.targets where client_id = t1)
     + (select count(*) from public.reminder_settings where client_id = t1) <> 0 then
    raise exception 'FAIL: trainer T2 sees trainer T1''s own data';
  end if;
  begin
    insert into public.plan_assignments (plan_id, client_id)
    values ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000f2');
    raise exception 'FAIL: trainer followed another trainer''s plan';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare t1 uuid := '00000000-0000-4000-a000-0000000000f1';
begin
  if (select count(*) from public.meal_logs where client_id = t1)
     + (select count(*) from public.workout_logs where client_id = t1)
     + (select count(*) from public.activity_daily where client_id = t1)
     + (select count(*) from public.measurements where client_id = t1)
     + (select count(*) from public.targets where client_id = t1) <> 0 then
    raise exception 'FAIL: a client sees their trainer''s own data';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 7: sessions, attendees, Google tokens
--   S1 = T1's session with C1
-- ---------------------------------------------------------------------------
reset role;
insert into public.sessions (id, trainer_id, title, starts_at, duration_min, type) values
  ('00000000-0000-4000-b000-0000000000f7', '00000000-0000-4000-a000-0000000000f1', 'T1 session', now() - interval '1 hour', 45, 'online');
insert into public.session_attendees (session_id, client_id) values
  ('00000000-0000-4000-b000-0000000000f7', '00000000-0000-4000-a000-0000000000c1');
insert into public.integration_tokens (owner_id, provider, refresh_token_encrypted, google_email) values
  ('00000000-0000-4000-a000-0000000000f1', 'google_calendar', 'v1.x.y', 't1@example.com');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.sessions) <> 1 or (select count(*) from public.session_attendees) <> 1 then
    raise exception 'FAIL: client cannot see their own session';
  end if;
  update public.session_attendees set status = 'present';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client marked their own attendance'; end if;
  begin
    insert into public.sessions (trainer_id, title, starts_at, duration_min, type)
    values ('00000000-0000-4000-a000-0000000000f1', 'x', now(), 30, 'online');
    raise exception 'FAIL: client created a session';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.integration_tokens;
    raise exception 'FAIL: client can query integration_tokens';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sessions) + (select count(*) from public.session_attendees) <> 0 then
    raise exception 'FAIL: another client sees the session';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sessions) <> 0 then
    raise exception 'FAIL: trainer T2 sees T1''s sessions';
  end if;
  if public.my_google_connection() is not null then
    raise exception 'FAIL: T2 sees a Google connection';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.session_attendees set status = 'present'
  where session_id = '00000000-0000-4000-b000-0000000000f7';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: trainer cannot mark attendance'; end if;
  begin
    update public.session_attendees set client_id = '00000000-0000-4000-a000-0000000000c2'
    where session_id = '00000000-0000-4000-b000-0000000000f7';
    raise exception 'FAIL: trainer changed who attended';
  exception when insufficient_privilege then null;
  end;
  if public.my_google_connection() is distinct from 't1@example.com' then
    raise exception 'FAIL: trainer cannot see their Google connection';
  end if;
  begin
    perform refresh_token_encrypted from public.integration_tokens;
    raise exception 'FAIL: trainer can read the stored Google token';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 9: weekly summaries and the trainer dashboard
-- ---------------------------------------------------------------------------
reset role;
insert into public.weekly_summaries (id, client_id, period_start, period_end, summary_text, status) values
  ('00000000-0000-4000-b000-0000000000d9', '00000000-0000-4000-a000-0000000000c1', '2026-01-05', '2026-01-11', 'draft text', 'draft'),
  ('00000000-0000-4000-b000-0000000000da', '00000000-0000-4000-a000-0000000000c1', '2026-01-12', '2026-01-18', 'shared text', 'shared');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.weekly_summaries) <> 1 then
    raise exception 'FAIL: client sees a draft summary (or not the shared one)';
  end if;
  update public.weekly_summaries set summary_text = 'mine';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: client edited a summary'; end if;
  if (select count(*) from public.trainer_dashboard()) <> 0 then
    raise exception 'FAIL: client can read the trainer dashboard';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.weekly_summaries) <> 0 then
    raise exception 'FAIL: trainer T2 sees summaries of T1''s client';
  end if;
  if exists (select 1 from public.trainer_dashboard() where client_id = '00000000-0000-4000-a000-0000000000c1') then
    raise exception 'FAIL: T2 dashboard shows T1''s client';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.weekly_summaries) <> 2 then
    raise exception 'FAIL: trainer does not see their client''s summaries';
  end if;
  update public.weekly_summaries set summary_text = 'edited by trainer'
  where id = '00000000-0000-4000-b000-0000000000d9';
  get diagnostics n = row_count;
  if n <> 1 or not (select edited from public.weekly_summaries where id = '00000000-0000-4000-b000-0000000000d9') then
    raise exception 'FAIL: trainer edit not saved or not marked edited';
  end if;
  begin
    update public.weekly_summaries set status = 'shared' where id = '00000000-0000-4000-b000-0000000000d9';
    raise exception 'FAIL: trainer shared directly (must go through the function)';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.trainer_dashboard() where client_id = '00000000-0000-4000-a000-0000000000c1' and summary_ready) then
    raise exception 'FAIL: dashboard does not show the ready summary';
  end if;
  if exists (select 1 from public.trainer_dashboard() where client_id = '00000000-0000-4000-a000-0000000000c2') then
    raise exception 'FAIL: T1 dashboard shows another trainer''s client';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Milestone 10: water (habits_daily) and progress photos
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
do $$
declare me uuid := '00000000-0000-4000-a000-0000000000c1';
begin
  insert into public.habits_daily (client_id, habit_date, water_ml) values (me, current_date, 750);
  begin
    insert into public.habits_daily (client_id, habit_date, water_ml)
    values ('00000000-0000-4000-a000-0000000000c2', current_date, 250);
    raise exception 'FAIL: client logged water for another client';
  exception when insufficient_privilege then null;
  end;
  insert into public.measurements (client_id, measured_on, weight_kg, photo_paths)
  values (me, current_date, 71.5, array[me::text || '/a.jpg']);
  begin
    insert into public.measurements (client_id, measured_on, photo_paths)
    values (me, current_date - 3, array[me::text || '/b.jpg']);
    raise exception 'FAIL: two photo entries within a week were allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.measurements (client_id, measured_on, photo_paths)
    values (me, current_date - 30, array['00000000-0000-4000-a000-0000000000c2/x.jpg']);
    raise exception 'FAIL: photo path in another client''s folder was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.habits_daily where client_id = '00000000-0000-4000-a000-0000000000c1') <> 0 then
    raise exception 'FAIL: trainer T2 sees water of T1''s client';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.habits_daily where client_id = '00000000-0000-4000-a000-0000000000c1') <> 1 then
    raise exception 'FAIL: trainer cannot see their client''s water';
  end if;
  update public.habits_daily set water_ml = 9000 where client_id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: trainer changed a client''s water'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin A
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  if (select count(*) from public.profiles where email like 'rls-%@test.local') <> 6 then
    raise exception 'FAIL: admin cannot read all profiles';
  end if;
  if (select count(*) from public.trainer_clients) < 3 then
    raise exception 'FAIL: admin cannot read all mappings';
  end if;

  update public.profiles set is_active = false where id = '00000000-0000-4000-a000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot deactivate a user'; end if;

  update public.trainer_clients set trainer_id = '00000000-0000-4000-a000-0000000000f2'
  where client_id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot reassign a client'; end if;
end $$;

do $$
begin
  begin
    update public.profiles set role = 'trainer' where id = '00000000-0000-4000-a000-0000000000c1';
  exception when others then
    return;
  end;
  raise exception 'FAIL: role of a mapped client was changed without unlinking';
end $$;

-- ---------------------------------------------------------------------------
-- Anonymous (not signed in)
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.profiles limit 1;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAIL: anonymous user can query profiles';
end $$;

reset role;

select 'All RLS checks passed' as result;

rollback;
