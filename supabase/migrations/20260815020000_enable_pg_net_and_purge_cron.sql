-- Unblock notification fanout, email queue, and replay HTTP purge.
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Daily file purge (mark-expired already runs at 03:20; this hits the HTTP
-- endpoint when live_replay_purge_url + secret are set).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-live-replays') THEN
    PERFORM cron.unschedule('purge-expired-live-replays');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-expired-live-replays',
  '15 3 * * *',
  $cron$SELECT public.purge_expired_live_replays_http();$cron$
);

-- Point fanout at production KiDi+ (not the old Lovable preview host).
UPDATE public.app_config
SET value = 'https://kidiplus.com/api/public/notifications-fanout',
    updated_at = now()
WHERE key = 'fanout_url'
  AND value LIKE '%lovable.app%';
