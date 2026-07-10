
-- 1) app_config: remove public read; only admins can read
DROP POLICY IF EXISTS "app_config public read" ON public.app_config;
CREATE POLICY "app_config admin read" ON public.app_config
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2) profiles: restrict email + moderation_status column access to owner/admin
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_public_fields" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
-- Column-level restriction for email
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;
GRANT SELECT (email) ON public.profiles TO service_role;
-- Owner can read their own email via a helper function
CREATE OR REPLACE FUNCTION public.get_my_email()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- 3) live_moderators: restrict select
DROP POLICY IF EXISTS "live_moderators_select_authenticated" ON public.live_moderators;
CREATE POLICY "live_moderators_select_scoped" ON public.live_moderators
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_moderators.live_id AND l.seller_id = auth.uid()
    )
  );

-- 4) seller_delivery_settings: owner/admin direct read; RPC for checkout
DROP POLICY IF EXISTS "delivery_read_all_authenticated" ON public.seller_delivery_settings;
CREATE POLICY "delivery_read_owner_or_admin" ON public.seller_delivery_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_seller_delivery_settings(_seller_id uuid)
  RETURNS SETOF public.seller_delivery_settings
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT * FROM public.seller_delivery_settings WHERE seller_id = _seller_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_seller_delivery_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_delivery_settings(uuid) TO authenticated;

-- 5) live_bids / live_gifts: scope to lives that have started
DROP POLICY IF EXISTS "live_bids_select_authenticated" ON public.live_bids;
CREATE POLICY "live_bids_select_active" ON public.live_bids
  FOR SELECT TO authenticated
  USING (
    bidder_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_bids.live_id
        AND (l.seller_id = auth.uid() OR l.status IN ('live','ended'))
    )
  );

DROP POLICY IF EXISTS "auth can read live gifts" ON public.live_gifts;
CREATE POLICY "live_gifts_select_active" ON public.live_gifts
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR seller_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_gifts.live_id AND l.status IN ('live','ended')
    )
  );

-- 6) _gift_price: pin search_path
CREATE OR REPLACE FUNCTION public._gift_price(_key text, _currency text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT CASE upper(_currency)
    WHEN 'XOF' THEN
      CASE _key
        WHEN 'rose'    THEN 100
        WHEN 'heart'   THEN 250
        WHEN 'diamond' THEN 500
        WHEN 'crown'   THEN 1000
        WHEN 'rocket'  THEN 2500
        WHEN 'lion'    THEN 5000
        ELSE NULL END
    WHEN 'CAD' THEN
      CASE _key
        WHEN 'rose'    THEN 1
        WHEN 'heart'   THEN 1.5
        WHEN 'diamond' THEN 3
        WHEN 'crown'   THEN 6
        WHEN 'rocket'  THEN 12
        WHEN 'lion'    THEN 22
        ELSE NULL END
    ELSE
      CASE _key
        WHEN 'rose'    THEN 0.5
        WHEN 'heart'   THEN 1
        WHEN 'diamond' THEN 2
        WHEN 'crown'   THEN 4
        WHEN 'rocket'  THEN 8
        WHEN 'lion'    THEN 15
        ELSE NULL END
  END;
$function$;

-- 7) Lock down EXECUTE on SECURITY DEFINER internals and admin funcs from anon.
--    Trigger functions and internal helpers get revoked from authenticated too.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    -- Internal helpers (leading underscore) and trigger-only funcs: revoke from authenticated as well
    IF r.proname LIKE '\_%' ESCAPE '\'
       OR r.proname IN (
         'handle_new_user','touch_updated_at','device_tokens_touch_updated_at',
         'enforce_wallet_currency_change','enforce_single_default_address',
         'set_order_currency_from_live','set_live_currency_from_seller',
         'sync_currency_on_profile_change','credit_seller_earning','credit_wallet_topup',
         'expire_overdue_orders','release_overdue_escrow','notify_live_reminders'
       ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

-- is_admin is used inside RLS policies (via SECURITY DEFINER) — those run
-- with the policy owner's rights, but keep it callable by authenticated too
-- since some code may call it directly. Re-grant explicitly.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_live_moderator(uuid, uuid) TO authenticated;
