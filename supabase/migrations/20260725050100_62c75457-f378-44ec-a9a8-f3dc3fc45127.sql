-- Multi-currency: add USD and GBP alongside XOF, EUR, CAD.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_currency_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_currency_check
  CHECK (currency = ANY (ARRAY['XOF','EUR','CAD','USD','GBP']));

ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_currency_check;
ALTER TABLE public.lives
  ADD CONSTRAINT lives_currency_check
  CHECK (currency = ANY (ARRAY['XOF','EUR','CAD','USD','GBP']));

CREATE OR REPLACE FUNCTION public.fx_rate(_from text, _to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  f text := upper(coalesce(_from, ''));
  t text := upper(coalesce(_to, ''));
  eur_to_xof numeric := 655.957;
  eur_to_cad numeric := 1.47;
  eur_to_usd numeric := 1.09;
  eur_to_gbp numeric := 0.85;
  margin numeric := 0.015;
  from_eur numeric;
  to_eur numeric;
  rate numeric;
  is_peg boolean;
BEGIN
  IF f = t THEN RETURN 1; END IF;

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

  is_peg := (f = 'EUR' AND t = 'XOF') OR (f = 'XOF' AND t = 'EUR');
  IF NOT is_peg THEN
    rate := rate * (1 - margin);
  END IF;

  RETURN rate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta          JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  meta_name     TEXT;
  meta_avatar   TEXT;
  base_handle   TEXT;
  candidate_handle TEXT;
  counter       INT := 0;
  display       TEXT;
  v_currency    TEXT;
BEGIN
  meta_name := COALESCE(
    NULLIF(meta ->> 'display_name', ''),
    NULLIF(meta ->> 'full_name', ''),
    NULLIF(meta ->> 'name', ''),
    NULLIF(TRIM(CONCAT_WS(' ', meta ->> 'given_name', meta ->> 'family_name')), '')
  );
  meta_avatar := COALESCE(
    NULLIF(meta ->> 'avatar_url', ''),
    NULLIF(meta ->> 'picture', '')
  );

  base_handle := lower(regexp_replace(COALESCE(split_part(NEW.email, '@', 1), ''), '[^a-z0-9_]', '', 'g'));
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := lower(regexp_replace(COALESCE(meta_name, ''), '[^a-z0-9_]', '', 'g'));
  END IF;
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := 'user' || substr(NEW.id::text, 1, 6);
  END IF;
  base_handle := substr(base_handle, 1, 24);

  candidate_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate_handle) LOOP
    counter := counter + 1;
    candidate_handle := base_handle || counter::text;
  END LOOP;

  display := COALESCE(meta_name, split_part(NEW.email, '@', 1), 'Utilisateur');

  v_currency := COALESCE(NULLIF(meta ->> 'currency', ''), 'EUR');
  IF v_currency NOT IN ('XOF','EUR','CAD','USD','GBP') THEN v_currency := 'EUR'; END IF;

  INSERT INTO public.profiles (id, email, display_name, handle, avatar_url, currency)
  VALUES (NEW.id, NEW.email, display, candidate_handle, meta_avatar, v_currency);

  INSERT INTO public.wallets (user_id, currency) VALUES (NEW.id, v_currency)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_wallet_currency_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  allow_flag text;
BEGIN
  IF NEW.currency <> OLD.currency AND OLD.balance <> 0 THEN
    allow_flag := current_setting('app.allow_wallet_currency_change', true);
    IF allow_flag IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Wallet currency can only change when balance is zero';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_my_wallet_currency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  target_currency text;
  w_currency text;
  w_balance numeric;
  rate_w numeric;
  new_w_balance numeric;
  sb_currency text;
  sb_available numeric;
  sb_pending numeric;
  rate_s numeric;
  new_available numeric;
  new_pending numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT currency INTO target_currency FROM public.profiles WHERE id = uid;
  IF target_currency IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF target_currency NOT IN ('XOF','EUR','CAD','USD','GBP') THEN
    RAISE EXCEPTION 'Unsupported target currency: %', target_currency;
  END IF;

  PERFORM set_config('app.allow_wallet_currency_change', 'on', true);

  SELECT currency, balance INTO w_currency, w_balance
    FROM public.wallets WHERE user_id = uid FOR UPDATE;

  IF w_currency IS NOT NULL AND upper(w_currency) <> target_currency THEN
    rate_w := public.fx_rate(upper(w_currency), target_currency);
    IF rate_w IS NULL THEN
      RAISE EXCEPTION 'No FX rate from % to %', w_currency, target_currency;
    END IF;
    new_w_balance := CASE WHEN target_currency = 'XOF'
      THEN round(w_balance * rate_w)
      ELSE round(w_balance * rate_w, 2)
    END;

    UPDATE public.wallets
      SET currency = target_currency,
          balance  = new_w_balance,
          updated_at = now()
    WHERE user_id = uid;

    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, status, meta)
    VALUES (
      uid, 'adjustment', new_w_balance - w_balance, new_w_balance, 'completed',
      jsonb_build_object(
        'reason', 'currency_conversion',
        'from_currency', upper(w_currency),
        'to_currency', target_currency,
        'from_balance', w_balance,
        'to_balance', new_w_balance,
        'rate', rate_w
      )
    );
  END IF;

  SELECT currency, available, pending INTO sb_currency, sb_available, sb_pending
    FROM public.seller_balances WHERE seller_id = uid FOR UPDATE;

  IF sb_currency IS NOT NULL AND upper(sb_currency) <> target_currency THEN
    rate_s := public.fx_rate(upper(sb_currency), target_currency);
    IF rate_s IS NULL THEN
      RAISE EXCEPTION 'No FX rate from % to % (seller)', sb_currency, target_currency;
    END IF;
    new_available := CASE WHEN target_currency = 'XOF'
      THEN round(sb_available * rate_s) ELSE round(sb_available * rate_s, 2) END;
    new_pending   := CASE WHEN target_currency = 'XOF'
      THEN round(sb_pending   * rate_s) ELSE round(sb_pending   * rate_s, 2) END;

    UPDATE public.seller_balances
      SET currency  = target_currency,
          available = new_available,
          pending   = new_pending,
          updated_at = now()
    WHERE seller_id = uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'currency', target_currency,
    'wallet_balance', COALESCE(new_w_balance, w_balance),
    'seller_available', COALESCE(new_available, sb_available),
    'seller_pending', COALESCE(new_pending, sb_pending)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_my_wallet_currency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_my_wallet_currency() TO authenticated;
