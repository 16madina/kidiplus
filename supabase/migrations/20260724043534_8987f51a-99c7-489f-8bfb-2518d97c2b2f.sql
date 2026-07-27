ALTER TABLE public.live_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bid_increment numeric;

ALTER TABLE public.live_products
  DROP CONSTRAINT IF EXISTS live_products_condition_check;

ALTER TABLE public.live_products
  ADD CONSTRAINT live_products_condition_check
  CHECK (
    condition IS NULL
    OR condition IN ('new', 'like_new', 'good', 'used')
  );

COMMENT ON COLUMN public.live_products.brand IS 'Optional free-text brand for live items.';
COMMENT ON COLUMN public.live_products.condition IS 'Optional condition: new | like_new | good | used.';
COMMENT ON COLUMN public.live_products.colors IS 'JSON string array of available colors.';
COMMENT ON COLUMN public.live_products.sizes IS 'JSON string array of available sizes.';
COMMENT ON COLUMN public.live_products.extra_images IS 'JSON string array of extra image paths (cover stays in image_url).';
COMMENT ON COLUMN public.live_products.bid_increment IS 'Optional auction bid step override.';

CREATE OR REPLACE FUNCTION public.set_order_product_options(
  _order_id uuid,
  _color text DEFAULT NULL,
  _size text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_base text;
  v_parts text[] := ARRAY[]::text[];
  v_label text;
  v_snap jsonb;
  v_color text;
  v_size text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_order.buyer_id <> auth.uid() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN json_build_object('ok', false, 'error', 'not_pending');
  END IF;

  v_color := NULLIF(btrim(COALESCE(_color, '')), '');
  v_size := NULLIF(btrim(COALESCE(_size, '')), '');

  v_snap := COALESCE(v_order.address_snapshot, '{}'::jsonb);

  IF v_snap ? 'item_base_name' THEN
    v_base := v_snap->>'item_base_name';
  ELSE
    v_base := v_order.item_name;
  END IF;

  IF v_color IS NOT NULL THEN
    v_parts := array_append(v_parts, v_color);
  END IF;
  IF v_size IS NOT NULL THEN
    v_parts := array_append(v_parts, v_size);
  END IF;

  v_label := array_to_string(v_parts, ' · ');

  v_snap := v_snap || jsonb_build_object(
    'item_base_name', v_base,
    'product_options', jsonb_build_object(
      'color', v_color,
      'size', v_size
    )
  );

  UPDATE public.orders
  SET
    item_name = CASE
      WHEN v_label = '' THEN v_base
      ELSE v_base || ' (' || v_label || ')'
    END,
    address_snapshot = v_snap
  WHERE id = _order_id;

  RETURN json_build_object(
    'ok', true,
    'item_name', CASE
      WHEN v_label = '' THEN v_base
      ELSE v_base || ' (' || v_label || ')'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_product_options(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_product_options(uuid, text, text) TO authenticated;