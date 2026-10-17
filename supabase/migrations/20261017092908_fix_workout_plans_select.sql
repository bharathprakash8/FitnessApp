-- INSERT ... RETURNING checks the SELECT policy on the new row. can_read_plan(id) looks the
-- plan up in a separate query that can't see a row inserted by the same statement, so
-- creating a plan failed with 403. Check the row's own columns instead.
drop policy "workout_plans_select" on public.workout_plans;

create policy "workout_plans_select" on public.workout_plans
  for select to authenticated
  using (
    (trainer_id = (select auth.uid()) and public.app_role() = 'trainer')
    or public.is_admin()
    or (public.app_role() = 'client' and exists (
      select 1 from public.plan_assignments pa
      where pa.plan_id = workout_plans.id and pa.client_id = (select auth.uid())
    ))
  );
