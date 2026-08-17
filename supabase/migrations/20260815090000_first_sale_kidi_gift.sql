-- KiDi+ launch reward
-- 1) The seller's first paid sale has a 0% platform fee (normally 10%).
-- 2) A durable realtime row drives the one-time celebration in the app.
-- 3) The same branded animation is available as a paid live gift.

CREATE TABLE IF NOT EXISTS public.seller_milestone_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_key text NOT NULL CHECK (reward_key IN ('first_sale_fee_waiver')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, reward_key)
);

CREATE INDEX IF NOT EXISTS seller_milestone_rewards_unseen_idx
  ON public.seller_milestone_rewards (seller_id, created_at)
  WHERE seen_at IS NULL;

ALTER TABLE public.seller_milestone_rewards ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_milestone_rewards TO authenticated;
GRANT UPDATE (seen_at) ON public.seller_milestone_rewards TO authenticated;
GRANT ALL ON public.seller_milestone_rewards TO service_role;

CREATE POLICY "seller reads own milestone rewards"
  ON public.seller_milestone_rewards
  FOR SELECT TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "seller acknowledges own milestone rewards"
  ON public.seller_milestone_rewards
  FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_milestone_rewards;

-- Existing sellers have already consumed their first-sale milestone. Mark it
-- as seen so only users with no prior sale receive the new fee waiver.
INSERT INTO public.seller_milestone_rewards
  (seller_id, reward_key, order_id, amount, currency, metadata, seen_at, created_at)
SELECT DISTINCT ON (se.seller_id)
  se.seller_id,
  'first_sale_fee_waiver',
  se.order_id,
  0,
  upper(coalesce(o.currency, 'EUR')),
  jsonb_build_object('legacy_backfill', true),
  now(),
  se.created_at
FROM public.seller_earnings se
JOIN public.orders o ON o.id = se.order_id
WHERE se.source = 'sale' AND se.order_id IS NOT NULL
ORDER BY se.seller_id, se.created_at, se.id
ON CONFLICT (seller_id, reward_key) DO NOTHING;

-- Server-authoritative price for the new sendable KD+ gift. The amount can be
-- changed later here and in src/lib/gifts.ts without altering wallet logic.
CREATE OR REPLACE FUNCTION public._gift_price(_key text, _currency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(_currency)
    WHEN 'XOF' THEN
      CASE _key
        WHEN 'rose'    THEN 100
        WHEN 'heart'   THEN 250
        WHEN 'diamond' THEN 500
        WHEN 'crown'   THEN 1000
        WHEN 'rocket'  THEN 2500
        WHEN 'lion'    THEN 5000
        WHEN 'kidi'    THEN 5000
        ELSE NULL END
    WHEN 'CAD' THEN
      CASE _key
        WHEN 'rose'    THEN 1
        WHEN 'heart'   THEN 1.5
        WHEN 'diamond' THEN 3
        WHEN 'crown'   THEN 6
        WHEN 'rocket'  THEN 12
        WHEN 'lion'    THEN 22
        WHEN 'kidi'    THEN 15
        ELSE NULL END
    ELSE
      CASE _key
        WHEN 'rose'    THEN 0.5
        WHEN 'heart'   THEN 1
        WHEN 'diamond' THEN 2
        WHEN 'crown'   THEN 4
        WHEN 'rocket'  THEN 8
        WHEN 'lion'    THEN 15
        WHEN 'kidi'    THEN 10
        ELSE NULL END
  END;
$$;

CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_bal public.seller_balances;
  v_new_pending numeric;
  v_earning_id uuid;
  v_currency text;
  v_bal_currency text;
  v_standard_fee numeric;
  v_fee numeric;
  v_net numeric;
  v_net_credited numeric;
  v_zero boolean;
  v_reward_id uuid;
  v_first_sale_reward boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  IF EXISTS (SELECT 1 FROM public.seller_earnings WHERE order_id = _order_id) THEN
    PERFORM public.credit_referral_for_order(_order_id);
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- Serialise first-sale decisions per seller. This prevents two simultaneous
  -- paid orders from both receiving the one-time commission waiver.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_order.seller_id::text, 0));

  v_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_zero := (v_currency = 'XOF');
  v_standard_fee := CASE WHEN v_zero
    THEN round(coalesce(v_order.amount, 0) * public.platform_fee_rate())
    ELSE round(coalesce(v_order.amount, 0) * public.platform_fee_rate(), 2) END;

  INSERT INTO public.seller_milestone_rewards
    (seller_id, reward_key, order_id, amount, currency)
  VALUES
    (v_order.seller_id, 'first_sale_fee_waiver', _order_id, v_standard_fee, v_currency)
  ON CONFLICT (seller_id, reward_key) DO NOTHING
  RETURNING id INTO v_reward_id;

  v_first_sale_reward := v_reward_id IS NOT NULL;
  v_fee := CASE WHEN v_first_sale_reward THEN 0 ELSE v_standard_fee END;
  v_net := coalesce(v_order.amount, 0) - v_fee + coalesce(v_order.delivery_fee, 0);
  v_net := CASE WHEN v_zero THEN round(v_net) ELSE round(v_net, 2) END;

  IF coalesce(v_order.platform_fee, 0) <> v_fee OR coalesce(v_order.seller_net, 0) <> v_net THEN
    UPDATE public.orders
       SET platform_fee = v_fee, seller_net = v_net
     WHERE id = _order_id;
  END IF;

  v_bal := public._ensure_seller_balance(v_order.seller_id, v_currency);
  v_bal_currency := upper(coalesce(v_bal.currency, v_currency));

  IF v_bal_currency = v_currency THEN
    v_net_credited := v_net;
  ELSE
    v_net_credited := public.convert_money(v_net, v_currency, v_bal_currency);
    IF v_net_credited IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    END IF;
  END IF;

  v_new_pending := v_bal.pending + v_net_credited;
  UPDATE public.seller_balances
     SET pending = v_new_pending, updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings
    (seller_id, order_id, amount, balance_after, status, source)
  VALUES
    (v_order.seller_id, _order_id, v_net_credited, v_new_pending, 'pending', 'sale')
  RETURNING id INTO v_earning_id;

  BEGIN
    PERFORM public._log_order_event(_order_id, 'paid', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM public.credit_referral_for_order(_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'credit_referral_for_order failed for %: %', _order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'earning_id', v_earning_id,
    'seller_net', v_net,
    'credited_amount', v_net_credited,
    'credited_currency', v_bal_currency,
    'first_sale_reward', v_first_sale_reward,
    'reward_id', v_reward_id,
    'fee_waived', CASE WHEN v_first_sale_reward THEN v_standard_fee ELSE 0 END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.credit_seller_earning(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earning(uuid) TO service_role;
