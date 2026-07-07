
-- ============================================================
-- Profiles: consent + age columns
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS age_confirmed_at  timestamptz;

-- ============================================================
-- Reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('live','message','user')),
  target_id    text NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('inappropriate','fraud','counterfeit','harassment','other')),
  note         text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON public.reports (target_type, target_id);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_select_own_or_admin" ON public.reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.is_admin(auth.uid()));
CREATE POLICY "reports_update_admin" ON public.reports
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON public.blocks (blocker_id);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_manage_own" ON public.blocks
  FOR ALL TO authenticated USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- ============================================================
-- RPCs
-- ============================================================

-- Submit a report
CREATE OR REPLACE FUNCTION public.submit_report(
  _target_type text,
  _target_id   text,
  _reason      text,
  _note        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, note)
  VALUES (v_user, _target_type, _target_id, _reason, NULLIF(trim(coalesce(_note,'')), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN check_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_report(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report(text,text,text,text) TO authenticated;

-- Block a user
CREATE OR REPLACE FUNCTION public.block_user(_blocked_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF v_user = _blocked_id THEN RETURN jsonb_build_object('ok', false, 'error', 'cannot_block_self'); END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_user, _blocked_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

-- Unblock a user
CREATE OR REPLACE FUNCTION public.unblock_user(_blocked_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  DELETE FROM public.blocks WHERE blocker_id = v_user AND blocked_id = _blocked_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- List my blocks with target profile info
CREATE OR REPLACE FUNCTION public.list_my_blocks()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('rows', '[]'::jsonb); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT b.blocked_id, b.created_at, p.handle, p.display_name, p.avatar_url
    FROM public.blocks b
    JOIN public.profiles p ON p.id = b.blocked_id
    WHERE b.blocker_id = v_user
    ORDER BY b.created_at DESC
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_blocks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_blocks() TO authenticated;

-- Account deletion pre-check
CREATE OR REPLACE FUNCTION public.account_deletion_check()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet_balance numeric := 0;
  v_pending_payouts numeric := 0;
  v_pending_orders int := 0;
  v_live_now int := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  SELECT COALESCE(balance, 0) INTO v_wallet_balance FROM public.wallets WHERE user_id = v_user;
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_payouts FROM public.payouts
    WHERE seller_id = v_user AND status IN ('requested','processing');
  SELECT COUNT(*) INTO v_pending_orders FROM public.orders
    WHERE (buyer_id = v_user OR seller_id = v_user) AND status = 'pending';
  SELECT COUNT(*) INTO v_live_now FROM public.lives WHERE seller_id = v_user AND status = 'live';
  RETURN jsonb_build_object(
    'ok', true,
    'wallet_balance', v_wallet_balance,
    'pending_payouts', v_pending_payouts,
    'pending_orders', v_pending_orders,
    'live_now', v_live_now,
    'has_blockers', (v_wallet_balance > 0 OR v_pending_payouts > 0 OR v_pending_orders > 0 OR v_live_now > 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.account_deletion_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_check() TO authenticated;

-- Perform account deletion (anonymize + delete auth user via cascade from profiles trigger)
-- Since auth.users FK from profiles is ON DELETE CASCADE (profiles -> auth.users id),
-- we must delete auth.users first to cascade profiles + related. We can't directly delete
-- from auth.users in SQL RPC easily without service role, so we anonymize profile fields
-- and let a server route call auth.admin.deleteUser afterwards. This RPC prepares the state.
CREATE OR REPLACE FUNCTION public.anonymize_my_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  -- End any active lives
  UPDATE public.lives SET status='ended', ended_at = now()
    WHERE seller_id = v_user AND status='live';
  -- Anonymize profile (kept for order/payout audit trail)
  UPDATE public.profiles SET
    display_name = 'Compte supprimé',
    handle       = 'deleted_' || substr(replace(v_user::text,'-',''),1,10),
    email        = 'deleted+' || v_user || '@kidiplus.invalid',
    avatar_url   = NULL,
    bio          = NULL,
    country      = NULL,
    is_seller    = false
  WHERE id = v_user;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.anonymize_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_my_account() TO authenticated;
