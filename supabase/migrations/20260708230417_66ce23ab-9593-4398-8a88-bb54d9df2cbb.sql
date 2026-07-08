
-- 1. Drop duplicate _push_notification (keep 6-arg with _data JSONB DEFAULT NULL)
DROP FUNCTION IF EXISTS public._push_notification(uuid, text, text, text, uuid);

-- 2. Drop 3-arg place_live_bid (keep 4-arg with _amount NUMERIC DEFAULT NULL)
DROP FUNCTION IF EXISTS public.place_live_bid(uuid, uuid, text);

-- 3. Migrate existing zones JSON: attach country from seller profile when missing.
UPDATE public.seller_delivery_settings s
SET zones = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN (z ? 'country') AND NULLIF(z->>'country','') IS NOT NULL THEN z
        ELSE z || jsonb_build_object('country', COALESCE(p.country, 'CI'))
      END
    )
    FROM jsonb_array_elements(s.zones) AS z
  ),
  '[]'::jsonb
)
FROM public.profiles p
WHERE p.id = s.seller_id AND jsonb_typeof(s.zones) = 'array';
