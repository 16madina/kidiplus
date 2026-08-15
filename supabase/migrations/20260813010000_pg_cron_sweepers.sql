-- Schedule the money/ops sweepers that were previously opportunistic
-- (triggered only when someone opened the app). pg_cron guarantees they run.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname IN (
      'release-overdue-escrow',
      'expire-overdue-orders',
      'settle-expired-auctions',
      'send-due-live-reminders',
      'expire-abandoned-lives',
      'notify-absent-host-lives',
      'mark-expired-live-replays',
      'purge-expired-live-replays'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Escrow auto-release after 7 days shipped + J+5 delivery reminders (inside the same RPC)
SELECT cron.schedule(
  'release-overdue-escrow',
  '*/15 * * * *',
  $cron$SELECT public.release_overdue_escrow();$cron$
);

-- Unpaid auction / overdue pending orders
SELECT cron.schedule(
  'expire-overdue-orders',
  '*/5 * * * *',
  $cron$SELECT public.expire_overdue_orders();$cron$
);

-- Close auctions whose timer elapsed while the host device is offline
SELECT cron.schedule(
  'settle-expired-auctions',
  '* * * * *',
  $cron$SELECT public.settle_expired_auctions(NULL);$cron$
);

-- Scheduled-live start reminders
SELECT cron.schedule(
  'send-due-live-reminders',
  '*/5 * * * *',
  $cron$SELECT public.send_due_live_reminders();$cron$
);

-- End lives whose host heartbeat is stale (defaults: all sellers, 5 min)
SELECT cron.schedule(
  'expire-abandoned-lives',
  '*/5 * * * *',
  $cron$SELECT public.expire_abandoned_lives();$cron$
);

SELECT cron.schedule(
  'notify-absent-host-lives',
  '*/2 * * * *',
  $cron$SELECT public.notify_absent_host_lives();$cron$
);

-- Mark replay rows expired (file delete still needs the HTTP purge when secrets exist)
SELECT cron.schedule(
  'mark-expired-live-replays',
  '20 3 * * *',
  $cron$SELECT public.mark_expired_live_replays();$cron$
);
