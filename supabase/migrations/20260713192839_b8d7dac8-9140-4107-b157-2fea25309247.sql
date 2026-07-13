CREATE OR REPLACE FUNCTION public.admin_create_promo_code(
  _code text, _owner_id uuid DEFAULT NULL::uuid, _reward_quota integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid; v_norm text := upper(btrim(coalesce(_code,''))); v_token text; v_hex text;
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

  v_hex := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  v_token := 'KIDI-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4);

  INSERT INTO public.promo_codes (code, owner_id, reward_quota, claim_token, claimed_at, created_by)
  VALUES (v_norm, _owner_id, _reward_quota, v_token,
          CASE WHEN _owner_id IS NULL THEN NULL ELSE now() END, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_norm, 'claim_token', v_token);
END;
$function$;