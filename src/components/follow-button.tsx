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
}: {
  sellerId: string | null;
  size?: "sm" | "md";
  variant?: "solid" | "outline";
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
  const h = isSm ? 32 : 40;
  const px = isSm ? 12 : 16;
  const fs = isSm ? 12 : 13;
  const iconSize = isSm ? 12 : 14;

  return (
    <Press
      onClick={onClick}
      hapticOnTap={false}
      disabled={!ready}
      className="rounded-full font-bold"
      style={{
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
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 0,
      }}
    >
      {following ? <Check size={iconSize} /> : <UserPlus size={iconSize} />}
      <span>{following ? t("follow.following", { defaultValue: "Abonné" }) : t("follow.follow", { defaultValue: "Suivre" })}</span>
    </Press>
  );
}
