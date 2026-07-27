-- Audit wave 5 (polish) — 2026-07-25:
-- 1) Persist scheduled-live options (description, duration, allow_bids,
--    allow_buy_now, notify_followers) that the UI previously dropped.
-- 2) resolve_buyer_delivery: legacy zones without a country no longer mean
--    "ships worldwide" — they only match buyers in the seller's own country.
-- 3) Notify the seller on every new sale (order INSERT), covering auction
--    finalize, buy-now, and the offline-host sweeper in one place.

-- ---------------------------------------------------------------------------
-- 1) Scheduled-live option columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS estimated_duration_min integer,
  ADD COLUMN IF NOT EXISTS allow_bids boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_buy_now boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_followers boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2) Zones without a country only cover the seller's own country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_buyer_delivery(
  _seller_id uuid,
  _buyer_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr public.addresses;
  v_delivery public.seller_delivery_settings;
  v_seller_country text;
  v_buyer_country text;
  v_delivery_fee numeric := 0;
  v_delivery_mode text := NULL;
  v_delivery_zone text := NULL;
  v_matched_zone jsonb;
  v_snapshot jsonb := NULL;
  v_has_country_zone boolean := false;
BEGIN
  SELECT * INTO v_addr
    FROM public.addresses
   WHERE user_id = _buyer_id AND is_default = true
   ORDER BY updated_at DESC
   LIMIT 1;
  IF v_addr.id IS NULL THEN
    SELECT * INTO v_addr
      FROM public.addresses
     WHERE user_id = _buyer_id
     ORDER BY updated_at DESC
     LIMIT 1;
  END IF;
  IF v_addr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_address');
  END IF;

  v_buyer_country := upper(trim(coalesce(v_addr.country, '')));
  IF v_buyer_country = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_address');
  END IF;

  SELECT country INTO v_seller_country FROM public.profiles WHERE id = _seller_id;
  v_seller_country := upper(trim(coalesce(v_seller_country, '')));

  SELECT * INTO v_delivery FROM public.seller_delivery_settings WHERE seller_id = _seller_id;

  IF v_delivery.seller_id IS NULL OR v_delivery.mode = 'flat' THEN
    v_delivery_mode := 'flat';
    v_delivery_fee := coalesce(v_delivery.flat_fee, 0);
  ELSIF v_delivery.mode = 'courier' THEN
    v_delivery_mode := 'courier';
    v_delivery_fee := 0;
    IF v_seller_country <> '' AND v_buyer_country <> v_seller_country THEN
      RETURN jsonb_build_object('ok', false, 'error', 'courier_country_mismatch');
    END IF;
  ELSIF v_delivery.mode = 'zones' THEN
    v_delivery_mode := 'zones';
    IF jsonb_array_length(coalesce(v_delivery.zones, '[]'::jsonb)) = 0 THEN
      v_delivery_fee := 0;
    ELSE
      -- A zone without a country is a legacy row created before countries
      -- existed: it only applies to buyers in the seller's own country
      -- (never worldwide). Zones with a country match that country exactly.
      SELECT EXISTS (
        SELECT 1
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE upper(coalesce(z->>'country', '')) = v_buyer_country
            OR (
              coalesce(z->>'country', '') = ''
              AND v_seller_country <> ''
              AND v_buyer_country = v_seller_country
            )
      ) INTO v_has_country_zone;
      IF NOT v_has_country_zone THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_country_coverage');
      END IF;
      -- Prefer exact commune/zone name match; else first matching zone.
      IF v_addr.zone_or_commune IS NOT NULL THEN
        SELECT z INTO v_matched_zone
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE lower(trim(z->>'name')) = lower(trim(v_addr.zone_or_commune))
           AND (
             upper(coalesce(z->>'country', '')) = v_buyer_country
             OR (
               coalesce(z->>'country', '') = ''
               AND v_seller_country <> ''
               AND v_buyer_country = v_seller_country
             )
           )
         LIMIT 1;
      END IF;
      IF v_matched_zone IS NULL THEN
        SELECT z INTO v_matched_zone
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE upper(coalesce(z->>'country', '')) = v_buyer_country
            OR (
              coalesce(z->>'country', '') = ''
              AND v_seller_country <> ''
              AND v_buyer_country = v_seller_country
            )
         LIMIT 1;
      END IF;
      IF v_matched_zone IS NOT NULL THEN
        v_delivery_fee := coalesce((v_matched_zone->>'fee')::numeric, 0);
        v_delivery_zone := v_matched_zone->>'name';
      END IF;
    END IF;
  END IF;

  v_snapshot := jsonb_build_object(
    'id', v_addr.id,
    'label', v_addr.label,
    'full_name', v_addr.full_name,
    'phone', v_addr.phone,
    'country', v_addr.country,
    'city', v_addr.city,
    'zone_or_commune', v_addr.zone_or_commune,
    'street_address', v_addr.street_address,
    'postal_code', v_addr.postal_code,
    'region', v_addr.region,
    'details', v_addr.details
  );

  RETURN jsonb_build_object(
    'ok', true,
    'address_id', v_addr.id,
    'address_snapshot', v_snapshot,
    'delivery_fee', v_delivery_fee,
    'delivery_mode', v_delivery_mode,
    'delivery_zone', v_delivery_zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_buyer_delivery(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_buyer_delivery(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Seller "new sale" notification on order creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_seller_new_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only real sales (auction win / buy now), never self-purchases.
  IF NEW.seller_id IS NULL OR NEW.seller_id = NEW.buyer_id THEN
    RETURN NEW;
  END IF;

  PERFORM public._push_notification(
    NEW.seller_id,
    'sale_new',
    'Nouvelle vente 🎉',
    coalesce(NULLIF(trim(NEW.item_name), ''), 'Un article')
      || ' — ' || trim(to_char(NEW.amount, 'FM999999990.##'))
      || ' ' || upper(coalesce(NEW.currency, '')),
    NEW.id,
    jsonb_build_object(
      'kind', 'order',
      'order_id', NEW.id,
      'live_id', NEW.live_id,
      'sale_kind', NEW.kind
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block order creation because the notification failed.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seller_new_sale ON public.orders;
CREATE TRIGGER trg_notify_seller_new_sale
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_seller_new_sale();
