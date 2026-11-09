-- Onboarding (owner, 8 Nov 2026):
-- 1. One-time setup codes the admin sends on WhatsApp. They log the person in once, without
--    an email code. Only a SHA-256 hash is stored; single use; 7 days; a new code replaces the
--    old one. No API access at all – only the admin-users and setup-login functions (service
--    role) read or write these tables.
-- 2. start_ai_target(): a client on the AI coach gets an "Estimated" starting target as soon
--    as they finish "About you", so the portion planner works on day one.

create table public.setup_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.setup_links enable row level security;
revoke all on public.setup_links from anon, authenticated;

-- Every setup-code try, to slow down guessing (the function refuses after too many failures).
create table public.setup_attempts (
  id bigint generated always as identity primary key,
  ok boolean not null,
  at timestamptz not null default now()
);
alter table public.setup_attempts enable row level security;
revoke all on public.setup_attempts from anon, authenticated;
create index setup_attempts_at_idx on public.setup_attempts (at);

create or replace function public.start_ai_target()
returns public.targets
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  coach uuid;
  w numeric;
  yrs int;
  kcal numeric;
  prot int;
  fat int;
  carbs int;
  t_row public.targets;
begin
  select * into me from profiles where id = auth.uid() and is_active;
  if me.id is null or me.role <> 'client' then
    return null;
  end if;

  select tc.trainer_id into coach
  from trainer_clients tc
  join profiles t on t.id = tc.trainer_id
  where tc.client_id = me.id and t.is_ai_coach;
  if coach is null then
    return null; -- a human trainer sets the target
  end if;

  select * into t_row from targets
  where client_id = me.id
  order by effective_from desc, created_at desc
  limit 1;
  if t_row.id is not null then
    return t_row; -- already has one: never overwrite
  end if;

  -- Pregnancy needs a person to decide, not a formula.
  if 'pregnancy' = any (me.health_conditions) then
    return null;
  end if;

  select m.weight_kg into w from measurements m
  where m.client_id = me.id and m.weight_kg is not null
  order by m.measured_on desc, m.created_at desc
  limit 1;
  if w is null or me.height_cm is null or me.date_of_birth is null then
    return null;
  end if;

  -- Mifflin-St Jeor, light activity (same formula as the trainer's Estimated target).
  yrs := extract(year from age((now() at time zone me.timezone)::date, me.date_of_birth));
  kcal := (10 * w + 6.25 * me.height_cm - 5 * yrs
           + case me.sex when 'male' then 5 when 'female' then -161 else -78 end) * 1.375;
  if me.goal = 'lose_weight' then
    kcal := kcal - 500;
  elsif me.goal = 'build_muscle' then
    kcal := kcal + 250;
  end if;
  -- Never below 1,200 kcal (women) / 1,500 kcal (others), as in the portion planner.
  kcal := greatest(case when me.sex = 'female' then 1200 else 1500 end, round(kcal / 50) * 50);

  -- Protein that home Indian meals can reach: 1.2 g/kg (1.5 to lose weight or build muscle),
  -- at most 25% of calories.
  prot := round(least(
    w * case when me.goal in ('lose_weight', 'build_muscle') then 1.5 else 1.2 end,
    kcal * 0.25 / 4) / 5) * 5;
  fat := round(kcal * 0.25 / 9 / 5) * 5;
  carbs := greatest(0, round((kcal - prot * 4 - fat * 9) / 4 / 5) * 5);

  insert into targets (client_id, calories, protein_g, carbs_g, fat_g, effective_from, set_by)
  values (me.id, kcal, prot, carbs, fat, (now() at time zone me.timezone)::date, coach)
  returning * into t_row;
  return t_row;
end;
$$;

revoke all on function public.start_ai_target() from public, anon;
grant execute on function public.start_ai_target() to authenticated;
