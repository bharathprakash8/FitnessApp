-- In-app update popup: which Android APK is the latest. The app compares this with its own
-- build number. No personal data, so it can also be read before logging in.
-- The APK workflow (.github/workflows/android.yml) updates it after publishing a release.

insert into public.app_settings (key, value) values
  ('latest_android', '{"code": 14, "name": "0.1.0.14", "notes": null, "min_code": 0}'::jsonb)
on conflict (key) do nothing;

create or replace function public.app_update_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'latest_android'),
    '{}'::jsonb
  );
$$;

revoke all on function public.app_update_info() from public;
grant execute on function public.app_update_info() to anon, authenticated, service_role;

-- Called only by the APK workflow (service role). min_code (a forced update, no "Later") is
-- kept as it is: raise it by hand only when old APKs can no longer work with the server.
create or replace function public.set_latest_android(p_code int, p_name text, p_notes text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.app_settings (key, value, updated_at)
  values (
    'latest_android',
    jsonb_build_object('code', p_code, 'name', p_name, 'notes', nullif(p_notes, ''), 'min_code', 0),
    now()
  )
  on conflict (key) do update set
    value = public.app_settings.value || jsonb_build_object(
      'code', p_code, 'name', p_name, 'notes', nullif(p_notes, '')
    ),
    updated_at = now();
$$;

revoke all on function public.set_latest_android(int, text, text) from public, anon, authenticated;
grant execute on function public.set_latest_android(int, text, text) to service_role;
