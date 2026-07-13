
-- 1) One promo code per owner (partial unique on active codes with an owner)
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_one_active_per_owner_idx
  ON public.promo_codes(owner_id)
  WHERE owner_id IS NOT NULL AND active = true;

-- 2) Guard admin_create_promo_code: reject if owner already has an active code
CREATE OR REPLACE FUNCTION public.admin_create_promo_code(
  _code text, _owner_id uuid DEFAULT NULL::uuid, _reward_quota integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_norm text := upper(btrim(coalesce(_code,''))); v_token text;
BEGIN
  PERFORM public._assert_admin();
  IF v_norm !~ '^[A-Z0-9_-]{4,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;
  IF _owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_norm) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_exists');
  END IF;
  IF _owner_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.promo_codes WHERE owner_id = _owner_id AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_already_has_code');
  END IF;

  v_token := upper(regexp_replace(encode(gen_random_bytes(6), 'hex'), '(.{4})(.{4})(.{4})', '\1-\2-\3'));
  INSERT INTO public.promo_codes (code, owner_id, reward_quota, claim_token, claimed_at, created_by)
  VALUES (v_norm, _owner_id, _reward_quota, v_token,
          CASE WHEN _owner_id IS NULL THEN NULL ELSE now() END, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_norm, 'claim_token', v_token);
END;
$function$;

-- 3) Guard admin_assign_promo_code: same rule when re-assigning
CREATE OR REPLACE FUNCTION public.admin_assign_promo_code(_id uuid, _owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pc public.promo_codes;
BEGIN
  PERFORM public._assert_admin();
  IF _owner_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'owner_required'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_not_found');
  END IF;
  SELECT * INTO v_pc FROM public.promo_codes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.promo_codes
     WHERE owner_id = _owner_id AND active = true AND id <> _id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_already_has_code');
  END IF;

  IF v_pc.owner_id IS NULL THEN
    PERFORM public._claim_and_backfill(v_pc.id, _owner_id);
  ELSE
    UPDATE public.promo_codes SET owner_id = _owner_id, updated_at = now() WHERE id = _id;
    UPDATE public.referrals SET owner_id = _owner_id, updated_at = now() WHERE promo_code_id = _id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 4) admin_delete_promo_code
--    - If no referrals exist → hard delete (frees the code for reuse).
--    - If referrals exist   → soft delete: deactivate, detach owner, rename
--      to __DEL_<ts>_<code> so the original code string is freed for reuse
--      and cannot be applied by anyone (validate_promo_code requires active).
CREATE OR REPLACE FUNCTION public.admin_delete_promo_code(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pc         public.promo_codes;
  v_has_refs   boolean;
  v_new_code   text;
BEGIN
  PERFORM public._assert_admin();

  SELECT * INTO v_pc FROM public.promo_codes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.referrals WHERE promo_code_id = _id) INTO v_has_refs;

  IF NOT v_has_refs THEN
    DELETE FROM public.promo_codes WHERE id = _id;
    RETURN jsonb_build_object('ok', true, 'mode', 'hard_deleted', 'code', v_pc.code);
  END IF;

  -- Soft delete: rename to release the code string, deactivate, detach owner
  v_new_code := left('__DEL_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || v_pc.code, 20);
  UPDATE public.promo_codes
     SET active      = false,
         owner_id    = NULL,
         claim_token = NULL,
         code        = v_new_code,
         updated_at  = now()
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'mode', 'soft_deleted', 'code', v_pc.code, 'new_code', v_new_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_promo_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_promo_code(uuid) TO authenticated;
