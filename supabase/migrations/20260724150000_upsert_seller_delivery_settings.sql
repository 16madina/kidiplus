-- Reliable owner write for delivery settings.
-- Client-side upsert + .select() was flaky under RLS (success UI / empty re-read).

CREATE OR REPLACE FUNCTION public.upsert_seller_delivery_settings(
  _mode text,
  _flat_fee numeric,
  _zones jsonb
)
RETURNS public.seller_delivery_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.seller_delivery_settings;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('zones', 'flat', 'courier') THEN
    RAISE EXCEPTION 'invalid delivery mode';
  END IF;

  INSERT INTO public.seller_delivery_settings AS s (
    seller_id, mode, flat_fee, zones, updated_at
  )
  VALUES (
    uid,
    _mode,
    GREATEST(COALESCE(_flat_fee, 0), 0),
    COALESCE(_zones, '[]'::jsonb),
    now()
  )
  ON CONFLICT (seller_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    flat_fee = EXCLUDED.flat_fee,
    zones = EXCLUDED.zones,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_seller_delivery_settings(text, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_seller_delivery_settings(text, numeric, jsonb) TO authenticated;
