// Shared verified badge — small gold/blue check displayed next to the
// display name across the app (seller profile header, live viewer chip,
// search results, chat messages, feed cards, winner reveals).
import { BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export type VerifiedBadgeProps = {
  verified: boolean | null | undefined;
  size?: number;
  className?: string;
};

export function VerifiedBadge({ verified, size = 14, className }: VerifiedBadgeProps) {
  const { t } = useTranslation();
  if (!verified) return null;
  return (
    <span
      className={"inline-flex items-center align-middle text-[oklch(0.68_0.16_75)] " + (className ?? "")}
      title={t("verify.badgeTitle", "Compte certifié")}
      aria-label={t("verify.badgeTitle", "Compte certifié")}
    >
      <BadgeCheck size={size} strokeWidth={2.2} fill="currentColor" className="text-[oklch(0.98_0.02_240)]" style={{ color: "oklch(0.98 0.02 240)" }} />
    </span>
  );
}
