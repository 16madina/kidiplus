ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS paypal_batch_id text,
  ADD COLUMN IF NOT EXISTS paypal_error text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_paypal_batch_id
  ON public.payouts (paypal_batch_id)
  WHERE paypal_batch_id IS NOT NULL;