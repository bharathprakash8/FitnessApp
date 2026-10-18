-- Trainer-set reminders.
-- 1. The trainer can change a client's meal and workout reminder times, and can lock them
--    (meal_times_locked) so the client can't change or switch them off.
-- 2. custom_reminders: the trainer's own reminders for a client (cardio, session, food,
--    other) on chosen weekdays. The trainer decides per reminder whether the client may mute
--    it (client_can_mute). Locked reminders arrive even if the client pauses reminders.

alter table public.reminder_settings
  add column meal_times_locked boolean not null default false,
  add column updated_by uuid references public.profiles (id) on delete set null;

create table public.custom_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  kind text not null default 'other' check (kind in ('cardio', 'session', 'food', 'other')),
  title text not null check (length(title) between 1 and 60),
  body text check (body is null or length(body) <= 200),
  remind_at time not null,
  -- ISO weekdays: 1 = Monday … 7 = Sunday
  days smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(days) between 1 and 7 and days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  client_can_mute boolean not null default true,
  muted boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_reminders enable row level security;
revoke all on public.custom_reminders from anon;
create index custom_reminders_client_idx on public.custom_reminders (client_id);

create trigger touch_custom_reminders
  before update on public.custom_reminders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers: what the client may change
-- ---------------------------------------------------------------------------

-- The client may not unlock, or change locked meal/workout reminders. Their own "all
-- reminders" switch stays theirs (locked reminders ignore it).
create function public.guard_reminder_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  by_client boolean := (select auth.uid()) = new.client_id;
begin
  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;
  if not by_client then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.meal_times_locked then
      raise exception 'Only your trainer can lock reminders' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.meal_times_locked is distinct from old.meal_times_locked then
    raise exception 'Only your trainer can lock reminders' using errcode = '42501';
  end if;
  if old.meal_times_locked and (
    (new.breakfast_on, new.breakfast_time, new.lunch_on, new.lunch_time, new.snack_on,
     new.snack_time, new.dinner_on, new.dinner_time, new.workout_reminder_time)
    is distinct from
    (old.breakfast_on, old.breakfast_time, old.lunch_on, old.lunch_time, old.snack_on,
     old.snack_time, old.dinner_on, old.dinner_time, old.workout_reminder_time)
  ) then
    raise exception 'Your trainer has set these reminders' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_reminder_settings
  before insert or update on public.reminder_settings
  for each row execute function public.guard_reminder_settings();

-- The client may only mute/unmute, and only when the trainer allows it.
create function public.guard_custom_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.client_can_mute then
    new.muted := false;
  end if;
  if (select auth.uid()) = old.client_id then
    if (to_jsonb(new) - 'muted' - 'updated_at') is distinct from (to_jsonb(old) - 'muted' - 'updated_at') then
      raise exception 'Only your trainer can change this reminder' using errcode = '42501';
    end if;
    if new.muted and not old.client_can_mute then
      raise exception 'Your trainer has made this reminder always on' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_custom_reminders
  before update on public.custom_reminders
  for each row execute function public.guard_custom_reminders();

-- At most 20 custom reminders per client.
create function public.check_custom_reminder_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.custom_reminders where client_id = new.client_id) >= 20 then
    raise exception 'A client can have up to 20 reminders' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
    raise exception 'Reminders can only be set for clients' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger check_custom_reminder_limit
  before insert on public.custom_reminders
  for each row execute function public.check_custom_reminder_limit();

-- Lets the trainer see whether a client can receive reminders at all (without exposing
-- the device tokens).
create function public.has_push_device(client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.is_trainer_of(client) or public.is_admin() or client = (select auth.uid()))
    and exists (select 1 from public.push_tokens where user_id = client)
$$;

revoke execute on function public.has_push_device(uuid) from public, anon;
grant execute on function public.has_push_device(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- reminder_settings: the client's trainer can now read and change them too
drop policy "reminder_settings_select" on public.reminder_settings;
drop policy "reminder_settings_insert" on public.reminder_settings;
drop policy "reminder_settings_update" on public.reminder_settings;

create policy "reminder_settings_select" on public.reminder_settings
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "reminder_settings_insert" on public.reminder_settings
  for insert to authenticated
  with check (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
  );

create policy "reminder_settings_update" on public.reminder_settings
  for update to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
  )
  with check (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
  );

-- custom_reminders: trainer (and admin) manage; the client reads and may mute
create policy "custom_reminders_select" on public.custom_reminders
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "custom_reminders_insert" on public.custom_reminders
  for insert to authenticated
  with check (public.is_trainer_of(client_id) or public.is_admin());

create policy "custom_reminders_update" on public.custom_reminders
  for update to authenticated
  using (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  )
  with check (
    (client_id = (select auth.uid()) and public.app_role() = 'client')
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );

create policy "custom_reminders_delete" on public.custom_reminders
  for delete to authenticated
  using (public.is_trainer_of(client_id) or public.is_admin());
