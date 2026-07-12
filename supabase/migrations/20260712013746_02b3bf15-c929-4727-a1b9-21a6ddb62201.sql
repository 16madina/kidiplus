ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS host_last_seen_at timestamptz;

ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS abandon_push_sent_at timestamptz;

UPDATE public.lives
   SET host_last_seen_at = COALESCE(started_at, now())
 WHERE status = 'live'
   AND host_last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS lives_host_last_seen_idx
  ON public.lives (status, host_last_seen_at);

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
         ended_at = NULL,
         abandon_push_sent_at = NULL
   WHERE id = _live_id;

  RETURN jsonb_build_object('ok', true, 'host_last_seen_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.touch_live_host(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_live_host(uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.notify_absent_host_lives(
  _warn_after_minutes int DEFAULT 2,
  _max_age_minutes int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_warn int := GREATEST(COALESCE(_warn_after_minutes, 2), 1);
  v_max int := GREATEST(COALESCE(_max_age_minutes, 5), v_warn + 1);
  v_warn_before timestamptz := now() - make_interval(mins => v_warn);
  v_expire_before timestamptz := now() - make_interval(mins => v_max);
  v_remaining int := v_max - v_warn;
  v_count int := 0;
  r record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  FOR r IN
    SELECT id, seller_id, title,
           COALESCE(host_last_seen_at, started_at) AS last_seen
      FROM public.lives
     WHERE status = 'live'
       AND abandon_push_sent_at IS NULL
       AND COALESCE(host_last_seen_at, started_at, now()) <= v_warn_before
       AND COALESCE(host_last_seen_at, started_at, now()) > v_expire_before
  LOOP
    v_remaining := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (r.last_seen + make_interval(mins => v_max) - now())) / 60.0)::int
    );

    PERFORM public._push_notification(
      r.seller_id,
      'live_host_absent',
      'Ton live est encore ouvert',
      format(
        'Reprends « %s » — fermeture dans ~%s min.',
        left(COALESCE(nullif(trim(r.title), ''), 'ton live'), 40),
        v_remaining
      ),
      NULL,
      jsonb_build_object(
        'kind', 'resume_host_live',
        'live_id', r.id,
        'remaining_minutes', v_remaining
      )
    );

    UPDATE public.lives
       SET abandon_push_sent_at = now()
     WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'notified', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_absent_host_lives(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.notify_absent_host_lives(int, int) TO authenticated;