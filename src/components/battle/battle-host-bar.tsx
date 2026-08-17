import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Video, VideoOff, RefreshCw, Plus } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { BATTLE_VIDEO_DOCK_STYLE } from "@/components/battle/battle-split-chrome";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";

const btn =
  "!min-h-10 !min-w-10 h-10 w-10 rounded-full text-white grid place-items-center";
const glass = {
  backgroundColor: "rgba(0,0,0,0.58)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(255,255,255,0.14)",
} as const;

export function BattleHostBar({
  hideAV,
  micOn,
  camOn,
  canFlip,
  flipBusy,
  onToggleMic,
  onToggleCam,
  onFlip,
  onLeave,
  onOpenModerators,
  onOpenProducts,
  onOpenFilters,
}: {
  hideAV?: boolean;
  micOn: boolean;
  camOn: boolean;
  canFlip: boolean;
  flipBusy: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onFlip?: () => void;
  onLeave: () => void;
  onOpenModerators?: () => void;
  onOpenProducts?: () => void;
  onOpenFilters?: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const peek = () => setVisible(true);

  useEffect(() => {
    if (!visible || moreOpen) return;
    const id = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(id);
  }, [visible, moreOpen]);

  return (
    <>
      <button
        type="button"
        aria-label={t("battle.more.peek")}
        className="absolute z-[29] inset-x-0 appearance-none border-0 outline-none"
        style={{
          ...BATTLE_VIDEO_DOCK_STYLE,
          background: "transparent",
        }}
        onClick={() => {
          haptic.selection();
          peek();
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 z-[33] flex justify-center transition-opacity duration-200"
        style={{
          top: `calc(${BATTLE_VIDEO_DOCK_STYLE.top} + ${BATTLE_VIDEO_DOCK_STYLE.height} - 52px)`,
          opacity: visible ? 1 : 0,
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-full px-1.5 py-1"
          style={{
            ...glass,
            pointerEvents: visible ? "auto" : "none",
          }}
        >
          {!hideAV && onToggleMic && (
            <Press
              onClick={() => {
                haptic.selection();
                peek();
                onToggleMic();
              }}
              aria-label={micOn ? "Couper le micro" : "Réactiver le micro"}
              className={btn}
              style={{
                ...glass,
                backgroundColor: micOn ? glass.backgroundColor : "rgba(220,30,40,0.9)",
              }}
            >
              {micOn ? <Mic size={15} /> : <MicOff size={15} />}
            </Press>
          )}
          {!hideAV && onToggleCam && (
            <Press
              onClick={() => {
                haptic.selection();
                peek();
                onToggleCam();
              }}
              aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
              className={btn}
              style={{
                ...glass,
                backgroundColor: camOn ? glass.backgroundColor : "rgba(220,30,40,0.9)",
              }}
            >
              {camOn ? <Video size={15} /> : <VideoOff size={15} />}
            </Press>
          )}
          {!hideAV && canFlip && onFlip && (
            <Press
              onClick={() => {
                if (flipBusy) return;
                haptic.selection();
                peek();
                onFlip();
              }}
              aria-label="Retourner la caméra"
              className={btn}
              style={{ ...glass, opacity: flipBusy ? 0.55 : 1 }}
            >
              <RefreshCw size={15} className={flipBusy ? "animate-spin" : undefined} />
            </Press>
          )}
          <Press
            onClick={() => {
              haptic.selection();
              peek();
              setMoreOpen(true);
            }}
            aria-label={t("battle.more.title")}
            className={btn}
            style={{ backgroundColor: "oklch(0.85 0.18 90)", color: "#10162B" }}
          >
            <Plus size={16} />
          </Press>
        </div>
      </div>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} heightPercent={42}>
        <div className="px-1 pb-4 pt-1">
          <p className="mb-3 text-[13px] font-black uppercase tracking-wide text-white/55">
            {t("battle.more.title")}
          </p>
          <div className="flex flex-col gap-2">
            {onOpenProducts && (
              <Press
                onClick={() => {
                  setMoreOpen(false);
                  onOpenProducts();
                }}
                className="!min-h-12 rounded-2xl text-[15px] font-bold text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {t("battle.more.products")}
              </Press>
            )}
            {onOpenModerators && (
              <Press
                onClick={() => {
                  setMoreOpen(false);
                  onOpenModerators();
                }}
                className="!min-h-12 rounded-2xl text-[15px] font-bold text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {t("battle.more.moderators")}
              </Press>
            )}
            {onOpenFilters && (
              <Press
                onClick={() => {
                  setMoreOpen(false);
                  onOpenFilters();
                }}
                className="!min-h-12 rounded-2xl text-[15px] font-bold text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {t("battle.more.settings")}
              </Press>
            )}
            <Press
              onClick={() => {
                haptic.warning();
                setMoreOpen(false);
                onLeave();
              }}
              className="!min-h-12 rounded-2xl text-[15px] font-bold text-white"
              style={{ backgroundColor: "rgba(220,30,40,0.85)" }}
            >
              {t("battle.hud.leave")}
            </Press>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
