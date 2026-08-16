-- Add the new Blender-backed KiDi+ live gifts to server-authoritative pricing.
-- Keep these values in sync with src/lib/gifts.ts.
CREATE OR REPLACE FUNCTION public._gift_price(_key text, _currency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(_currency)
    WHEN 'XOF' THEN
      CASE _key
        WHEN 'rose'      THEN 100
        WHEN 'heart'     THEN 250
        WHEN 'butterfly' THEN 500
        WHEN 'star'      THEN 1000
        WHEN 'diamond'   THEN 500
        WHEN 'crown'     THEN 1000
        WHEN 'rocket'    THEN 2500
        WHEN 'lion'      THEN 5000
        WHEN 'kidi'      THEN 5000
        ELSE NULL END
    WHEN 'CAD' THEN
      CASE _key
        WHEN 'rose'      THEN 1
        WHEN 'heart'     THEN 1.5
        WHEN 'butterfly' THEN 3
        WHEN 'star'      THEN 6
        WHEN 'diamond'   THEN 3
        WHEN 'crown'     THEN 6
        WHEN 'rocket'    THEN 12
        WHEN 'lion'      THEN 22
        WHEN 'kidi'      THEN 15
        ELSE NULL END
    ELSE
      CASE _key
        WHEN 'rose'      THEN 0.5
        WHEN 'heart'     THEN 1
        WHEN 'butterfly' THEN 2
        WHEN 'star'      THEN 4
        WHEN 'diamond'   THEN 2
        WHEN 'crown'     THEN 4
        WHEN 'rocket'    THEN 8
        WHEN 'lion'      THEN 15
        WHEN 'kidi'      THEN 10
        ELSE NULL END
  END;
$$;
