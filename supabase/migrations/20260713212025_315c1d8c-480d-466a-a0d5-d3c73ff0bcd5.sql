
-- Enforce claim_token format KIDI-XXXX-XXXX (uppercase hex-like chars A-Z0-9)
CREATE OR REPLACE FUNCTION public.validate_promo_claim_token_format()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.claim_token IS NOT NULL THEN
    NEW.claim_token := upper(NEW.claim_token);
    IF NEW.claim_token !~ '^KIDI-[A-Z0-9]{4}-[A-Z0-9]{4}$' THEN
      RAISE EXCEPTION 'invalid_claim_token_format: expected KIDI-XXXX-XXXX, got %', NEW.claim_token
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_promo_claim_token_format ON public.promo_codes;
CREATE TRIGGER trg_validate_promo_claim_token_format
BEFORE INSERT OR UPDATE OF claim_token ON public.promo_codes
FOR EACH ROW
EXECUTE FUNCTION public.validate_promo_claim_token_format();
