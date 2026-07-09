
ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: put existing image_url as the single entry
UPDATE public.shop_products
   SET images = jsonb_build_array(image_url)
 WHERE image_url IS NOT NULL
   AND (images IS NULL OR jsonb_array_length(images) = 0);
