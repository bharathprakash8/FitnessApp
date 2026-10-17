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

do $$
begin
  begin
    insert into public.workout_logs (client_id, exercise_id, set_number, reps)
    values ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-b000-0000000000e1', 9, 5);
  exception when others then
    return;
  end;
  raise exception 'FAIL: trainer logged a workout for a client';
end $$;

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
  if (select count(*) from public.reminder_settings) + (select count(*) from public.push_tokens) <> 0 then
    raise exception 'FAIL: trainer can see client reminder settings or push tokens';
  end if;
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
