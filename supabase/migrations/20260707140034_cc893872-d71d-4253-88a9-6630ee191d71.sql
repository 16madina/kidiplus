
CREATE OR REPLACE FUNCTION public.sync_currency_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    UPDATE public.wallets
       SET currency = NEW.currency, updated_at = now()
     WHERE user_id = NEW.id AND balance = 0 AND currency <> NEW.currency;

    UPDATE public.seller_balances
       SET currency = NEW.currency, updated_at = now()
     WHERE seller_id = NEW.id AND available = 0 AND currency <> NEW.currency;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_currency_on_profile_change ON public.profiles;
CREATE TRIGGER trg_sync_currency_on_profile_change
AFTER UPDATE OF currency ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_currency_on_profile_change();

CREATE OR REPLACE FUNCTION public.sync_my_wallet_currency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT currency INTO v_target FROM public.profiles WHERE id = v_user;
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  UPDATE public.wallets
     SET currency = v_target, updated_at = now()
   WHERE user_id = v_user AND balance = 0 AND currency <> v_target;

  UPDATE public.seller_balances
     SET currency = v_target, updated_at = now()
   WHERE seller_id = v_user AND available = 0 AND currency <> v_target;

  RETURN jsonb_build_object('ok', true, 'currency', v_target);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_wallet_currency() TO authenticated;
