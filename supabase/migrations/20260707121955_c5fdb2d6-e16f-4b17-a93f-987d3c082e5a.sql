
-- profiles.currency + country
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS country  text;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_currency_check
    CHECK (currency IN ('XOF','EUR','CAD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- lives.currency
ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

DO $$ BEGIN
  ALTER TABLE public.lives
    ADD CONSTRAINT lives_currency_check
    CHECK (currency IN ('XOF','EUR','CAD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Normalize existing rows
UPDATE public.wallets   SET currency = 'EUR' WHERE currency IS NULL OR currency = '' OR lower(currency) = 'eur';
UPDATE public.lives     SET currency = 'EUR' WHERE currency IS NULL OR currency = '' OR lower(currency) = 'eur';
UPDATE public.orders    SET currency = 'EUR' WHERE currency IS NULL OR currency = '' OR lower(currency) = 'eur';

-- Backfill wallet currency from profile
UPDATE public.wallets w
   SET currency = p.currency
  FROM public.profiles p
 WHERE w.user_id = p.id
   AND w.currency <> p.currency
   AND w.balance = 0;

-- Trigger: wallet currency can only change when balance = 0
CREATE OR REPLACE FUNCTION public.enforce_wallet_currency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency <> OLD.currency AND OLD.balance <> 0 THEN
    RAISE EXCEPTION 'Wallet currency can only change when balance is zero';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallets_currency_guard ON public.wallets;
CREATE TRIGGER trg_wallets_currency_guard
BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_currency_change();

-- Trigger: new live inherits seller currency; new wallet inherits profile currency
CREATE OR REPLACE FUNCTION public.set_live_currency_from_seller()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_cur text;
BEGIN
  IF NEW.currency IS NULL OR NEW.currency = 'EUR' THEN
    SELECT currency INTO v_cur FROM public.profiles WHERE id = NEW.seller_id;
    IF v_cur IS NOT NULL THEN NEW.currency := v_cur; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lives_currency_seller ON public.lives;
CREATE TRIGGER trg_lives_currency_seller
BEFORE INSERT ON public.lives
FOR EACH ROW EXECUTE FUNCTION public.set_live_currency_from_seller();

-- Trigger: new order inherits live currency
CREATE OR REPLACE FUNCTION public.set_order_currency_from_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_cur text;
BEGIN
  IF NEW.live_id IS NOT NULL THEN
    SELECT currency INTO v_cur FROM public.lives WHERE id = NEW.live_id;
    IF v_cur IS NOT NULL THEN NEW.currency := v_cur; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_currency_live ON public.orders;
CREATE TRIGGER trg_orders_currency_live
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_currency_from_live();

-- Extend handle_new_user so new wallets pick up profile currency
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
  IF v_currency NOT IN ('XOF','EUR','CAD') THEN v_currency := 'EUR'; END IF;

  INSERT INTO public.profiles (id, email, display_name, handle, currency)
  VALUES (NEW.id, NEW.email, display, candidate_handle, v_currency);

  INSERT INTO public.wallets (user_id, currency) VALUES (NEW.id, v_currency)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
