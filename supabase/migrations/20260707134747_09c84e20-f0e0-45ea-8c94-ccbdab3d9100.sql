
REVOKE ALL ON FUNCTION public.credit_seller_earning(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_order_with_wallet(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earning(uuid) TO service_role;
