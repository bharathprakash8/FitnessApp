-- Main model + backups (GEMINI_FALLBACK_MODELS), free daily quotas from Google AI Studio on
-- 19 Oct 2026: 3.8 Flash 20 + 3.7 Flash 20 + 3.6 Flash 20 + 3.5 Flash Lite 500
-- + 3.1 Flash Lite 500 = 1060 requests a day.
update public.app_settings set value = '1060'::jsonb, updated_at = now()
where key = 'ai_daily_request_limit';
