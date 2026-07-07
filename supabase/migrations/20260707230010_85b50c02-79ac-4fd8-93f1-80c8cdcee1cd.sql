REVOKE EXECUTE ON FUNCTION public.place_live_bid(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_live_bid(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_live_bid(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_live_bid(uuid, uuid, text) TO service_role;