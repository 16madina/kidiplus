// Shared verified badge — small check displayed next to the display name
// across the app (seller profile header, live viewer chip, search results,
// chat messages, feed cards, winner reveals). One component so the badge
// stays consistent everywhere.
import { useTranslation } from "react-i18next";

export type VerifiedBadgeProps = {
  verified: boolean | null | undefined;
  size?: number;
  className?: string;
  /** "gold" for premium look, "blue" for a Twitter/X style. Default: gold. */
  tone?: "gold" | "blue";
};

export function VerifiedBadge({ verified, size = 14, className, tone = "gold" }: VerifiedBadgeProps) {
  const { t } = useTranslation();
  if (!verified) return null;
  const fill = tone === "gold" ? "oklch(0.78 0.16 80)" : "oklch(0.62 0.19 245)";
  return (
    <span
      className={"inline-flex shrink-0 items-center align-middle " + (className ?? "")}
      title={t("verify.badgeTitle", "Compte certifié")}
      aria-label={t("verify.badgeTitle", "Compte certifié")}
      style={{ lineHeight: 0 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          fill={fill}
          d="M12 1.5l2.4 1.9 3 -.4 1.2 2.8 2.7 1.4 -.5 3 1.7 2.5 -2 2.3 .1 3 -2.9 1 -1.5 2.6 -3 -.3L12 22.5l-2.4-1.7-3 .3-1.5-2.6-2.9-1 .1-3-2-2.3 1.7-2.5-.5-3 2.7-1.4L5.4 3l3 .4z"
        />
        <path
          d="M8 12.2l2.7 2.7L16.4 9"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
