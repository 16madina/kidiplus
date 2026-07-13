-- 1) Flags on lives to track which reminders have already been sent (prevents duplicates)
ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS reminder_seller_24h_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_seller_1h_sent  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_buyer_24h_sent  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_buyer_1h_sent   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_buyer_15m_sent  BOOLEAN NOT NULL DEFAULT false;

-- 2) Function that scans scheduled lives and fires due reminders
CREATE OR REPLACE FUNCTION public.send_due_live_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_count integer := 0;
  r record;
BEGIN
  -- SELLER: 24h before
  FOR r IN
    SELECT id, seller_id, title
    FROM public.lives
    WHERE status = 'scheduled'
      AND reminder_seller_24h_sent = false
      AND scheduled_at <= v_now + interval '24 hours'
      AND scheduled_at >  v_now + interval '1 hour'
  LOOP
    INSERT INTO public.notifications(user_id, kind, title, body, data)
    VALUES (
      r.seller_id, 'live_reminder_seller_24h',
      'Ton live est prévu demain 📅', r.title,
      jsonb_build_object('live_id', r.id)
    );
    UPDATE public.lives SET reminder_seller_24h_sent = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- SELLER: 1h before
  FOR r IN
    SELECT id, seller_id, title
    FROM public.lives
    WHERE status = 'scheduled'
      AND reminder_seller_1h_sent = false
      AND scheduled_at <= v_now + interval '1 hour'
      AND scheduled_at >  v_now - interval '5 minutes'
  LOOP
    INSERT INTO public.notifications(user_id, kind, title, body, data)
    VALUES (
      r.seller_id, 'live_reminder_seller_1h',
      'Ton live commence dans 1 heure ⏰', r.title,
      jsonb_build_object('live_id', r.id)
    );
    UPDATE public.lives SET reminder_seller_1h_sent = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- BUYERS (who tapped "Me rappeler"): 24h before
  FOR r IN
    SELECT l.id, l.seller_id, l.title,
           COALESCE(p.display_name, p.handle, 'Un vendeur') AS seller_name
    FROM public.lives l
    JOIN public.profiles p ON p.id = l.seller_id
    WHERE l.status = 'scheduled'
      AND l.reminder_buyer_24h_sent = false
      AND l.scheduled_at <= v_now + interval '24 hours'
      AND l.scheduled_at >  v_now + interval '1 hour'
  LOOP
    INSERT INTO public.notifications(user_id, kind, title, body, data)
    SELECT rm.user_id, 'live_reminder_24h',
           r.seller_name || ' est en direct demain 📅', r.title,
           jsonb_build_object('live_id', r.id, 'seller_id', r.seller_id)
    FROM public.live_reminders rm
    WHERE rm.live_id = r.id AND rm.user_id <> r.seller_id;
    UPDATE public.lives SET reminder_buyer_24h_sent = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- BUYERS: 1h before
  FOR r IN
    SELECT l.id, l.seller_id, l.title,
           COALESCE(p.display_name, p.handle, 'Un vendeur') AS seller_name
    FROM public.lives l
    JOIN public.profiles p ON p.id = l.seller_id
    WHERE l.status = 'scheduled'
      AND l.reminder_buyer_1h_sent = false
      AND l.scheduled_at <= v_now + interval '1 hour'
      AND l.scheduled_at >  v_now + interval '15 minutes'
  LOOP
    INSERT INTO public.notifications(user_id, kind, title, body, data)
    SELECT rm.user_id, 'live_reminder_1h',
           r.seller_name || ' est en direct dans 1 heure ⏰', r.title,
           jsonb_build_object('live_id', r.id, 'seller_id', r.seller_id)
    FROM public.live_reminders rm
    WHERE rm.live_id = r.id AND rm.user_id <> r.seller_id;
    UPDATE public.lives SET reminder_buyer_1h_sent = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- BUYERS: 15 min before
  FOR r IN
    SELECT l.id, l.seller_id, l.title,
           COALESCE(p.display_name, p.handle, 'Un vendeur') AS seller_name
    FROM public.lives l
    JOIN public.profiles p ON p.id = l.seller_id
    WHERE l.status = 'scheduled'
      AND l.reminder_buyer_15m_sent = false
      AND l.scheduled_at <= v_now + interval '15 minutes'
      AND l.scheduled_at >  v_now - interval '5 minutes'
  LOOP
    INSERT INTO public.notifications(user_id, kind, title, body, data)
    SELECT rm.user_id, 'live_reminder_15m',
           r.seller_name || ' passe en direct dans 15 min 🔴', r.title,
           jsonb_build_object('live_id', r.id, 'seller_id', r.seller_id)
    FROM public.live_reminders rm
    WHERE rm.live_id = r.id AND rm.user_id <> r.seller_id;
    UPDATE public.lives SET reminder_buyer_15m_sent = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.send_due_live_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_due_live_reminders() TO service_role;

-- 3) Cron: run every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-live-reminders') THEN
    PERFORM cron.unschedule('send-due-live-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'send-due-live-reminders',
  '*/5 * * * *',
  $cron$SELECT public.send_due_live_reminders();$cron$
);
