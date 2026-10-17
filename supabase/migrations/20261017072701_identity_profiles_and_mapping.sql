-- Milestone 0: identity (profiles), trainer–client mapping, helper functions and RLS.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on auth.users insert
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('admin', 'trainer', 'client')),
  is_active boolean not null default true,
  timezone text not null default 'Asia/Kolkata',
  -- client profile
  date_of_birth date,
  sex text,
  height_cm numeric check (height_cm is null or height_cm between 50 and 260),
  goal text,
  diet_preference text check (diet_preference in ('veg', 'egg', 'non_veg', 'vegan')),
  injuries text,
  consent_at timestamptz,
  onboarded_at timestamptz,
  -- sha-256 of the iPhone Shortcut token (Milestone 4)
  health_sync_token_hash text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- trainer_clients: each client has exactly one trainer
-- ---------------------------------------------------------------------------
create table public.trainer_clients (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null
);

alter table public.trainer_clients enable row level security;

create index trainer_clients_trainer_id_idx on public.trainer_clients (trainer_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read past RLS)
-- ---------------------------------------------------------------------------

-- Role of the signed-in user; null when not signed in or deactivated.
create function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create function public.is_trainer_of(client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'trainer', false)
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid()) and tc.client_id = client
    )
$$;

-- Trainer of the signed-in client; null for anyone else.
create function public.my_trainer()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tc.trainer_id from public.trainer_clients tc
  where tc.client_id = (select auth.uid())
    and public.app_role() = 'client'
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile for every new auth user. Role comes from app_metadata, which
-- only the service role (admin-users function) can set – never from user_metadata.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when requested_role in ('admin', 'trainer', 'client') then requested_role else 'client' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep profiles.email in step with the auth email.
create function public.handle_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_email_change();

-- Only admins (or the service role) may change id, email, role or is_active.
-- Nobody may change the role of someone who is in a trainer–client mapping.
-- Security invoker on purpose: current_user must be the real caller
-- (postgres = SQL editor/migrations, service_role = Edge Functions).
create function public.protect_profile_columns()
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

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- A mapping must link a client to a trainer.
create function public.check_trainer_client_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
    raise exception 'client_id must be a user with role client' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.trainer_id and role = 'trainer') then
    raise exception 'trainer_id must be a user with role trainer' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_trainer_client_roles
  before insert or update on public.trainer_clients
  for each row execute function public.check_trainer_client_roles();

-- ---------------------------------------------------------------------------
-- Grants: nothing for anonymous users
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon;
revoke all on public.trainer_clients from anon;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- profiles: own row, mapped clients (trainer), own trainer (client, for name/chat), admin all
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    (id = (select auth.uid()) and public.app_role() is not null)
    or public.is_trainer_of(id)
    or id = public.my_trainer()
    or public.is_admin()
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.app_role() is not null)
  with check (id = (select auth.uid()));

create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- Profiles are inserted only by the auth trigger, so no insert policy.

-- trainer_clients: client sees own row, trainer sees theirs, admin manages all
create policy "trainer_clients_select" on public.trainer_clients
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
  );

create policy "trainer_clients_admin_insert" on public.trainer_clients
  for insert to authenticated
  with check (public.is_admin());

create policy "trainer_clients_admin_update" on public.trainer_clients
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "trainer_clients_admin_delete" on public.trainer_clients
  for delete to authenticated
  using (public.is_admin());
