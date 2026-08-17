-- Défi Plus — notification copy only. Same RPC logic as 20260816180000.

CREATE OR REPLACE FUNCTION public.battle_invite(
  _from_live_id uuid,
  _to_seller_id uuid,
  _duration_sec int DEFAULT 900
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
  IF EXISTS (SELECT 1 FROM public.battle_lives WHERE live_id = v_from.id AND active) THEN
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
    from_live_id, from_seller_id, to_seller_id, to_live_id, duration_sec, expires_at
  ) VALUES (
    _from_live_id, v_user, _to_seller_id, v_to_live.id, _duration_sec, now() + interval '60 seconds'
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

  INSERT INTO public.battle_sessions (status, duration_sec, started_at, ends_at, currency)
  VALUES ('running', v_dur, now(), now() + make_interval(secs => v_dur), v_currency)
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

GRANT EXECUTE ON FUNCTION public.battle_invite(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_accept(uuid, int) TO authenticated;
