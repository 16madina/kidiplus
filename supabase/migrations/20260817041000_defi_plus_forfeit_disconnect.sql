-- Défi Plus: leaving or disconnecting is a forfeit, never a tie.
-- The remaining seller keeps their live and wins by abandon.

ALTER TABLE public.battle_sessions DROP CONSTRAINT IF EXISTS battle_sessions_end_reason_check;
ALTER TABLE public.battle_sessions
  ADD CONSTRAINT battle_sessions_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN (
    'timeout', 'forfeit', 'sudden_death', 'cancelled', 'disconnected'
  ));

CREATE OR REPLACE FUNCTION public._battle_end_internal(
  _battle_id uuid,
  _reason text,
  _forfeit_seller_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.battle_sessions;
  v_winner uuid;
  v_a numeric;
  v_b_score numeric;
  v_a_id uuid;
  v_b_id uuid;
BEGIN
  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_b.status IN ('ended', 'cancelled') THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'battle_id', _battle_id);
  END IF;
  IF _reason = 'timeout' AND v_b.status = 'running'
     AND v_b.ends_at IS NOT NULL AND now() < v_b.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_early');
  END IF;
  PERFORM public._battle_recompute_scores(_battle_id);
  SELECT seller_id, score_amount_live INTO v_a_id, v_a
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'a';
  SELECT seller_id, score_amount_live INTO v_b_id, v_b_score
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'b';
  IF _reason IN ('forfeit', 'disconnected') AND _forfeit_seller_id IS NOT NULL THEN
    v_winner := CASE WHEN _forfeit_seller_id = v_a_id THEN v_b_id ELSE v_a_id END;
  ELSIF coalesce(v_a, 0) > coalesce(v_b_score, 0) THEN
    v_winner := v_a_id;
  ELSIF coalesce(v_b_score, 0) > coalesce(v_a, 0) THEN
    v_winner := v_b_id;
  ELSE
    v_winner := NULL;
  END IF;
  UPDATE public.battle_sessions SET
    status = CASE WHEN _reason = 'cancelled' THEN 'cancelled' ELSE 'ended' END,
    ended_at = now(),
    end_reason = _reason,
    live_winner_seller_id = v_winner
  WHERE id = _battle_id;
  UPDATE public.battle_lives SET active = false WHERE battle_id = _battle_id;
  UPDATE public.battle_participants SET
    active = false,
    left_at = CASE
      WHEN seller_id = _forfeit_seller_id THEN coalesce(left_at, now())
      ELSE left_at
    END
  WHERE battle_id = _battle_id;
  RETURN jsonb_build_object('ok', true, 'battle_id', _battle_id, 'winner_seller_id', v_winner);
END;
$$;

CREATE OR REPLACE FUNCTION public.battle_end(
  _battle_id uuid,
  _reason text DEFAULT 'timeout',
  _forfeit_seller_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF _reason NOT IN ('timeout', 'forfeit', 'cancelled', 'sudden_death', 'disconnected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reason');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.battle_participants
    WHERE battle_id = _battle_id AND seller_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;
  IF _reason IN ('forfeit', 'disconnected') AND _forfeit_seller_id IS NULL THEN
    _forfeit_seller_id := v_user;
  END IF;
  RETURN public._battle_end_internal(_battle_id, _reason, _forfeit_seller_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_on_live_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    FOR r IN
      SELECT bl.battle_id
        FROM public.battle_lives bl
        JOIN public.battle_sessions s ON s.id = bl.battle_id
       WHERE bl.live_id = NEW.id AND s.status IN ('running', 'sudden_death')
    LOOP
      PERFORM public._battle_end_internal(r.battle_id, 'disconnected', NEW.seller_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_sweep_stale()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  UPDATE public.battle_invites
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at <= now();

  UPDATE public.battle_lives bl
     SET active = false
    FROM public.battle_sessions s
   WHERE s.id = bl.battle_id
     AND bl.active
     AND s.status IN ('ended', 'cancelled');

  UPDATE public.battle_participants bp
     SET active = false,
         left_at = coalesce(bp.left_at, now())
    FROM public.battle_sessions s
   WHERE s.id = bp.battle_id
     AND bp.active
     AND s.status IN ('ended', 'cancelled');

  FOR r IN
    SELECT s.id AS battle_id, stale.seller_id AS stale_seller_id
      FROM public.battle_sessions s
      JOIN public.battle_participants stale
        ON stale.battle_id = s.id
      JOIN public.battle_participants fresh
        ON fresh.battle_id = s.id
       AND fresh.seller_id <> stale.seller_id
     WHERE s.status IN ('running', 'sudden_death')
       AND s.started_at IS NOT NULL
       AND s.started_at < now() - interval '30 seconds'
       AND stale.last_seen_at < now() - interval '30 seconds'
       AND fresh.last_seen_at >= now() - interval '30 seconds'
  LOOP
    PERFORM public._battle_end_internal(r.battle_id, 'disconnected', r.stale_seller_id);
  END LOOP;

  FOR r IN
    SELECT id, status, ends_at, sudden_death_at, started_at
      FROM public.battle_sessions
     WHERE status IN ('running', 'sudden_death')
  LOOP
    IF r.status = 'running'
       AND r.ends_at IS NOT NULL
       AND now() >= r.ends_at + interval '60 seconds' THEN
      PERFORM public._battle_end_internal(r.id, 'timeout', NULL);
    ELSIF r.status = 'running'
       AND r.ends_at IS NOT NULL
       AND now() >= r.ends_at THEN
      PERFORM public._battle_enter_sudden_death_internal(r.id);
    ELSIF r.status = 'sudden_death' THEN
      IF (r.sudden_death_at IS NOT NULL AND r.sudden_death_at <= now() - interval '60 seconds')
         OR (r.sudden_death_at IS NULL AND r.ends_at IS NOT NULL AND r.ends_at <= now() - interval '60 seconds') THEN
        PERFORM public._battle_end_internal(r.id, 'sudden_death', NULL);
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.battle_heartbeat(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_other public.battle_participants;
  v_b public.battle_sessions;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public._battle_sweep_stale();

  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id;
  IF NOT FOUND OR v_b.status NOT IN ('running', 'sudden_death') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_running');
  END IF;

  UPDATE public.battle_participants SET last_seen_at = now()
   WHERE battle_id = _battle_id AND seller_id = v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  SELECT * INTO v_other FROM public.battle_participants
   WHERE battle_id = _battle_id AND seller_id <> v_user LIMIT 1;

  IF FOUND AND v_other.last_seen_at < now() - interval '30 seconds'
     AND v_b.started_at < now() - interval '30 seconds' THEN
    RETURN public._battle_end_internal(_battle_id, 'disconnected', v_other.seller_id);
  END IF;

  IF v_b.status = 'running' AND v_b.ends_at IS NOT NULL AND now() >= v_b.ends_at THEN
    RETURN public._battle_enter_sudden_death_internal(_battle_id);
  END IF;

  IF v_b.status = 'sudden_death' THEN
    IF (v_b.sudden_death_at IS NOT NULL AND v_b.sudden_death_at <= now() - interval '60 seconds')
       OR (v_b.sudden_death_at IS NULL AND v_b.ends_at IS NOT NULL AND v_b.ends_at <= now() - interval '60 seconds') THEN
      RETURN public._battle_end_internal(_battle_id, 'sudden_death', NULL);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
