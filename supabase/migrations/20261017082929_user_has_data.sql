-- Used by the admin-users Edge Function: a user can be deleted only when this is false.
-- Each later milestone that adds user-owned tables must add them here.
create function public.user_has_data(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trainer_clients where trainer_id = uid)
$$;

revoke execute on function public.user_has_data(uuid) from public, anon, authenticated;
grant execute on function public.user_has_data(uuid) to service_role;
