-- Google's error on 19 Oct 2026 showed the real free-tier quota for our model:
-- GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20 (whole app, per day).
update public.app_settings set value = '20'::jsonb, updated_at = now()
where key = 'ai_daily_request_limit';
