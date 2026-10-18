-- Backup Gemini models: record AI usage per model, and show it in App health.

alter table public.ai_token_usage add column model text not null default '';
alter table public.ai_token_usage drop constraint ai_token_usage_pkey;
alter table public.ai_token_usage add primary key (day, feature, model);

drop function public.record_ai_tokens(text, bigint, bigint, bigint);

create function public.record_ai_tokens(
  feat text,
  model_name text,
  input_t bigint,
  output_t bigint,
  total_t bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_token_usage (day, feature, model, calls, input_tokens, output_tokens, total_tokens)
  values ((now() at time zone 'Asia/Kolkata')::date, feat, coalesce(model_name, ''), 1, input_t, output_t, total_t)
  on conflict (day, feature, model) do update set
    calls = public.ai_token_usage.calls + 1,
    input_tokens = public.ai_token_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_token_usage.output_tokens + excluded.output_tokens,
    total_tokens = public.ai_token_usage.total_tokens + excluded.total_tokens
$$;

revoke execute on function public.record_ai_tokens(text, text, bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.record_ai_tokens(text, text, bigint, bigint, bigint) to service_role;

create or replace function public.admin_app_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'checked_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'largest_tables', (
      select coalesce(jsonb_agg(t order by t.bytes desc), '[]')
      from (
        select c.relname as name, pg_total_relation_size(c.oid) as bytes
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 5
      ) t
    ),
    'storage', (
      select coalesce(jsonb_agg(b order by b.bucket), '[]')
      from (
        select bucket_id as bucket, count(*) as files,
          coalesce(sum((metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects
        group by bucket_id
      ) b
    ),
    'users', (
      select jsonb_build_object(
        'clients', count(*) filter (where role = 'client' and is_active),
        'trainers', count(*) filter (where role = 'trainer' and is_active),
        'admins', count(*) filter (where role = 'admin' and is_active),
        'inactive', count(*) filter (where not is_active)
      )
      from public.profiles
    ),
    'push_devices', (select count(*) from public.push_tokens),
    'push_users', (select count(distinct user_id) from public.push_tokens),
    'ai_today', (
      select coalesce(jsonb_agg(a order by a.feature), '[]')
      from (
        select feature, sum(calls) as calls, sum(input_tokens) as input_tokens,
          sum(output_tokens) as output_tokens, sum(total_tokens) as total_tokens
        from public.ai_token_usage where day = today
        group by feature
      ) a
    ),
    'ai_models_today', (
      select coalesce(jsonb_agg(m order by m.calls desc), '[]')
      from (
        select model, sum(calls) as calls, sum(total_tokens) as total_tokens
        from public.ai_token_usage where day = today
        group by model
      ) m
    ),
    'ai_month', (
      select jsonb_build_object(
        'calls', coalesce(sum(calls), 0),
        'total_tokens', coalesce(sum(total_tokens), 0)
      )
      from public.ai_token_usage
      where day >= date_trunc('month', today)::date
    ),
    'ai_last_14_days', (
      select coalesce(jsonb_agg(d order by d.day), '[]')
      from (
        select day, sum(calls) as calls, sum(total_tokens) as tokens
        from public.ai_token_usage
        where day > today - 14
        group by day
      ) d
    ),
    'ai_top_users_today', (
      select coalesce(jsonb_agg(u order by u.calls desc), '[]')
      from (
        select coalesce(p.full_name, p.email) as name, sum(a.count) as calls
        from public.ai_usage a join public.profiles p on p.id = a.user_id
        where a.used_on = today and a.feature like 'analyze-meal%'
        group by p.full_name, p.email
        order by sum(a.count) desc
        limit 5
      ) u
    ),
    'ai_daily_request_limit', (
      select value from public.app_settings where key = 'ai_daily_request_limit'
    )
  ) into result;
  return result;
end;
$$;
