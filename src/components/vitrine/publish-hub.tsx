import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import { OPEN_PUBLISH_EVENT } from "@/lib/publish";
import {
  resumeVitrinePlayback,
  suspendVitrinePlayback,
} from "@/lib/vitrine-playback";
import { PublishCameraScreen } from "@/components/vitrine/publish-camera-screen";

const GOLD = "#E8B93B";

/**
 * Global seller Publish hub: listens for `kidi:open-publish`,
 * opens a TikTok-style camera (Story / Photo / Vidéo).
 * Live scheduling stays on the Live tab — not here.
 */
export function PublishHub() {
  const { t } = useTranslation();
  const { profile, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      if (guestMode) {
        openAuth();
        return;
      }
      if (!profile?.is_seller) {
        toast.error(
          t("publish.sellersOnly", {
            defaultValue: "Réservé aux vendeurs. Active ton espace vendeur pour publier.",
          }),
        );
        window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "live" }));
        return;
      }
      haptic.light();
      // Publish overlays Vitrine — stop feed audio immediately.
      suspendVitrinePlayback("publish");
      setOpen(true);
    };
    window.addEventListener(OPEN_PUBLISH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUBLISH_EVENT, onOpen);
  }, [guestMode, profile?.is_seller, openAuth, t]);

  useEffect(() => {
    if (open) suspendVitrinePlayback("publish");
    else resumeVitrinePlayback("publish");
  }, [open]);

  const closePublish = () => {
    setOpen(false);
    resumeVitrinePlayback("publish");
  };

  return (
    <PublishCameraScreen
      open={open}
      onClose={closePublish}
      onDone={() => {
        closePublish();
        window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "vitrine" }));
        window.dispatchEvent(new CustomEvent("kidi:vitrine-refresh"));
      }}
      initialMode="photo"
    />
  );
}

/** Gold outlined "+ Publier" CTA matching the Live hub mockup. */
export function PublishCtaButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Press
      onClick={() => {
        haptic.medium();
        window.dispatchEvent(new CustomEvent(OPEN_PUBLISH_EVENT));
      }}
      className={`!min-h-12 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold ${className ?? ""}`}
      style={{
        color: GOLD,
        border: `1.5px solid ${GOLD}`,
        background: "rgba(232,185,59,0.08)",
      }}
    >
      + {t("publish.cta", { defaultValue: "Publier" })}
    </Press>
  );
}
