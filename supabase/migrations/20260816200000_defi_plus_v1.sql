-- Défi Plus v1: sudden death, rematch metadata, auction turns, shared sale text.

ALTER TABLE public.battle_sessions DROP CONSTRAINT IF EXISTS battle_sessions_status_check;
ALTER TABLE public.battle_sessions
  ADD CONSTRAINT battle_sessions_status_check
  CHECK (status IN ('pending', 'running', 'sudden_death', 'ended', 'cancelled'));

ALTER TABLE public.battle_sessions DROP CONSTRAINT IF EXISTS battle_sessions_end_reason_check;
ALTER TABLE public.battle_sessions
  ADD CONSTRAINT battle_sessions_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('timeout', 'forfeit', 'sudden_death', 'cancelled'));

ALTER TABLE public.battle_sessions
  ADD COLUMN IF NOT EXISTS rematch_of_battle_id uuid REFERENCES public.battle_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turn_side text CHECK (turn_side IS NULL OR turn_side IN ('a', 'b')),
  ADD COLUMN IF NOT EXISTS turn_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_sale_text text,
  ADD COLUMN IF NOT EXISTS last_sale_at timestamptz,
  ADD COLUMN IF NOT EXISTS sudden_death_at timestamptz;

ALTER TABLE public.battle_invites
  ADD COLUMN IF NOT EXISTS rematch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rematch_of_battle_id uuid REFERENCES public.battle_sessions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public._battle_recompute_scores(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.battle_sessions;
  v_until timestamptz;
BEGIN
  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_until := coalesce(
    v_b.ended_at,
    CASE WHEN v_b.status = 'sudden_death' THEN now() ELSE coalesce(v_b.ends_at, now()) END
  );

  UPDATE public.battle_participants p SET
    score_amount_live = coalesce(agg.amount_live, 0),
    score_items = coalesce(agg.items, 0),
    score_amount_confirmed = coalesce(agg.amount_paid, 0)
  FROM (
    SELECT
      bp.seller_id,
      sum(public.convert_money(o.amount, o.currency, v_b.currency))
        FILTER (
          WHERE o.created_at >= coalesce(v_b.started_at, o.created_at)
            AND o.created_at <= v_until
            AND o.status NOT IN ('cancelled', 'expired')
        ) AS amount_live,
      count(*)
        FILTER (
          WHERE o.created_at >= coalesce(v_b.started_at, o.created_at)
            AND o.created_at <= v_until
            AND o.status NOT IN ('cancelled', 'expired')
        ) AS items,
      sum(public.convert_money(o.amount, o.currency, v_b.currency))
        FILTER (
          WHERE o.paid_at IS NOT NULL
            AND o.paid_at >= coalesce(v_b.started_at, o.paid_at)
            AND o.status NOT IN ('cancelled', 'expired', 'refunded')
            AND coalesce(o.refund_status, '') NOT IN ('refunded', 'partial')
        ) AS amount_paid
    FROM public.battle_participants bp
    LEFT JOIN public.orders o
      ON o.seller_id = bp.seller_id
     AND (
       o.battle_id = _battle_id
       OR o.live_id IN (SELECT live_id FROM public.battle_lives WHERE battle_id = _battle_id)
     )
    WHERE bp.battle_id = _battle_id
    GROUP BY bp.seller_id
  ) agg
  WHERE p.battle_id = _battle_id AND p.seller_id = agg.seller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_stamp_and_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_battle_id uuid;
BEGIN
  SELECT bl.battle_id INTO v_battle_id
    FROM public.battle_lives bl
    JOIN public.battle_sessions s ON s.id = bl.battle_id
   WHERE bl.seller_id = NEW.seller_id
     AND bl.active
     AND s.status IN ('running', 'sudden_death')
   LIMIT 1;

  IF v_battle_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.battle_id IS DISTINCT FROM v_battle_id THEN
    NEW.battle_id := v_battle_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_score_after_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.battle_sessions;
  v_buyer text;
  v_seller text;
  v_product text;
  v_side text;
BEGIN
  IF NEW.battle_id IS NULL AND NOT (TG_OP = 'UPDATE' AND OLD.battle_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.battle_id IS NOT NULL THEN
    PERFORM public._battle_recompute_scores(NEW.battle_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.battle_id IS NOT NULL THEN
    PERFORM public._battle_recompute_scores(OLD.battle_id);
    RETURN NEW;
  END IF;

  IF NEW.battle_id IS NULL OR NEW.status IN ('cancelled', 'expired') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_b FROM public.battle_sessions WHERE id = NEW.battle_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT coalesce(nullif(trim(p.display_name), ''), p.handle, 'Un acheteur')
    INTO v_buyer FROM public.profiles p WHERE p.id = NEW.buyer_id;
  SELECT coalesce(nullif(trim(p.display_name), ''), p.handle, 'une vendeuse')
    INTO v_seller FROM public.profiles p WHERE p.id = NEW.seller_id;
  SELECT name INTO v_product FROM public.live_products WHERE id = NEW.product_id;

  UPDATE public.battle_sessions SET
    last_sale_text = '🎉 ' || coalesce(v_buyer, 'Un acheteur')
      || ' vient d''acheter ' || coalesce(v_product, 'un article')
      || ' chez ' || coalesce(v_seller, 'une vendeuse')
      || ' pour ' || trim(to_char(NEW.amount, '999999999990'))
      || ' ' || coalesce(NEW.currency, v_b.currency) || ' !',
    last_sale_at = now()
  WHERE id = NEW.battle_id;

  IF v_b.status = 'sudden_death' THEN
    PERFORM public._battle_end_internal(NEW.battle_id, 'sudden_death', NULL);
    RETURN NEW;
  END IF;

  IF v_b.status = 'running' THEN
    SELECT side INTO v_side
      FROM public.battle_participants
     WHERE battle_id = NEW.battle_id AND seller_id = NEW.seller_id;
    IF v_side IS NOT NULL THEN
      UPDATE public.battle_sessions SET
        turn_side = CASE WHEN v_side = 'a' THEN 'b' ELSE 'a' END,
        turn_until = now() + interval '2 minutes'
      WHERE id = NEW.battle_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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

  IF _reason = 'forfeit' AND _forfeit_seller_id IS NOT NULL THEN
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
  UPDATE public.battle_participants SET active = false, left_at = coalesce(left_at, now())
    WHERE battle_id = _battle_id;

  RETURN jsonb_build_object('ok', true, 'battle_id', _battle_id, 'winner_seller_id', v_winner);
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_enter_sudden_death_internal(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.battle_sessions;
  v_a numeric;
  v_b_score numeric;
BEGIN
  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_b.status = 'sudden_death' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'battle_id', _battle_id);
  END IF;
  IF v_b.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_running');
  END IF;
  IF v_b.ends_at IS NOT NULL AND now() < v_b.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_early');
  END IF;

  PERFORM public._battle_recompute_scores(_battle_id);
  SELECT score_amount_live INTO v_a
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'a';
  SELECT score_amount_live INTO v_b_score
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'b';

  IF coalesce(v_a, 0) <> coalesce(v_b_score, 0) THEN
    RETURN public._battle_end_internal(_battle_id, 'timeout', NULL);
  END IF;

  UPDATE public.battle_sessions SET
    status = 'sudden_death',
    sudden_death = true,
    sudden_death_at = now()
  WHERE id = _battle_id;

  RETURN jsonb_build_object('ok', true, 'battle_id', _battle_id, 'sudden_death', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.battle_enter_sudden_death(_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.battle_participants
    WHERE battle_id = _battle_id AND seller_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;
  RETURN public._battle_enter_sudden_death_internal(_battle_id);
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
  v_active_auction boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id;
  IF NOT FOUND OR v_b.status NOT IN ('running', 'sudden_death') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_running');
  END IF;
  UPDATE public.battle_participants
     SET last_seen_at = now()
   WHERE battle_id = _battle_id AND seller_id = v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  SELECT * INTO v_other
    FROM public.battle_participants
   WHERE battle_id = _battle_id AND seller_id <> v_user
   LIMIT 1;
  IF FOUND AND v_other.last_seen_at < now() - interval '30 seconds'
     AND v_b.started_at < now() - interval '30 seconds' THEN
    RETURN public._battle_end_internal(_battle_id, 'forfeit', v_other.seller_id);
  END IF;

  IF v_b.status = 'running' AND v_b.ends_at IS NOT NULL AND now() >= v_b.ends_at THEN
    RETURN public._battle_enter_sudden_death_internal(_battle_id);
  END IF;

  IF v_b.status = 'sudden_death'
     AND v_b.sudden_death_at IS NOT NULL
     AND v_b.sudden_death_at < now() - interval '10 minutes' THEN
    RETURN public._battle_end_internal(_battle_id, 'timeout', NULL);
  END IF;

  IF v_b.status = 'running' AND v_b.turn_until IS NOT NULL AND now() >= v_b.turn_until THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.battle_lives bl
        JOIN public.live_products p ON p.live_id = bl.live_id
       WHERE bl.battle_id = _battle_id AND bl.active
         AND p.mode = 'auction' AND p.status = 'active'
    ) INTO v_active_auction;
    IF NOT v_active_auction THEN
      UPDATE public.battle_sessions SET
        turn_side = CASE WHEN coalesce(turn_side, 'a') = 'a' THEN 'b' ELSE 'a' END,
        turn_until = now() + interval '2 minutes'
      WHERE id = _battle_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
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
  IF _reason NOT IN ('timeout', 'forfeit', 'cancelled', 'sudden_death') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reason');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.battle_participants
    WHERE battle_id = _battle_id AND seller_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;
  IF _reason = 'forfeit' AND _forfeit_seller_id IS NULL THEN
    _forfeit_seller_id := v_user;
  END IF;
  RETURN public._battle_end_internal(_battle_id, _reason, _forfeit_seller_id);
END;
$$;

REVOKE ALL ON FUNCTION public.battle_invite(uuid, uuid, int) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.battle_invite(uuid, uuid, int);

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

CREATE OR REPLACE FUNCTION public.battle_finalize_confirmed(_battle_id uuid)
RETURNS jsonb
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
  IF v_b.status NOT IN ('ended', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_ended');
  END IF;
  IF v_b.ended_at IS NULL OR v_b.ended_at > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_early');
  END IF;

  PERFORM public._battle_recompute_scores(_battle_id);

  SELECT seller_id, score_amount_confirmed INTO v_a_id, v_a
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'a';
  SELECT seller_id, score_amount_confirmed INTO v_b_id, v_b_score
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'b';

  IF coalesce(v_a, 0) > coalesce(v_b_score, 0) THEN
    v_winner := v_a_id;
  ELSIF coalesce(v_b_score, 0) > coalesce(v_a, 0) THEN
    v_winner := v_b_id;
  ELSE
    v_winner := v_b.live_winner_seller_id;
  END IF;

  UPDATE public.battle_sessions SET winner_seller_id = v_winner WHERE id = _battle_id;
  RETURN jsonb_build_object('ok', true, 'battle_id', _battle_id, 'winner_seller_id', v_winner);
END;
$$;

GRANT EXECUTE ON FUNCTION public.battle_invite(uuid, uuid, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_accept(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_end(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_enter_sudden_death(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_finalize_confirmed(uuid) TO authenticated;
