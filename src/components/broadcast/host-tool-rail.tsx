// Right-side vertical tool rail for the host (and moderator) during a live.
// TikTok-style column: 44pt glass buttons + optional tiny label underneath.
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Video, VideoOff, RefreshCw, Shield, Plus, Sparkles, Swords } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { isNative } from "@/lib/native";

export type HostToolRailProps = {
  micOn?: boolean;
  camOn?: boolean;
  canFlip?: boolean;
  flipBusy?: boolean;
  moderatorsOpen?: boolean;
  filtersActive?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onFlip?: () => void;
  onOpenModerators?: () => void;
  onOpenFilters?: () => void;
  onOpenBattle?: () => void;
  battleActive?: boolean;
  onAddProduct?: () => void;
  /** Hide the mic/cam buttons (viewer moderator mode). */
  hideAV?: boolean;
  /** Pin the rail to the host's camera box during a Défi Plus. */
  layout?: "default" | "battle";
  align?: "left" | "right";
};

const btn =
  "!min-h-11 !min-w-11 h-11 w-11 rounded-full text-white grid place-items-center";
const btnStyle = {
  backgroundColor: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.12)",
};

export function HostToolRail({
  micOn = true,
  camOn = true,
  canFlip = true,
  flipBusy = false,
  moderatorsOpen = false,
  filtersActive = false,
  onToggleMic,
  onToggleCam,
  onFlip,
  onOpenModerators,
  onOpenFilters,
  onOpenBattle,
  battleActive = false,
  onAddProduct,
  hideAV = false,
  layout = "default",
  align = "right",
}: HostToolRailProps) {
  const { t } = useTranslation();
  // Web preview: the featured-auction card lives at the vertical middle on the
  // right edge and collides with this rail. On iOS/Android the rail sits higher
  // on the screen so it stays clear — only shift down for web.
  const webOffset = !isNative();
  const battle = layout === "battle";
  return (
    <div
      className="pointer-events-none absolute z-30 flex flex-col items-center gap-2"
      style={
        battle
          ? {
              top: "calc(env(safe-area-inset-top, 0px) + 118px + min(20dvh, 170px))",
              left:
                align === "left"
                  ? "max(0.35rem, env(safe-area-inset-left, 0px))"
                  : undefined,
              right:
                align === "right"
                  ? "max(0.35rem, env(safe-area-inset-right, 0px))"
                  : undefined,
              transform: "translateY(-50%)",
            }
          : {
              top: webOffset ? "68%" : "50%",
              right: "max(0.75rem, env(safe-area-inset-right, 0px))",
              transform: "translateY(-50%)",
            }
      }
    >
      {!hideAV && onToggleMic && (
        <Press
          onClick={() => { haptic.selection(); onToggleMic(); }}
          aria-label={micOn ? "Couper le micro" : "Réactiver le micro"}
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            backgroundColor: micOn ? btnStyle.backgroundColor : "rgba(220,30,40,0.9)",
          }}
        >
          {micOn ? <Mic size={16} /> : <MicOff size={16} />}
        </Press>
      )}
      {!hideAV && onToggleCam && (
        <Press
          onClick={() => { haptic.selection(); onToggleCam(); }}
          aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            backgroundColor: camOn ? btnStyle.backgroundColor : "rgba(220,30,40,0.9)",
          }}
        >
          {camOn ? <Video size={16} /> : <VideoOff size={16} />}
        </Press>
      )}
      {!hideAV && canFlip && onFlip && (
        <FlipButton onFlip={onFlip} busy={flipBusy} />
      )}
      {onOpenFilters && (
        <Press
          onClick={() => { haptic.selection(); onOpenFilters(); }}
          aria-label="Filtres"
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            outline: filtersActive ? "2px solid oklch(0.85 0.18 90)" : undefined,
            outlineOffset: -2,
            color: filtersActive ? "oklch(0.85 0.18 90)" : "white",
          }}
        >
          <Sparkles size={16} />
        </Press>
      )}
      {onOpenBattle && (
        <Press
          onClick={() => { haptic.selection(); onOpenBattle(); }}
          aria-label={t("battle.rail")}
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            outline: battleActive ? "2px solid oklch(0.85 0.18 90)" : undefined,
            outlineOffset: -2,
            color: battleActive ? "oklch(0.85 0.18 90)" : "white",
          }}
        >
          <Swords size={16} />
        </Press>
      )}
      {onOpenModerators && (
        <Press
          onClick={() => { haptic.selection(); onOpenModerators(); }}
          aria-label="Modérateurs"
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            outline: moderatorsOpen ? "2px solid oklch(0.85 0.18 90)" : undefined,
            outlineOffset: -2,
          }}
        >
          <Shield size={16} />
        </Press>
      )}
      {onAddProduct && (
        <Press
          onClick={() => { haptic.medium(); onAddProduct(); }}
          aria-label="Ajouter un produit"
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            backgroundColor: "oklch(0.85 0.18 90)",
            color: "#10162B",
          }}
        >
          <Plus size={18} />
        </Press>
      )}
    </div>
  );
}

function FlipButton({ onFlip, busy }: { onFlip: () => void; busy?: boolean }) {
  return (
    <motion.div whileTap={busy ? undefined : { rotate: 180 }} transition={{ duration: 0.4 }}>
      <Press
        onClick={() => {
          if (busy) return;
          haptic.selection();
          onFlip();
        }}
        aria-label="Retourner la caméra"
        disabled={busy}
        className={`${btn} pointer-events-auto`}
        style={{ ...btnStyle, opacity: busy ? 0.55 : 1 }}
      >
        <RefreshCw size={16} className={busy ? "animate-spin" : undefined} />
      </Press>
    </motion.div>
  );
}
