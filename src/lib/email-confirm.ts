import type { Profile } from "@/lib/auth-context";

/** Grace period before sales / payouts are blocked without email confirmation. */
export const EMAIL_CONFIRM_GRACE_MS = 48 * 60 * 60 * 1000;

export function isEmailVerified(
  profile: Pick<Profile, "email_verified_at"> | null | undefined,
): boolean {
  return !!profile?.email_verified_at;
}

/** True when the 48h window has elapsed and email is still unverified. */
export function isEmailConfirmRestricted(
  profile: Pick<Profile, "email_verified_at" | "created_at"> | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.email_verified_at) return false;
  const created = new Date(profile.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() > created + EMAIL_CONFIRM_GRACE_MS;
}

/** Show the top “confirm email” CTA until verified. */
export function shouldShowEmailConfirmBanner(
  profile: Pick<Profile, "email_verified_at"> | null | undefined,
): boolean {
  return !!profile && !profile.email_verified_at;
}

export function hoursLeftInEmailGrace(
  profile: Pick<Profile, "created_at" | "email_verified_at"> | null | undefined,
): number | null {
  if (!profile || profile.email_verified_at) return null;
  const created = new Date(profile.created_at).getTime();
  if (!Number.isFinite(created)) return null;
  const left = created + EMAIL_CONFIRM_GRACE_MS - Date.now();
  if (left <= 0) return 0;
  return Math.ceil(left / (60 * 60 * 1000));
}
