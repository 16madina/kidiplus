// Shared "referred" badge — a small gold "+" glyph shown next to the
// display name of members who joined KiDi+ with a promo code. Kept subtle
// and distinct from the VerifiedBadge (which is a check inside a seal).
import { useTranslation } from "react-i18next";

export type ReferredBadgeProps = {
  referred: boolean | null | undefined;
  size?: number;
  className?: string;
};

const GOLD = "#D4A62A";

export function ReferredBadge({ referred, size = 12, className }: ReferredBadgeProps) {
  const { t } = useTranslation();
  if (!referred) return null;
  const title = t("referral.badgeTitle", "Membre parrainé KiDi+");
  return (
    <span
      className={"inline-flex shrink-0 items-center align-middle " + (className ?? "")}
      title={title}
      aria-label={title}
      style={{ lineHeight: 0 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <circle cx="12" cy="12" r="11" fill={GOLD} />
        <path
          d="M12 6.5v11 M6.5 12h11"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
