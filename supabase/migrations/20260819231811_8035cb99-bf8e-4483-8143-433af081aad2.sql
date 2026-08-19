ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
ADD COLUMN IF NOT EXISTS email_confirm_code_hash text,
ADD COLUMN IF NOT EXISTS email_confirm_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS email_confirm_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.email_verified_at IS
'When the user confirmed ownership of their email via KiDi+ OTP. NULL = not yet.';
COMMENT ON COLUMN public.profiles.phone IS
'Phone collected at signup (E.164-ish free text). Not SMS-verified yet.';

UPDATE public.profiles
SET email_verified_at = coalesce(created_at, now())
WHERE email_verified_at IS NULL;