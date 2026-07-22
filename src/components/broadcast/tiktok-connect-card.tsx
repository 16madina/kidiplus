// Setup card: explains TikTok RTMP flow (no OAuth). Keys are entered during the live via TT.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { haptic } from "@/lib/haptics";

const PINK = "#FE2C55";
const PINK_SOFT = "oklch(0.65 0.22 15 / 0.35)";

export function TiktokConnectCard() {
  const { t } = useTranslation();
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <div
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3"
        style={{
          border: `1px solid ${PINK_SOFT}`,
          background: "oklch(0.13 0.03 260 / 0.7)",
        }}
      >
        <div className="min-w-0 pr-3">
          <p className="text-[14px] font-bold text-white">
            {t("broadcast.tiktok.connectTitle", "TikTok")}
          </p>
          <p className="truncate text-[11px] text-white/65">
            {t(
              "broadcast.tiktok.connectHint",
              "Diffuse l’interface KiDi+ sur TikTok (clé RTMP pendant le live)",
            )}
          </p>
        </div>
        <Press
          onClick={() => {
            haptic.selection();
            setGuideOpen(true);
          }}
          className="!min-h-8 shrink-0 rounded-full px-3 text-[11px] font-bold text-white"
          style={{ background: PINK }}
        >
          {t("broadcast.tiktok.howTo", "Comment faire")}
        </Press>
      </div>

      <BottomSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        heightPercent={72}
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
          <h2 className="pb-2 pt-1 text-[18px] font-bold text-foreground">
            {t("broadcast.tiktok.guideTitle", "Diffuser sur TikTok")}
          </h2>
          <p className="mb-4 text-[13px] leading-snug text-muted-foreground">
            {t(
              "broadcast.tiktok.guideIntro",
              "Contrairement à YouTube et Facebook, TikTok n’a pas de connexion en un clic. Tu colles une clé RTMP pendant le live.",
            )}
          </p>

          <ol className="mb-5 list-decimal space-y-3 pl-5 text-[14px] leading-snug text-foreground">
            <li>
              {t(
                "broadcast.tiktok.guideStep1",
                "Sur ordinateur, ouvre TikTok LIVE Studio (appli Windows) ou récupère Serveur + Clé via l’option Streaming software / Cast to PC sur le téléphone.",
              )}
            </li>
            <li>
              {t(
                "broadcast.tiktok.guideStep2",
                "Lance d’abord ton live sur KiDi+ (caméra).",
              )}
            </li>
            <li>
              {t(
                "broadcast.tiktok.guideStep3",
                "En haut du live, appuie sur le bouton TT.",
              )}
            </li>
            <li>
              {t(
                "broadcast.tiktok.guideStep4",
                "Colle le Serveur RTMP et la Clé de stream récupérés sur TikTok, puis lance.",
              )}
            </li>
            <li>
              {t(
                "broadcast.tiktok.guideStep5",
                "Les viewers TikTok voient l’interface KiDi+ (enchères, chat, carte produit). Les commentaires TikTok ne reviennent pas dans KiDi+.",
              )}
            </li>
          </ol>

          <Press
            onClick={() => setGuideOpen(false)}
            className="!min-h-12 h-12 w-full rounded-full text-[15px] font-bold text-white"
            style={{ background: PINK }}
          >
            {t("broadcast.tiktok.guideGotIt", "Compris")}
          </Press>
        </div>
      </BottomSheet>
    </>
  );
}
