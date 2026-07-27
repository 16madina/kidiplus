-- Multi-currency wave (2026-07-25):
-- 1) Allow USD and GBP everywhere: profiles/lives CHECK constraints,
--    handle_new_user whitelist, fx_rate reference rates.
-- 2) convert_my_wallet_currency(): explicit, user-triggered conversion of a
--    NON-ZERO wallet balance (and seller balance) into the profile currency,
--    with a full audit trail in wallet_transactions. The wallet currency
--    guard trigger learns a session flag so ONLY this function may convert.

-- ---------------------------------------------------------------------------
-- 0) Currency whitelists → + USD, GBP
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_currency_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_currency_check
  CHECK (currency IN ('XOF','EUR','CAD','USD','GBP'));

ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_currency_check;
ALTER TABLE public.lives
  ADD CONSTRAINT lives_currency_check
  CHECK (currency IN ('XOF','EUR','CAD','USD','GBP'));

-- handle_new_user: accept USD/GBP from signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_handle TEXT;
  candidate_handle TEXT;
  counter INT := 0;
  display TEXT;
  v_currency TEXT;
BEGIN
  base_handle := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := 'user' || substr(NEW.id::text, 1, 6);
  END IF;
  base_handle := substr(base_handle, 1, 24);

  candidate_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate_handle) LOOP
    counter := counter + 1;
    candidate_handle := base_handle || counter::text;
  END LOOP;

  display := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
                      split_part(NEW.email, '@', 1));
  v_currency := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'currency', ''), 'EUR');
  IF v_currency NOT IN ('XOF','EUR','CAD','USD','GBP') THEN v_currency := 'EUR'; END IF;

  INSERT INTO public.profiles (id, email, display_name, handle, currency)
  VALUES (NEW.id, NEW.email, display, candidate_handle, v_currency);

  INSERT INTO public.wallets (user_id, currency) VALUES (NEW.id, v_currency)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0bis) Wallet currency guard: still blocks direct client updates, but lets
--       convert_my_wallet_currency() through via a transaction-local flag.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_wallet_currency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency <> OLD.currency AND OLD.balance <> 0 THEN
    IF coalesce(current_setting('kidi.allow_wallet_conversion', true), '') <> '1' THEN
      RAISE EXCEPTION 'Wallet currency can only change when balance is zero';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) fx_rate with USD + GBP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fx_rate(_from text, _to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  f text := upper(coalesce(_from, ''));
  t text := upper(coalesce(_to, ''));
  eur_to_xof numeric := 655.957;    -- BCEAO peg
  eur_to_cad numeric := 1.47;
  eur_to_usd numeric := 1.09;
  eur_to_gbp numeric := 0.85;
  margin numeric := 0.015;          -- 1.5% safety margin on non-peg pairs
  from_eur numeric;
  to_eur numeric;
  rate numeric;
  is_peg boolean;
BEGIN
  IF f = t THEN RETURN 1; END IF;

  -- Amount of `from` in 1 EUR.
  IF f = 'EUR' THEN from_eur := 1;
  ELSIF f = 'XOF' THEN from_eur := eur_to_xof;
  ELSIF f = 'CAD' THEN from_eur := eur_to_cad;
  ELSIF f = 'USD' THEN from_eur := eur_to_usd;
  ELSIF f = 'GBP' THEN from_eur := eur_to_gbp;
  ELSE RETURN NULL; END IF;

  IF t = 'EUR' THEN to_eur := 1;
  ELSIF t = 'XOF' THEN to_eur := eur_to_xof;
  ELSIF t = 'CAD' THEN to_eur := eur_to_cad;
  ELSIF t = 'USD' THEN to_eur := eur_to_usd;
  ELSIF t = 'GBP' THEN to_eur := eur_to_gbp;
  ELSE RETURN NULL; END IF;

  rate := to_eur / from_eur;

  -- Peg pairs (XOF <-> EUR) skip the margin; every other pair gets it.
  is_peg := (f = 'EUR' AND t = 'XOF') OR (f = 'XOF' AND t = 'EUR');
  IF NOT is_peg THEN
    rate := rate * (1 - margin);
  END IF;

  RETURN rate;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Explicit wallet conversion into the profile currency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_my_wallet_currency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target text;
  v_wallet public.wallets;
  v_from text;
  v_old_balance numeric;
  v_new_balance numeric;
  v_rate numeric;
  v_seller public.seller_balances;
  v_seller_new numeric := NULL;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT upper(coalesce(currency, '')) INTO v_target
    FROM public.profiles WHERE id = v_user;
  IF v_target IS NULL OR v_target = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_profile_currency');
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet.user_id IS NULL THEN
    INSERT INTO public.wallets (user_id, currency)
    VALUES (v_user, v_target)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'converted', false, 'currency', v_target);
  END IF;

  v_from := upper(coalesce(v_wallet.currency, 'EUR'));
  IF v_from = v_target THEN
    RETURN jsonb_build_object('ok', true, 'converted', false, 'currency', v_target);
  END IF;

  v_old_balance := coalesce(v_wallet.balance, 0);

  IF v_old_balance = 0 THEN
    UPDATE public.wallets
       SET currency = v_target, updated_at = now()
     WHERE user_id = v_user;
    v_new_balance := 0;
  ELSE
    v_rate := public.fx_rate(v_from, v_target);
    IF v_rate IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    END IF;
    v_new_balance := public.convert_money(v_old_balance, v_from, v_target);

    -- Transaction-local flag lets the guard trigger accept this conversion.
    PERFORM set_config('kidi.allow_wallet_conversion', '1', true);
    UPDATE public.wallets
       SET balance = v_new_balance, currency = v_target, updated_at = now()
     WHERE user_id = v_user;
    PERFORM set_config('kidi.allow_wallet_conversion', '', true);

    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, status, meta)
    VALUES
      (v_user, 'adjustment', 0, v_new_balance, 'completed',
       jsonb_build_object(
         'kind', 'currency_conversion',
         'from_currency', v_from,
         'from_balance', v_old_balance,
         'to_currency', v_target,
         'to_balance', v_new_balance,
         'rate', v_rate
       ));
  END IF;

  -- Seller earnings follow the same conversion (audited via meta on wallet tx).
  SELECT * INTO v_seller
    FROM public.seller_balances WHERE seller_id = v_user FOR UPDATE;
  IF v_seller.seller_id IS NOT NULL
     AND upper(coalesce(v_seller.currency, '')) <> v_target THEN
    IF coalesce(v_seller.available, 0) = 0 THEN
      UPDATE public.seller_balances
         SET currency = v_target, updated_at = now()
       WHERE seller_id = v_user;
      v_seller_new := 0;
    ELSE
      v_seller_new := public.convert_money(
        v_seller.available, upper(coalesce(v_seller.currency, 'EUR')), v_target);
      IF v_seller_new IS NOT NULL THEN
        UPDATE public.seller_balances
           SET available = v_seller_new, currency = v_target, updated_at = now()
         WHERE seller_id = v_user;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'converted', v_old_balance <> 0,
    'currency', v_target,
    'from_currency', v_from,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'seller_available', v_seller_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_my_wallet_currency() FROM public;
GRANT EXECUTE ON FUNCTION public.convert_my_wallet_currency() TO authenticated;
