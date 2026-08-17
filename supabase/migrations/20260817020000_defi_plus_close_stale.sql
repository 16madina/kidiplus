-- Close Défi Plus sessions that already passed their clock, and repair
-- leftover active flags. Otherwise a finished challenge still blocks the next one.

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

CREATE OR REPLACE FUNCTION public.battle_invite(
  _from_live_id uuid,
  _to_seller_id uuid,
  _duration_sec int DEFAULT 900,
  _rematch_of uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from public.lives;
  v_to_live public.lives;
  v_to public.profiles;
  v_from_p public.profiles;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  PERFORM public._battle_sweep_stale();
  IF _duration_sec NOT IN (90, 600, 900, 1200, 1800) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;
  SELECT * INTO v_from FROM public.lives WHERE id = _from_live_id;
  IF NOT FOUND OR v_from.status <> 'live' OR v_from.seller_id <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_host');
  END IF;
  IF public._battle_live_has_restream(v_from) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'restream_active');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.battle_lives WHERE live_id = v_from.id AND active
  ) OR EXISTS (
    SELECT 1 FROM public.battle_participants WHERE seller_id = v_user AND active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_battle');
  END IF;
  SELECT * INTO v_to FROM public.profiles WHERE id = _to_seller_id;
  IF NOT FOUND OR NOT coalesce(v_to.is_seller, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_seller');
  END IF;
  IF coalesce(v_to.is_frozen, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'frozen');
  END IF;
  IF _to_seller_id = v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_participants WHERE seller_id = _to_seller_id AND active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_busy');
  END IF;
  SELECT * INTO v_to_live
    FROM public.lives
   WHERE seller_id = _to_seller_id AND status = 'live'
   ORDER BY started_at DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;
  IF public._battle_live_has_restream(v_to_live) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'restream_active');
  END IF;
  IF EXISTS (SELECT 1 FROM public.battle_lives WHERE live_id = v_to_live.id AND active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_busy');
  END IF;
  UPDATE public.battle_invites
     SET status = 'expired'
   WHERE to_seller_id = _to_seller_id AND status = 'pending' AND expires_at <= now();
  INSERT INTO public.battle_invites (
    from_live_id, from_seller_id, to_seller_id, to_live_id, duration_sec, expires_at,
    rematch, rematch_of_battle_id
  ) VALUES (
    _from_live_id, v_user, _to_seller_id, v_to_live.id, _duration_sec, now() + interval '60 seconds',
    _rematch_of IS NOT NULL, _rematch_of
  ) RETURNING id INTO v_id;
  SELECT * INTO v_from_p FROM public.profiles WHERE id = v_user;
  PERFORM public._battle_notify(
    _to_seller_id,
    'Défi Plus',
    '🔥 ' || coalesce(nullif(trim(v_from_p.display_name), ''), 'Une vendeuse')
      || ' vous lance un Défi Plus ! Vous aurez '
      || CASE
           WHEN _duration_sec = 90 THEN '90 secondes'
           ELSE (_duration_sec / 60)::text || ' minutes'
         END
      || ' pour vendre le plus.',
    jsonb_build_object('kind', 'battle_invite', 'invite_id', v_id, 'from_live_id', _from_live_id)
  );
  RETURN jsonb_build_object('ok', true, 'invite_id', v_id, 'to_live_id', v_to_live.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.battle_accept(
  _invite_id uuid,
  _duration_sec int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv public.battle_invites;
  v_from public.lives;
  v_to public.lives;
  v_from_p public.profiles;
  v_to_p public.profiles;
  v_dur int;
  v_bid uuid;
  v_currency text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  PERFORM public._battle_sweep_stale();
  SELECT * INTO v_inv FROM public.battle_invites WHERE id = _invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.to_seller_id <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.battle_invites SET status = 'expired' WHERE id = _invite_id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  v_dur := coalesce(_duration_sec, v_inv.duration_sec);
  IF v_dur NOT IN (90, 600, 900, 1200, 1800) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;
  SELECT * INTO v_from FROM public.lives WHERE id = v_inv.from_live_id;
  SELECT * INTO v_to FROM public.lives WHERE id = v_inv.to_live_id;
  IF v_from.status <> 'live' OR v_to.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;
  IF public._battle_live_has_restream(v_from) OR public._battle_live_has_restream(v_to) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'restream_active');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.battle_lives
    WHERE active AND live_id IN (v_from.id, v_to.id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_battle');
  END IF;
  v_currency := upper(coalesce(v_from.currency, 'XOF'));
  SELECT * INTO v_from_p FROM public.profiles WHERE id = v_from.seller_id;
  SELECT * INTO v_to_p FROM public.profiles WHERE id = v_to.seller_id;
  INSERT INTO public.battle_sessions (
    status, duration_sec, started_at, ends_at, currency,
    turn_side, turn_until, rematch_of_battle_id
  ) VALUES (
    'running', v_dur, now(), now() + make_interval(secs => v_dur), v_currency,
    'a', now() + interval '2 minutes', v_inv.rematch_of_battle_id
  )
  RETURNING id INTO v_bid;
  INSERT INTO public.battle_lives (battle_id, live_id, seller_id, side) VALUES
    (v_bid, v_from.id, v_from.seller_id, 'a'),
    (v_bid, v_to.id, v_to.seller_id, 'b');
  INSERT INTO public.battle_participants (battle_id, seller_id, display_name, side) VALUES
    (v_bid, v_from.seller_id, coalesce(v_from_p.display_name, v_from_p.handle, 'A'), 'a'),
    (v_bid, v_to.seller_id, coalesce(v_to_p.display_name, v_to_p.handle, 'B'), 'b');
  UPDATE public.battle_invites
     SET status = 'accepted', battle_id = v_bid, duration_sec = v_dur
   WHERE id = _invite_id;
  PERFORM public._battle_notify(
    v_from.seller_id,
    'Défi Plus',
    coalesce(nullif(trim(v_to_p.display_name), ''), 'L''autre vendeuse') || ' a accepté le défi.',
    jsonb_build_object('kind', 'battle_accepted', 'battle_id', v_bid)
  );
  RETURN jsonb_build_object('ok', true, 'battle_id', v_bid);
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
    RETURN public._battle_end_internal(_battle_id, 'forfeit', v_other.seller_id);
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
      PERFORM public._battle_end_internal(r.battle_id, 'cancelled', NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.battle_invite(uuid, uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_accept(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_heartbeat(uuid) TO authenticated;
