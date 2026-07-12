
-- 1) Harden notify_absent_host_lives: per-row exception handling so
--    abandon_push_sent_at is set ONLY when the notification insert succeeded.
CREATE OR REPLACE FUNCTION public.notify_absent_host_lives(
  _warn_after_minutes integer DEFAULT 2,
  _max_age_minutes integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_warn int := GREATEST(COALESCE(_warn_after_minutes, 2), 1);
  v_max int := GREATEST(COALESCE(_max_age_minutes, 5), v_warn + 1);
  v_warn_before timestamptz := now() - make_interval(mins => v_warn);
  v_expire_before timestamptz := now() - make_interval(mins => v_max);
  v_remaining int;
  v_count int := 0;
  v_failed int := 0;
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

    -- Each iteration is its own sub-transaction. If the notification insert
    -- fails, we skip the UPDATE so abandon_push_sent_at stays NULL and the
    -- row is retried on the next run.
    BEGIN
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
       WHERE id = r.id
         AND abandon_push_sent_at IS NULL;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'notified', v_count,
    'failed', v_failed
  );
END;
$function$;

-- 2) DB-level guard: refuse setting abandon_push_sent_at unless a matching
--    'live_host_absent' notification was just inserted for that live.
CREATE OR REPLACE FUNCTION public._enforce_abandon_push_sent_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only guard the NULL -> value transition. Clearing (value -> NULL) and
  -- unrelated updates pass through untouched.
  IF NEW.abandon_push_sent_at IS NOT NULL
     AND (OLD.abandon_push_sent_at IS DISTINCT FROM NEW.abandon_push_sent_at)
     AND OLD.abandon_push_sent_at IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.user_id = NEW.seller_id
         AND n.kind = 'live_host_absent'
         AND n.created_at >= now() - interval '1 minute'
         AND (n.data ->> 'live_id') = NEW.id::text
    ) THEN
      RAISE EXCEPTION
        'abandon_push_sent_at can only be set after a live_host_absent notification is created for live %',
        NEW.id
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lives_enforce_abandon_push_sent_at ON public.lives;
CREATE TRIGGER lives_enforce_abandon_push_sent_at
BEFORE UPDATE OF abandon_push_sent_at ON public.lives
FOR EACH ROW
EXECUTE FUNCTION public._enforce_abandon_push_sent_at();
