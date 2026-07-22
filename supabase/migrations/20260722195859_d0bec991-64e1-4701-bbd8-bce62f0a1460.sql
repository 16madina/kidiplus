-- Restrict profiles.email exposure. Existing policies (SELECT to anon/authenticated with USING true)
-- combined with column-level privileges will filter out the email column. Owners retrieve their
-- own email via the existing public.get_my_email() SECURITY DEFINER RPC.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, display_name, handle, avatar_url, bio, is_seller, country, created_at,
  language, currency, is_admin, terms_accepted_at, terms_version, age_confirmed_at,
  moderation_status, followers_count, following_count, rating_avg, rating_count,
  banner_url, is_verified, welcome_email_sent, is_referred, is_frozen,
  frozen_reason, frozen_at, frozen_by, risk_restricted, kyc_verified
) ON public.profiles TO anon, authenticated;

-- service_role keeps full access for admin server code
GRANT ALL ON public.profiles TO service_role;