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

// Icônes : une seule taille et une seule graisse de trait pour toute la barre,
// sinon le micro paraît plus lourd que le bouclier à l'écran.
const ICON = 19;
const STROKE = 1.9;

const btn =
  "!min-h-11 !min-w-11 h-11 w-11 rounded-full text-white grid place-items-center transition-colors";
const btnStyle = {
  backgroundColor: "rgba(10,12,20,0.42)",
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.16)",
  boxShadow:
    "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.14)",
};

const offStyle = {
  backgroundColor: "rgba(216,44,52,0.82)",
  border: "1px solid rgba(255,255,255,0.28)",
  boxShadow:
    "0 6px 18px rgba(150,20,25,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
};

/** Anneau or + halo doux quand l'outil est actif. */
const activeStyle = {
  border: "1.5px solid oklch(0.85 0.18 90)",
  color: "oklch(0.88 0.16 90)",
  boxShadow:
    "0 0 0 3px color-mix(in oklab, oklch(0.85 0.18 90) 18%, transparent), 0 6px 18px rgba(0,0,0,0.35)",
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
      className="pointer-events-none absolute z-30 flex flex-col items-center gap-2.5 [&_svg]:drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
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
          style={micOn ? btnStyle : { ...btnStyle, ...offStyle }}
        >
          {micOn ? (
            <Mic size={ICON} strokeWidth={STROKE} />
          ) : (
            <MicOff size={ICON} strokeWidth={STROKE} />
          )}
        </Press>
      )}
      {!hideAV && onToggleCam && (
        <Press
          onClick={() => { haptic.selection(); onToggleCam(); }}
          aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
          className={`${btn} pointer-events-auto`}
          style={camOn ? btnStyle : { ...btnStyle, ...offStyle }}
        >
          {camOn ? (
            <Video size={ICON} strokeWidth={STROKE} />
          ) : (
            <VideoOff size={ICON} strokeWidth={STROKE} />
          )}
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
          style={filtersActive ? { ...btnStyle, ...activeStyle } : btnStyle}
        >
          <Sparkles size={ICON} strokeWidth={STROKE} />
        </Press>
      )}
      {onOpenBattle && (
        <Press
          onClick={() => { haptic.selection(); onOpenBattle(); }}
          aria-label={t("battle.rail")}
          className={`${btn} pointer-events-auto`}
          style={battleActive ? { ...btnStyle, ...activeStyle } : btnStyle}
        >
          <Swords size={ICON} strokeWidth={STROKE} />
        </Press>
      )}
      {onOpenModerators && (
        <Press
          onClick={() => { haptic.selection(); onOpenModerators(); }}
          aria-label="Modérateurs"
          className={`${btn} pointer-events-auto`}
          style={moderatorsOpen ? { ...btnStyle, ...activeStyle } : btnStyle}
        >
          <Shield size={ICON} strokeWidth={STROKE} />
        </Press>
      )}
      {onAddProduct && (
        <Press
          onClick={() => { haptic.medium(); onAddProduct(); }}
          aria-label="Ajouter un produit"
          className={`${btn} pointer-events-auto mt-1`}
          style={{
            ...btnStyle,
            backgroundColor: "oklch(0.85 0.18 90)",
            border: "1px solid color-mix(in oklab, oklch(0.92 0.14 90) 70%, transparent)",
            color: "#10162B",
            boxShadow:
              "0 0 18px color-mix(in oklab, oklch(0.85 0.18 90) 38%, transparent), 0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          <Plus size={22} strokeWidth={2.6} />
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
        <RefreshCw
          size={ICON}
          strokeWidth={STROKE}
          className={busy ? "animate-spin" : undefined}
        />
      </Press>
    </motion.div>
  );
}
