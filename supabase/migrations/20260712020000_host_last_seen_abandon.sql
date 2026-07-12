-- Track host presence so abandoned lives can be auto-ended, and hosts can reconnect.

ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS host_last_seen_at timestamptz;

-- Backfill open lives so they don't all expire immediately.
UPDATE public.lives
   SET host_last_seen_at = COALESCE(started_at, now())
 WHERE status = 'live'
   AND host_last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS lives_host_last_seen_idx
  ON public.lives (status, host_last_seen_at);

-- Touch host presence (seller only).
CREATE OR REPLACE FUNCTION public.touch_live_host(_live_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_live public.lives;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_live.seller_id <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_live.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  UPDATE public.lives
     SET host_last_seen_at = now(),
         ended_at = NULL
   WHERE id = _live_id;

  RETURN jsonb_build_object('ok', true, 'host_last_seen_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.touch_live_host(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_live_host(uuid) TO authenticated;

-- End lives whose host has been gone longer than `_max_age_minutes` (default 5).
-- Any authenticated caller may expire abandoned lives (helps clean the public feed).
CREATE OR REPLACE FUNCTION public.expire_abandoned_lives(
  _seller_id uuid DEFAULT NULL,
  _max_age_minutes int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_cutoff timestamptz := now() - make_interval(mins => GREATEST(COALESCE(_max_age_minutes, 5), 1));
  v_count int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  WITH ended AS (
    UPDATE public.lives
       SET status = 'ended',
           ended_at = now()
     WHERE status = 'live'
       AND (_seller_id IS NULL OR seller_id = _seller_id)
       AND COALESCE(host_last_seen_at, started_at, now()) < v_cutoff
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM ended;

  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_abandoned_lives(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_lives(uuid, int) TO authenticated;
