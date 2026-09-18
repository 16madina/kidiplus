ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS paydunya_token text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS paydunya_error text;