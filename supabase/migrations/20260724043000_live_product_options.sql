-- Phase 1: optional live product attributes (brand, condition, colors, sizes,
-- description, bid increment, extra photos) + buyer RPC to attach size/color
-- on a pending order before payment.

ALTER TABLE public.live_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bid_increment numeric;

-- Buyer: set chosen size/color on a pending order before payment.
-- Updates the order item_name to include the option label and snapshots the address.
CREATE OR REPLACE FUNCTION public.set_order_product_options(
  _order_id uuid,
  _size text,
  _color text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_label text;
  v_snap jsonb;
BEGIN
  SELECT item_name, address_snapshot
  INTO v_base, v_snap
  FROM public.orders
  WHERE id = _order_id;

  IF v_base IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  v_label := '';
  IF _size IS NOT NULL AND _size <> '' THEN
    v_label := _size;
  END IF;
  IF _color IS NOT NULL AND _color <> '' THEN
    IF v_label <> '' THEN
      v_label := v_label || ' / ' || _color;
    ELSE
      v_label := _color;
    END IF;
  END IF;

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
