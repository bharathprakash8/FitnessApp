-- Milestone 1: onboarding fields, targets (set by trainer) and measurements (weight from onboarding).

-- ---------------------------------------------------------------------------
-- profiles: onboarding answers
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column consent_version text,
  add column goal_other text check (goal_other is null or length(goal_other) <= 200),
  add constraint profiles_sex_check
    check (sex is null or sex in ('male', 'female', 'unspecified')),
  add constraint profiles_goal_check
    check (goal is null or goal in ('lose_weight', 'build_muscle', 'get_fitter', 'maintain', 'other')),
  add constraint profiles_dob_check
    check (date_of_birth is null or date_of_birth between '1920-01-01' and current_date),
  add constraint profiles_injuries_check
    check (injuries is null or length(injuries) <= 1000);

-- ---------------------------------------------------------------------------
-- targets: latest row by effective_from applies
-- ---------------------------------------------------------------------------
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  calories int not null check (calories between 800 and 6000),
  protein_g int not null check (protein_g between 0 and 500),
  carbs_g int not null check (carbs_g between 0 and 1000),
  fat_g int not null check (fat_g between 0 and 400),
  effective_from date not null default current_date,
  set_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.targets enable row level security;

create index targets_client_effective_idx on public.targets (client_id, effective_from desc, created_at desc);

-- ---------------------------------------------------------------------------
-- measurements: weight etc. (screens come in Milestone 10)
-- ---------------------------------------------------------------------------
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 400),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 30 and 250),
  notes text check (notes is null or length(notes) <= 1000),
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.measurements enable row level security;

create index measurements_client_date_idx on public.measurements (client_id, measured_on desc, created_at desc);

revoke all on public.targets from anon;
revoke all on public.measurements from anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- targets: client reads own; trainer manages for mapped clients; admin all
create policy "targets_select" on public.targets
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "targets_insert" on public.targets
  for insert to authenticated
  with check (
    (public.is_trainer_of(client_id) or public.is_admin())
    and set_by = (select auth.uid())
  );

create policy "targets_update" on public.targets
  for update to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin())
  with check (public.is_trainer_of(client_id) or public.is_admin());

create policy "targets_delete" on public.targets
  for delete to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin());

-- measurements: client full CRUD on own; trainer reads mapped clients; admin all
create policy "measurements_select" on public.measurements
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "measurements_insert" on public.measurements
  for insert to authenticated
  with check (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_admin()
  );

create policy "measurements_update" on public.measurements
  for update to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin())
  with check ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

create policy "measurements_delete" on public.measurements
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

-- ---------------------------------------------------------------------------
-- A user with targets or measurements can only be deactivated, not deleted.
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
$$;
