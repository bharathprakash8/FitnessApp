-- Trainers track their own fitness too ("My fitness"): food, workouts, activity, weight,
-- targets and their own reminder times. Every change below only widens "own rows" from
-- clients to clients + trainers (public.tracks_self()); nobody gains access to anyone
-- else's data. A trainer's own data is visible to the trainer and admins only.

-- meal_logs
alter policy "meal_logs_select" on public.meal_logs
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "meal_logs_insert" on public.meal_logs
  with check (client_id = (select auth.uid()) and public.tracks_self());
alter policy "meal_logs_update" on public.meal_logs
  using (client_id = (select auth.uid()) and public.tracks_self())
  with check (client_id = (select auth.uid()) and public.tracks_self());
alter policy "meal_logs_delete" on public.meal_logs
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

-- meal photos: {owner_id}/{date}/{uuid}.jpg
alter policy "meal_photos_insert_own" on storage.objects
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.tracks_self()
  );
alter policy "meal_photos_select" on storage.objects
  using (
    bucket_id = 'meal-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.tracks_self())
      or public.is_trainer_of(public.try_uuid((storage.foldername(name))[1]))
      or public.is_admin()
    )
  );
alter policy "meal_photos_delete_own" on storage.objects
  using (
    bucket_id = 'meal-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and public.tracks_self())
      or public.is_admin()
    )
  );

-- workout_logs
alter policy "workout_logs_select" on public.workout_logs
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "workout_logs_insert" on public.workout_logs
  with check ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());
alter policy "workout_logs_update" on public.workout_logs
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin())
  with check ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());
alter policy "workout_logs_delete" on public.workout_logs
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

-- activity_daily
alter policy "activity_daily_select" on public.activity_daily
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "activity_daily_insert" on public.activity_daily
  with check (client_id = (select auth.uid()) and public.tracks_self());
alter policy "activity_daily_update" on public.activity_daily
  using (client_id = (select auth.uid()) and public.tracks_self())
  with check (client_id = (select auth.uid()) and public.tracks_self());
alter policy "activity_daily_delete" on public.activity_daily
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

-- measurements
alter policy "measurements_select" on public.measurements
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "measurements_insert" on public.measurements
  with check ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());
alter policy "measurements_update" on public.measurements
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin())
  with check ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());
alter policy "measurements_delete" on public.measurements
  using ((client_id = (select auth.uid()) and public.tracks_self()) or public.is_admin());

-- targets: a client reads theirs; a trainer also sets their own
alter policy "targets_select" on public.targets
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "targets_insert" on public.targets
  with check (
    (
      public.is_trainer_of(client_id)
      or public.is_admin()
      or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
    )
    and set_by = (select auth.uid())
  );
alter policy "targets_update" on public.targets
  using (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  )
  with check (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  );
alter policy "targets_delete" on public.targets
  using (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  );

-- plan_assignments: a trainer can follow one of their own plans
alter policy "plan_assignments_select" on public.plan_assignments
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.can_edit_plan(plan_id)
    or public.is_admin()
  );
alter policy "plan_assignments_insert" on public.plan_assignments
  with check (
    (public.can_edit_plan(plan_id) and public.is_trainer_of(client_id))
    or (public.can_edit_plan(plan_id) and client_id = (select auth.uid())
        and public.app_role() = 'trainer')
    or public.is_admin()
  );
alter policy "plan_assignments_update" on public.plan_assignments
  using (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  )
  with check (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  );
alter policy "plan_assignments_delete" on public.plan_assignments
  using (
    public.is_trainer_of(client_id) or public.is_admin()
    or (client_id = (select auth.uid()) and public.app_role() = 'trainer')
  );

-- reminder_settings: a trainer's own meal/workout reminders
alter policy "reminder_settings_select" on public.reminder_settings
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
    or public.is_admin()
  );
alter policy "reminder_settings_insert" on public.reminder_settings
  with check (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
  );
alter policy "reminder_settings_update" on public.reminder_settings
  using (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
  )
  with check (
    (client_id = (select auth.uid()) and public.tracks_self())
    or public.is_trainer_of(client_id)
  );
