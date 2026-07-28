ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS replay_egress_id text NULL,
  ADD COLUMN IF NOT EXISTS replay_status text NULL,
  ADD COLUMN IF NOT EXISTS replay_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS replay_url text NULL,
  ADD COLUMN IF NOT EXISTS replay_ready_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS replay_expires_at timestamptz NULL;

COMMENT ON COLUMN public.lives.replay_egress_id IS 'LiveKit RoomComposite egress id for in-app MP4 replay recording';
COMMENT ON COLUMN public.lives.replay_status IS 'recording | processing | ready | failed | expired';
COMMENT ON COLUMN public.lives.replay_storage_path IS 'Object path inside the live-replays storage bucket';
COMMENT ON COLUMN public.lives.replay_url IS 'Public HTTPS URL for the MP4 while replay_status = ready';
COMMENT ON COLUMN public.lives.replay_expires_at IS 'Delete replay file after this timestamp (ended_at + 7 days)';

ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_replay_status_check;
ALTER TABLE public.lives ADD CONSTRAINT lives_replay_status_check
  CHECK (replay_status IS NULL OR replay_status IN ('recording','processing','ready','failed','expired'));

CREATE INDEX IF NOT EXISTS lives_replay_expires_at_idx
  ON public.lives (replay_expires_at)
  WHERE replay_expires_at IS NOT NULL
    AND replay_status IN ('ready','processing','recording');

DROP POLICY IF EXISTS "live-replays public read" ON storage.objects;
CREATE POLICY "live-replays public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'live-replays');

DROP POLICY IF EXISTS "live-replays no client insert" ON storage.objects;
DROP POLICY IF EXISTS "live-replays no client update" ON storage.objects;
DROP POLICY IF EXISTS "live-replays no client delete" ON storage.objects;

CREATE OR REPLACE FUNCTION public.mark_expired_live_replays()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.lives
  SET replay_status = 'expired', replay_url = NULL
  WHERE replay_expires_at IS NOT NULL
    AND replay_expires_at < now()
    AND coalesce(replay_status,'') <> 'expired';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_expired_live_replays() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_expired_live_replays() TO service_role;

INSERT INTO public.app_config (key, value)
VALUES ('live_replay_purge_url',''), ('live_replay_purge_secret','')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_expired_live_replays_http()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text; v_marked integer;
BEGIN
  v_marked := public.mark_expired_live_replays();
  SELECT value INTO v_url FROM public.app_config WHERE key = 'live_replay_purge_url';
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'live_replay_purge_secret';
  IF v_url IS NULL OR btrim(v_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_secret),
    body := jsonb_build_object('source','pg_cron','marked', v_marked)
  );
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_live_replays_http() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_live_replays_http() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

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