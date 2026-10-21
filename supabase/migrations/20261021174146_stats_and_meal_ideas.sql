-- Stats tab + 7-day food ideas (21 Oct 2026).
--  * profiles.foods_to_avoid: allergies / dislikes; the AI always respects it. The person
--    themself or their trainer can set it (set_foods_to_avoid).
--  * stats_insights: AI observations for the Stats tab, at most one set per person per day;
--    written only by the coach-ai Edge Function, read by the person and their trainer.
--  * meal_plans: 7-day food ideas drafted by AI for a trainer, edited by the trainer and
--    shared with the client (the client sees shared ones only).

alter table public.profiles
  add column foods_to_avoid text check (foods_to_avoid is null or length(foods_to_avoid) <= 300);

create function public.set_foods_to_avoid(person uuid, foods text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (person = (select auth.uid()) or public.is_trainer_of(person) or public.is_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.profiles
  set foods_to_avoid = nullif(left(btrim(coalesce(foods, '')), 300), '')
  where id = person;
end;
$$;
revoke execute on function public.set_foods_to_avoid(uuid, text) from public, anon;
grant execute on function public.set_foods_to_avoid(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
create table public.stats_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  made_on date not null,
  period_days int not null default 30,
  insights jsonb not null default '[]',
  focus text not null default '',
  model text,
  created_at timestamptz not null default now(),
  unique (client_id, made_on)
);

alter table public.stats_insights enable row level security;
revoke all on public.stats_insights from anon;
revoke insert, update, delete on public.stats_insights from authenticated;

create policy "stats_insights_select" on public.stats_insights
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid references public.profiles (id) on delete set null,
  starts_on date not null,
  note text check (note is null or length(note) <= 500),
  -- [{ day: 1, meals: [{ meal, dish, portion, kcal, protein_g }] }, …] (7 days)
  days jsonb not null default '[]',
  target_kcal int,
  target_protein_g int,
  status text not null default 'draft' check (status in ('draft', 'shared')),
  edited boolean not null default false,
  shared_at timestamptz,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meal_plans enable row level security;
revoke all on public.meal_plans from anon;
create index meal_plans_client_idx on public.meal_plans (client_id, created_at desc);

create trigger touch_meal_plans
  before update on public.meal_plans
  for each row execute function public.touch_updated_at();

-- A trainer's edit is remembered.
create function public.mark_meal_plan_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.days is distinct from old.days or new.note is distinct from old.note)
     and (select auth.uid()) is not null then
    new.edited := true;
  end if;
  return new;
end;
$$;

create trigger mark_meal_plan_edited
  before update on public.meal_plans
  for each row execute function public.mark_meal_plan_edited();

-- Client: shared ones only. Trainer: their clients' (edit days/note; drafting and sharing go
-- through the coach-ai function). Admin: all.
create policy "meal_plans_select" on public.meal_plans
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client' and status = 'shared')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

revoke insert, update on public.meal_plans from authenticated;
grant update (days, note) on public.meal_plans to authenticated;

create policy "meal_plans_update" on public.meal_plans
  for update to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin())
  with check (public.is_trainer_of(client_id) or public.is_admin());

create policy "meal_plans_delete" on public.meal_plans
  for delete to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin());
