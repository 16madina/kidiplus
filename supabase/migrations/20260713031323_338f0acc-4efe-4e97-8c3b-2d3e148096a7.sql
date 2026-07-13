ALTER TABLE public.referral_balances REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_balances;