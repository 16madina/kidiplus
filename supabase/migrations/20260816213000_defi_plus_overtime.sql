-- Sudden death is overtime: both keep selling; winner is who leads when the clock ends.
-- Do not end on the first sale.

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

  RETURN NEW;
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
     AND v_b.sudden_death_at <= now() - interval '60 seconds' THEN
    RETURN public._battle_end_internal(_battle_id, 'sudden_death', NULL);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
