-- Milestone 10 (without chat): water tracking, water goal, private progress photos.

-- Water per day (client or trainer for themselves)
create table public.habits_daily (
  client_id uuid not null references public.profiles (id) on delete cascade,
  habit_date date not null,
  water_ml int not null default 0 check (water_ml between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (client_id, habit_date)
);

alter table public.habits_daily enable row level security;
revoke all on public.habits_daily from anon;

create trigger touch_habits_daily
  before update on public.habits_daily
  for each row execute function public.touch_updated_at();

create policy "habits_daily_select" on public.habits_daily
  for select to authenticated
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
create policy "habits_daily_insert" on public.habits_daily
  for insert to authenticated
  with check (client_id = (select auth.uid()) and public.tracks_self());
create policy "habits_daily_update" on public.habits_daily
  for update to authenticated
  using (client_id = (select auth.uid()) and public.tracks_self())
  with check (client_id = (select auth.uid()) and public.tracks_self());
create policy "habits_daily_delete" on public.habits_daily
  for delete to authenticated
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

-- Daily water goal, set with the other targets (null = 2.5 litres)
alter table public.targets
  add column water_ml int check (water_ml is null or water_ml between 500 and 8000);

-- ---------------------------------------------------------------------------
-- Progress photos: private bucket, path {owner_id}/{uuid}.jpg, kept (not auto-deleted)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 409600, array['image/jpeg']);

create policy "progress_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.tracks_self()
  );

create policy "progress_photos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.tracks_self())
      or public.is_trainer_of(public.try_uuid((storage.foldername(name))[1]))
      or public.is_admin()
    )
  );

create policy "progress_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.tracks_self())
      or public.is_admin()
    )
  );

-- Photos: at most 3 per entry, one photo entry per 7 days (keeps storage free for a year),
-- and every path must be in the owner's own folder.
create function public.check_progress_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p text;
begin
  if cardinality(new.photo_paths) = 0 then
    return new;
  end if;
  if cardinality(new.photo_paths) > 3 then
    raise exception 'Up to 3 photos per entry' using errcode = 'P0001';
  end if;
  foreach p in array new.photo_paths loop
    if split_part(p, '/', 1) <> new.client_id::text then
      raise exception 'Photo is not in your folder' using errcode = '42501';
    end if;
  end loop;
  if (tg_op = 'INSERT' or old.photo_paths is distinct from new.photo_paths) and exists (
    select 1 from public.measurements m
    where m.client_id = new.client_id
      and m.id <> new.id
      and cardinality(m.photo_paths) > 0
      and m.measured_on > new.measured_on - 7
      and m.measured_on < new.measured_on + 7
  ) then
    raise exception 'Progress photos can be added once a week' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_progress_photos
  before insert or update on public.measurements
  for each row execute function public.check_progress_photos();
