-- KiDi+ Battle — two-room seller duel (scores linked, audiences stay put).
-- Writes go through SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.battle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'ended', 'cancelled')),
  duration_sec int NOT NULL CHECK (duration_sec IN (90, 600, 900, 1200, 1800)),
  started_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  currency text NOT NULL DEFAULT 'XOF',
  live_winner_seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  end_reason text CHECK (end_reason IS NULL OR end_reason IN ('timeout', 'forfeit', 'cancelled')),
  sudden_death boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.battle_lives (
  battle_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('a', 'b')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (battle_id, live_id)
);

CREATE UNIQUE INDEX battle_lives_one_side ON public.battle_lives (battle_id, side);
CREATE UNIQUE INDEX battle_lives_one_active_per_live
  ON public.battle_lives (live_id) WHERE active;

CREATE TABLE public.battle_participants (
  battle_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text,
  side text NOT NULL CHECK (side IN ('a', 'b')),
  score_amount_live numeric NOT NULL DEFAULT 0,
  score_amount_confirmed numeric NOT NULL DEFAULT 0,
  score_items int NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, seller_id)
);

CREATE UNIQUE INDEX battle_participants_one_active
  ON public.battle_participants (seller_id) WHERE active;

CREATE TABLE public.battle_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  from_seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_live_id uuid REFERENCES public.lives(id) ON DELETE SET NULL,
  duration_sec int NOT NULL DEFAULT 900 CHECK (duration_sec IN (90, 600, 900, 1200, 1800)),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz NOT NULL,
  battle_id uuid REFERENCES public.battle_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX battle_invites_one_pending_target
  ON public.battle_invites (to_seller_id) WHERE status = 'pending';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS battle_id uuid REFERENCES public.battle_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_battle_id_idx ON public.orders (battle_id)
  WHERE battle_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers / grants / RLS / realtime
-- ---------------------------------------------------------------------------

CREATE TRIGGER battle_sessions_touch_updated_at
  BEFORE UPDATE ON public.battle_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER battle_participants_touch_updated_at
  BEFORE UPDATE ON public.battle_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER battle_invites_touch_updated_at
  BEFORE UPDATE ON public.battle_invites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.battle_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.battle_lives REPLICA IDENTITY FULL;
ALTER TABLE public.battle_participants REPLICA IDENTITY FULL;
ALTER TABLE public.battle_invites REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_lives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_invites;

ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY battle_sessions_select ON public.battle_sessions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY battle_lives_select ON public.battle_lives
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY battle_participants_select ON public.battle_participants
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY battle_invites_select ON public.battle_invites
  FOR SELECT TO authenticated
  USING (auth.uid() IN (from_seller_id, to_seller_id));

GRANT SELECT ON public.battle_sessions, public.battle_lives, public.battle_participants
  TO anon, authenticated;
GRANT SELECT ON public.battle_invites TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.battle_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.battle_lives FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.battle_participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.battle_invites FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._battle_live_has_restream(_live public.lives)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(_live.youtube_broadcast_id, _live.facebook_egress_id, _live.tiktok_egress_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._battle_notify(
  _user_id uuid,
  _title text,
  _body text,
  _data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_user_id, 'battle', _title, _body, coalesce(_data, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._battle_recompute_scores(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.battle_sessions;
BEGIN
  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id;
  IF NOT FOUND THEN RETURN; END IF;

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
            AND o.created_at <= coalesce(v_b.ended_at, v_b.ends_at, now())
            AND o.status NOT IN ('cancelled', 'expired')
        ) AS amount_live,
      count(*)
        FILTER (
          WHERE o.created_at >= coalesce(v_b.started_at, o.created_at)
            AND o.created_at <= coalesce(v_b.ended_at, v_b.ends_at, now())
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
     AND s.status = 'running'
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
BEGIN
  IF NEW.battle_id IS NOT NULL THEN
    PERFORM public._battle_recompute_scores(NEW.battle_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.battle_id IS NOT NULL THEN
    PERFORM public._battle_recompute_scores(OLD.battle_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_battle_stamp
  BEFORE INSERT OR UPDATE OF status, paid_at, refund_status, seller_id
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._battle_stamp_and_score();

CREATE TRIGGER orders_battle_score
  AFTER INSERT OR UPDATE OF status, paid_at, refund_status, battle_id
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._battle_score_after_order();

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

  IF _reason = 'timeout' AND v_b.ends_at IS NOT NULL AND now() < v_b.ends_at THEN
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

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

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
    'KiDi+ Battle',
    coalesce(nullif(trim(v_from_p.display_name), ''), 'Une vendeuse') || ' te lance un duel !',
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
    'KiDi+ Battle',
    coalesce(nullif(trim(v_to_p.display_name), ''), 'L''autre vendeuse') || ' a accepté le duel.',
    jsonb_build_object('kind', 'battle_accepted', 'battle_id', v_bid)
  );

  RETURN jsonb_build_object('ok', true, 'battle_id', v_bid);
END;
$$;

CREATE OR REPLACE FUNCTION public.battle_decline(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv public.battle_invites;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_inv FROM public.battle_invites WHERE id = _invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.to_seller_id <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  UPDATE public.battle_invites SET status = 'declined' WHERE id = _invite_id;
  RETURN jsonb_build_object('ok', true);
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

  SELECT * INTO v_b FROM public.battle_sessions WHERE id = _battle_id;
  IF NOT FOUND OR v_b.status <> 'running' THEN
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

  IF v_b.ends_at IS NOT NULL AND now() >= v_b.ends_at THEN
    RETURN public._battle_end_internal(_battle_id, 'timeout', NULL);
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

  IF _reason NOT IN ('timeout', 'forfeit', 'cancelled') THEN
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
       WHERE bl.live_id = NEW.id AND s.status = 'running'
    LOOP
      PERFORM public._battle_end_internal(r.battle_id, 'cancelled', NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lives_end_open_battles
  AFTER UPDATE OF status ON public.lives
  FOR EACH ROW EXECUTE FUNCTION public._battle_on_live_ended();

CREATE OR REPLACE FUNCTION public.battle_opponent_has_active_auction(_live_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.battle_lives me
      JOIN public.battle_lives other
        ON other.battle_id = me.battle_id AND other.live_id <> me.live_id AND other.active
      JOIN public.battle_sessions s ON s.id = me.battle_id AND s.status = 'running'
      JOIN public.live_products p ON p.live_id = other.live_id
     WHERE me.live_id = _live_id
       AND me.active
       AND p.mode = 'auction'
       AND p.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.battle_invite(uuid, uuid, int) FROM public;
REVOKE ALL ON FUNCTION public.battle_accept(uuid, int) FROM public;
REVOKE ALL ON FUNCTION public.battle_decline(uuid) FROM public;
REVOKE ALL ON FUNCTION public.battle_heartbeat(uuid) FROM public;
REVOKE ALL ON FUNCTION public.battle_end(uuid, text, uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.battle_invite(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_accept(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_decline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_end(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.battle_opponent_has_active_auction(uuid) TO authenticated, anon;