-- Milestone 3: meal logs, AI usage counter and the private meal-photos bucket.

-- ---------------------------------------------------------------------------
-- meal_logs
-- ---------------------------------------------------------------------------
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  eaten_at timestamptz not null default now(),
  -- the client's local calendar day, so a day's meals can be read without time zone maths
  eaten_on date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  source text not null check (source in ('photo', 'text', 'manual')),
  photo_path text,
  photo_deleted boolean not null default false,
  input_text text check (input_text is null or length(input_text) <= 1000),
  -- [{name, portion, calories, protein_g, carbs_g, fat_g, confidence}]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  total_calories int not null default 0 check (total_calories between 0 and 10000),
  protein_g numeric(6, 1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g numeric(6, 1) not null default 0 check (fat_g between 0 and 1000),
  edited boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.meal_logs enable row level security;
revoke all on public.meal_logs from anon;
create index meal_logs_client_day_idx on public.meal_logs (client_id, eaten_on desc, eaten_at);
create index meal_logs_photo_idx on public.meal_logs (created_at) where photo_path is not null;

create policy "meal_logs_select" on public.meal_logs
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "meal_logs_insert" on public.meal_logs
  for insert to authenticated
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

create policy "meal_logs_update" on public.meal_logs
  for update to authenticated
  using (client_id = (select auth.uid()) and public.app_role() = 'client')
  with check (client_id = (select auth.uid()) and public.app_role() = 'client');

create policy "meal_logs_delete" on public.meal_logs
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.app_role() = 'client') or public.is_admin());

-- ---------------------------------------------------------------------------
-- ai_usage: written only by Edge Functions (service role); admin can read
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  used_on date not null,
  feature text not null,
  count int not null default 0,
  unique (user_id, used_on, feature)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

create policy "ai_usage_admin_select" on public.ai_usage
  for select to authenticated
  using (public.is_admin());

-- Atomically add one use and return the new count (service role only).
create function public.bump_ai_usage(uid uuid, day date, feat text)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage (user_id, used_on, feature, count)
  values (uid, day, feat, 1)
  on conflict (user_id, used_on, feature) do update set count = public.ai_usage.count + 1
  returning count
$$;

revoke execute on function public.bump_ai_usage(uuid, date, text) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, date, text) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private meal-photos bucket, path {client_id}/{yyyy-mm-dd}/{uuid}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 524288, array['image/jpeg']);

-- uuid from text, or null if it isn't one (a bad folder name must not raise an error)
create function public.try_uuid(t text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

create policy "meal_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.app_role() = 'client'
  );

create policy "meal_photos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.app_role() = 'client')
      or public.is_trainer_of(public.try_uuid((storage.foldername(name))[1]))
      or public.is_admin()
    )
  );

create policy "meal_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.app_role() = 'client')
      or public.is_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- Clients with meal logs can only be deactivated, not deleted.
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
$$;
