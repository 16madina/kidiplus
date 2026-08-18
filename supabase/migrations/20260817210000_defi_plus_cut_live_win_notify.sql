-- Défi Plus: cutting a live always awards the remaining seller.
-- If they already sold → automatic win (same popup as a scored win).
-- If they have not sold → win by forfeit.
-- Notify both sellers on every end (invite/accept already notify; end did not).

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
  v_a_items int;
  v_b_items int;
  v_a_id uuid;
  v_b_id uuid;
  v_a_name text;
  v_b_name text;
  v_winner_name text;
  v_loser_id uuid;
  v_loser_name text;
  v_remain_sold boolean := false;
  v_remain_live uuid;
  v_payload jsonb;
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

  SELECT seller_id, score_amount_live, score_items, display_name
    INTO v_a_id, v_a, v_a_items, v_a_name
    FROM public.battle_participants WHERE battle_id = _battle_id AND side = 'a';
  SELECT seller_id, score_amount_live, score_items, display_name
    INTO v_b_id, v_b_score, v_b_items, v_b_name
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

  IF v_winner = v_a_id THEN
    v_remain_sold := coalesce(v_a, 0) > 0 OR coalesce(v_a_items, 0) > 0;
  ELSIF v_winner = v_b_id THEN
    v_remain_sold := coalesce(v_b_score, 0) > 0 OR coalesce(v_b_items, 0) > 0;
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

  SELECT live_id INTO v_remain_live
    FROM public.battle_lives
   WHERE battle_id = _battle_id AND seller_id = v_winner
   LIMIT 1;

  v_a_name := coalesce(nullif(trim(v_a_name), ''), 'L''autre vendeuse');
  v_b_name := coalesce(nullif(trim(v_b_name), ''), 'L''autre vendeuse');
  v_winner_name := CASE WHEN v_winner = v_a_id THEN v_a_name WHEN v_winner = v_b_id THEN v_b_name ELSE NULL END;
  v_loser_id := CASE WHEN v_winner = v_a_id THEN v_b_id WHEN v_winner = v_b_id THEN v_a_id ELSE NULL END;
  v_loser_name := CASE WHEN v_loser_id = v_a_id THEN v_a_name WHEN v_loser_id = v_b_id THEN v_b_name ELSE NULL END;

  v_payload := jsonb_build_object(
    'kind', 'battle_ended',
    'battle_id', _battle_id,
    'end_reason', _reason,
    'winner_seller_id', v_winner,
    'live_id', v_remain_live
  );

  IF _reason = 'cancelled' THEN
    IF v_a_id IS NOT NULL THEN
      PERFORM public._battle_notify(v_a_id, 'Défi Plus', 'Le Défi Plus a été annulé.', v_payload);
    END IF;
    IF v_b_id IS NOT NULL AND v_b_id IS DISTINCT FROM v_a_id THEN
      PERFORM public._battle_notify(v_b_id, 'Défi Plus', 'Le Défi Plus a été annulé.', v_payload);
    END IF;
  ELSIF v_winner IS NULL THEN
    IF v_a_id IS NOT NULL THEN
      PERFORM public._battle_notify(v_a_id, 'Défi Plus', 'Égalité au Défi Plus.', v_payload);
    END IF;
    IF v_b_id IS NOT NULL AND v_b_id IS DISTINCT FROM v_a_id THEN
      PERFORM public._battle_notify(v_b_id, 'Défi Plus', 'Égalité au Défi Plus.', v_payload);
    END IF;
  ELSIF _forfeit_seller_id IS NOT NULL AND v_remain_sold THEN
    PERFORM public._battle_notify(
      v_winner,
      'Défi Plus',
      'Victoire ! L''autre live a été coupé. Tu gagnes grâce à tes ventes.',
      v_payload
    );
    IF v_loser_id IS NOT NULL THEN
      PERFORM public._battle_notify(
        v_loser_id,
        'Défi Plus',
        'Le Défi Plus est terminé. Tu as perdu — ton live a été coupé.',
        v_payload
      );
    END IF;
  ELSIF _forfeit_seller_id IS NOT NULL THEN
    PERFORM public._battle_notify(
      v_winner,
      'Défi Plus',
      coalesce(v_loser_name, 'L''autre vendeuse') || ' a déclaré forfait. Tu gagnes le Défi Plus.',
      v_payload
    );
    IF v_loser_id IS NOT NULL THEN
      PERFORM public._battle_notify(
        v_loser_id,
        'Défi Plus',
        'Tu as perdu le Défi Plus par forfait.',
        v_payload
      );
    END IF;
  ELSE
    PERFORM public._battle_notify(
      v_winner,
      'Défi Plus',
      'Tu as gagné le Défi Plus !',
      v_payload
    );
    IF v_loser_id IS NOT NULL THEN
      PERFORM public._battle_notify(
        v_loser_id,
        'Défi Plus',
        coalesce(v_winner_name, 'L''autre vendeuse') || ' a gagné le Défi Plus.',
        v_payload
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'battle_id', _battle_id, 'winner_seller_id', v_winner);
END;
$$;
