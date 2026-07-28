-- Allow PayPal as an order payment_method (checkout, not only wallet top-up).
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('card', 'wave', 'orange_money', 'wallet', 'paypal'));
