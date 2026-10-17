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
