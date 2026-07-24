ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.shop_products
  DROP CONSTRAINT IF EXISTS shop_products_condition_check;

ALTER TABLE public.shop_products
  ADD CONSTRAINT shop_products_condition_check
  CHECK (
    condition IS NULL
    OR condition IN ('new', 'like_new', 'good', 'used')
  );

COMMENT ON COLUMN public.shop_products.brand IS 'Optional free-text brand.';
COMMENT ON COLUMN public.shop_products.condition IS 'Optional condition: new | like_new | good | used.';
COMMENT ON COLUMN public.shop_products.colors IS 'JSON string array of available colors.';
COMMENT ON COLUMN public.shop_products.sizes IS 'JSON string array of available sizes.';