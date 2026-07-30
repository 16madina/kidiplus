import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronRight,
  CircleDot,
  Images,
  Image as ImageIcon,
  Radio,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import { OPEN_PUBLISH_EVENT, type PublishKind } from "@/lib/publish";
import { CreateVitrineContentSheet } from "@/components/vitrine/create-vitrine-content-sheet";
import { AnnounceLiveSheet } from "@/components/vitrine/announce-live-sheet";

const GOLD = "#E8B93B";

/**
 * Global seller Publish hub: listens for `kidi:open-publish`,
 * shows the 5-type chooser, then the matching create flow.
 */
export function PublishHub() {
  const { t } = useTranslation();
  const { profile, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [kind, setKind] = useState<PublishKind | null>(null);

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
      setKind(null);
      setChooserOpen(true);
    };
    window.addEventListener(OPEN_PUBLISH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUBLISH_EVENT, onOpen);
  }, [guestMode, profile?.is_seller, openAuth, t]);

  const closeAll = () => {
    setChooserOpen(false);
    setKind(null);
  };

  const pick = (k: PublishKind) => {
    haptic.selection();
    setChooserOpen(false);
    setKind(k);
  };

  const options: {
    key: PublishKind;
    icon: ReactNode;
    tint: string;
    title: string;
    sub: string;
  }[] = [
    {
      key: "story",
      icon: <CircleDot size={18} />,
      tint: "oklch(0.55 0.2 300)",
      title: t("publish.types.story", { defaultValue: "Story (24h)" }),
      sub: t("publish.types.storySub", { defaultValue: "Visible pendant 24 heures" }),
    },
    {
      key: "video",
      icon: <Video size={18} />,
      tint: "oklch(0.55 0.18 250)",
      title: t("publish.types.video", { defaultValue: "Vidéo" }),
      sub: t("publish.types.videoSub", { defaultValue: "Partage une vidéo dans la vitrine" }),
    },
    {
      key: "photo",
      icon: <ImageIcon size={18} />,
      tint: "oklch(0.55 0.16 155)",
      title: t("publish.types.photo", { defaultValue: "Photo" }),
      sub: t("publish.types.photoSub", { defaultValue: "Partage une photo" }),
    },
    {
      key: "carousel",
      icon: <Images size={18} />,
      tint: "oklch(0.55 0.14 290)",
      title: t("publish.types.carousel", { defaultValue: "Carrousel photos" }),
      sub: t("publish.types.carouselSub", { defaultValue: "Plusieurs photos" }),
    },
    {
      key: "announce",
      icon: <Radio size={18} />,
      tint: "oklch(0.62 0.2 45)",
      title: t("publish.types.announce", { defaultValue: "Annonce de live" }),
      sub: t("publish.types.announceSub", { defaultValue: "Annonce un live à venir" }),
    },
  ];

  const mediaKind =
    kind === "story" || kind === "video" || kind === "photo" || kind === "carousel"
      ? kind
      : null;

  return (
    <>
      <PushScreen
        open={chooserOpen}
        onClose={closeAll}
        title={t("publish.title", { defaultValue: "Publier" })}
        zIndex={85}
        right={
          <Press
            onClick={closeAll}
            className="h-9 rounded-full px-2 text-[13px] font-semibold text-muted-foreground"
          >
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Press>
        }
      >
        <div className="px-4 py-3">
          <p className="mb-3 px-1 text-[13px] text-muted-foreground">
            {t("publish.chooseType", { defaultValue: "Choisir le type de contenu" })}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {options.map((o, i) => (
              <div key={o.key}>
                <Press
                  onClick={() => pick(o.key)}
                  className="!block w-full !min-h-14 p-0 text-left"
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
                      style={{ background: o.tint }}
                    >
                      {o.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{o.title}</div>
                      <div className="text-[12px] text-muted-foreground">{o.sub}</div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </div>
                </Press>
                {i < options.length - 1 && <div className="ml-16 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </PushScreen>

      <CreateVitrineContentSheet
        open={mediaKind !== null}
        kind={mediaKind ?? "photo"}
        onClose={closeAll}
        onDone={() => {
          closeAll();
          window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "vitrine" }));
          window.dispatchEvent(new CustomEvent("kidi:vitrine-refresh"));
        }}
      />

      <AnnounceLiveSheet
        open={kind === "announce"}
        onClose={closeAll}
        onDone={() => {
          closeAll();
          window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "vitrine" }));
          window.dispatchEvent(new CustomEvent("kidi:vitrine-refresh"));
        }}
      />
    </>
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
