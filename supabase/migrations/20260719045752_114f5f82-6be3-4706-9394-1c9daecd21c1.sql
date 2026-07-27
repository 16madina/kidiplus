-- Track PayPal wire amount + currency + FX rate on payouts, for the case where
-- the seller's native currency (XOF) can't be sent directly by PayPal and we
-- send the fixed-peg EUR equivalent instead.
alter table public.payouts
  add column if not exists paypal_amount numeric,
  add column if not exists paypal_currency text,
  add column if not exists paypal_fx_rate numeric;