REVOKE SELECT (stripe_connect_id, connect_status, connect_charges_enabled, connect_payouts_enabled, frozen_reason, frozen_by, risk_restricted, kyc_verified) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_profile_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'frozen_reason', p.frozen_reason,
    'frozen_by', p.frozen_by,
    'risk_restricted', p.risk_restricted,
    'kyc_verified', p.kyc_verified,
    'connect_status', p.connect_status,
    'connect_charges_enabled', p.connect_charges_enabled,
    'connect_payouts_enabled', p.connect_payouts_enabled
  )
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_profile_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_flags() TO authenticated;