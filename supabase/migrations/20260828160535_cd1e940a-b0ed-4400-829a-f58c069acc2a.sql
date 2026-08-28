DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'send_gift';
  IF d IS NULL THEN RAISE EXCEPTION 'send_gift not found'; END IF;
  IF position('v_fee_pct numeric := 30' in d) = 0 THEN
    RAISE EXCEPTION 'gift fee literal not found';
  END IF;
  d := replace(d, 'v_fee_pct numeric := 30', 'v_fee_pct numeric := 20');
  EXECUTE d;
END $$;