CREATE OR REPLACE FUNCTION public.platform_fee_rate()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 0.10::numeric $$;

GRANT EXECUTE ON FUNCTION public.platform_fee_rate() TO authenticated, service_role;

DO $do$
DECLARE r record; src text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_live_order','finalize_auction_winner','_settle_expired_auction_row')
  LOOP
    src := pg_get_functiondef(r.oid);
    IF position('* 0.05' in src) > 0 THEN
      src := replace(src, '* 0.05', '* public.platform_fee_rate()');
      EXECUTE src;
    END IF;
  END LOOP;
END
$do$;