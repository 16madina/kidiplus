import { useTranslation } from "react-i18next";
import { Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { useFollow } from "@/lib/follows-db";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";

export function FollowButton({
  sellerId,
  size = "md",
  variant = "solid",
  tone = "default",
}: {
  sellerId: string | null;
  size?: "sm" | "md";
  variant?: "solid" | "outline";
  /** `live` = glass chip over video (viewer top bar). */
  tone?: "default" | "live";
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openAuth } = useAuthPrompt();
  const { following, toggle, isSelf, ready } = useFollow(sellerId);

  if (isSelf || !sellerId) return null;

  const onClick = async () => {
    if (!user) {
      openAuth();
      return;
    }
    haptic.medium();
    try { await toggle(); } catch { toast.error(t("common.error", { defaultValue: "Erreur" })); }
  };

  const isSm = size === "sm";
  const h = isSm ? 28 : 40;
  const px = isSm ? 10 : 16;
  const fs = isSm ? 11 : 13;
  const iconSize = isSm ? 12 : 14;

  // Over video: once following, icon-only so the seller name stays readable.
  if (tone === "live" && following) {
    return (
      <Press
        onClick={onClick}
        hapticOnTap={false}
        disabled={!ready}
        aria-label={t("follow.following", { defaultValue: "Abonné" })}
        className="!min-h-0 grid shrink-0 place-items-center rounded-full"
        style={{
          height: h,
          width: h,
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.35)",
          opacity: ready ? 1 : 0.6,
        }}
      >
        <Check size={iconSize} />
      </Press>
    );
  }

  const liveStyle = tone === "live"
    ? {
        height: h,
        paddingLeft: px,
        paddingRight: px,
        fontSize: fs,
        background: "var(--accent)",
        color: "var(--accent-foreground)",
        border: "none" as const,
        opacity: ready ? 1 : 0.6,
        display: "inline-flex" as const,
        alignItems: "center" as const,
        gap: 4,
        minHeight: 0,
      }
    : {
        height: h,
        paddingLeft: px,
        paddingRight: px,
        fontSize: fs,
        background: following
          ? "transparent"
          : variant === "outline"
          ? "transparent"
          : "var(--accent)",
        color: following ? "var(--foreground)" : variant === "outline" ? "var(--foreground)" : "var(--accent-foreground)",
        border: following || variant === "outline" ? "1.5px solid var(--border)" : "none",
        opacity: ready ? 1 : 0.6,
        display: "inline-flex" as const,
        alignItems: "center" as const,
        gap: 6,
        minHeight: 0,
      };

  return (
    <Press
      onClick={onClick}
      hapticOnTap={false}
      disabled={!ready}
      className="shrink-0 rounded-full font-bold"
      style={liveStyle}
    >
      {following ? <Check size={iconSize} /> : <UserPlus size={iconSize} />}
      <span>{following ? t("follow.following", { defaultValue: "Abonné" }) : t("follow.follow", { defaultValue: "Suivre" })}</span>
    </Press>
  );
}
