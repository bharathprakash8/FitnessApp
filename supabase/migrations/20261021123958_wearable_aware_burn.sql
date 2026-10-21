-- Calories burnt without duplicates, worked out automatically:
--  * activity_daily.worn_hours: the hours (0–23, local time) in which a watch/band recorded
--    data (heart rate / resting energy). Only wearables record those, so a phone alone never
--    fills it.
--  * workout_logs.performed_at: when the set was done (so we can tell whether the watch was
--    on at that time); machine_kcal: calories shown on the machine/app (more accurate than an
--    estimate); logged_by: who logged it (the client, or their trainer).
--  * Trainers can log workouts for their clients (source 'trainer' for logs outside the plan)
--    and can change or delete only what they logged; clients can't delete trainer entries.

alter table public.activity_daily
  add column worn_hours smallint[]
    check (worn_hours is null or worn_hours <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]);

alter table public.workout_logs
  add column performed_at timestamptz default now(),
  add column machine_kcal int check (machine_kcal is null or machine_kcal between 0 and 3000),
  add column logged_by uuid default auth.uid() references public.profiles (id) on delete set null;

alter table public.workout_logs drop constraint workout_logs_source_check;
alter table public.workout_logs
  add constraint workout_logs_source_check check (source in ('plan', 'self', 'trainer'));

-- Who logged it is always the signed-in person (can't be faked), and never changes.
create function public.stamp_workout_logger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.logged_by := (select auth.uid());
    end if;
  else
    new.logged_by := old.logged_by;
  end if;
  return new;
end;
$$;

create trigger stamp_workout_logger
  before insert or update on public.workout_logs
  for each row execute function public.stamp_workout_logger();

-- RLS: the client manages what they logged; the trainer manages what they logged for
-- their clients; both can read everything of the client (as before); admin all.
alter policy "workout_logs_insert" on public.workout_logs
  with check (
    (client_id = (select auth.uid()) and public.tracks_self())
    or (public.is_trainer_of(client_id) and source in ('plan', 'trainer'))
    or public.is_admin()
  );

alter policy "workout_logs_update" on public.workout_logs
  using (
    (client_id = (select auth.uid()) and public.tracks_self()
      and (logged_by is null or logged_by = (select auth.uid())))
    or (public.is_trainer_of(client_id) and logged_by = (select auth.uid()))
    or public.is_admin()
  )
  with check (
    (client_id = (select auth.uid()) and public.tracks_self())
    or (public.is_trainer_of(client_id) and logged_by = (select auth.uid()))
    or public.is_admin()
  );

alter policy "workout_logs_delete" on public.workout_logs
  using (
    (client_id = (select auth.uid()) and public.tracks_self()
      and (logged_by is null or logged_by = (select auth.uid())))
    or (public.is_trainer_of(client_id) and logged_by = (select auth.uid()))
    or public.is_admin()
  );
