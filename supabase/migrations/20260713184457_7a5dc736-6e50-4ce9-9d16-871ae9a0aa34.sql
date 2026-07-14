-- Update _gen_claim_token to always prefix with KIDI-
CREATE OR REPLACE FUNCTION public._gen_claim_token()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O/0/I/1
  body text;
  tok text;
  i int;
BEGIN
  LOOP
    body := '';
    FOR i IN 1..8 LOOP
      body := body || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      IF i = 4 THEN body := body || '-'; END IF;
    END LOOP;
    tok := 'KIDI-' || body;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.promo_codes WHERE claim_token = tok);
  END LOOP;
  RETURN tok;
END;
$$;

-- Backfill unclaimed tokens that don't yet have the KIDI- prefix
UPDATE public.promo_codes
   SET claim_token = public._gen_claim_token()
 WHERE claimed_at IS NULL
   AND claim_token IS NOT NULL
   AND claim_token NOT LIKE 'KIDI-%';
