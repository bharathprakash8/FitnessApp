-- Keep-alive: the daily GitHub job (.github/workflows/keepalive.yml) calls this so the free
-- project never pauses for inactivity. Returns no data.
create function public.ping()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
