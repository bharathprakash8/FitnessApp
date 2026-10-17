-- Weekly meal-photo cleanup (Sunday 23:00 IST = 17:30 UTC) via pg_cron + pg_net.
-- The function URL and the cron secret are read from Supabase Vault at run time, so no
-- secret is stored here. Create them once per project (see docs/scheduled-jobs.md):
--   vault secret 'project_url'  e.g. https://<ref>.supabase.co
--   vault secret 'cron_secret'  same value as the CRON_SECRET function secret

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Meal photos older than the cutoff (service role only; the Edge Function removes them
-- through the Storage API).
create function public.old_meal_photos(cutoff timestamptz)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'meal-photos' and o.created_at < cutoff
  order by o.created_at
  limit 5000
$$;

revoke execute on function public.old_meal_photos(timestamptz) from public, anon, authenticated;
grant execute on function public.old_meal_photos(timestamptz) to service_role;

-- Calls an Edge Function with the cron secret header. Used by scheduled jobs.
create function public.call_cron_function(fn text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if base is null or secret is null then
    raise exception 'Vault secrets project_url and cron_secret must be set';
  end if;
  return net.http_post(
    url := base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := body,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.call_cron_function(text, jsonb) from public, anon, authenticated;

select cron.schedule(
  'cron-photo-cleanup',
  '30 17 * * 0',
  $$ select public.call_cron_function('cron-photo-cleanup') $$
);
