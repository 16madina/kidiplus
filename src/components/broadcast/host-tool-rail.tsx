// Right-side vertical tool rail for the host (and moderator) during a live.
// TikTok-style column: 44pt glass buttons + optional tiny label underneath.
import { motion } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, RefreshCw, Shield, Plus } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

export type HostToolRailProps = {
  micOn?: boolean;
  camOn?: boolean;
  canFlip?: boolean;
  moderatorsOpen?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onFlip?: () => void;
  onOpenModerators?: () => void;
  onAddProduct?: () => void;
  /** Hide the mic/cam buttons (viewer moderator mode). */
  hideAV?: boolean;
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
  canFilter = true,
  filtersOpen = false,
  onToggleMic,
  onToggleCam,
  onFlip,
  onToggleFilters,
  onAddProduct,
  hideAV = false,
}: HostToolRailProps) {
  return (
    <div
      className="pointer-events-none absolute right-3 z-30 flex flex-col items-center gap-2"
      style={{
        top: "50%",
        transform: "translateY(-50%)",
      }}
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
        <FlipButton onFlip={onFlip} />
      )}
      {!hideAV && canFilter && onToggleFilters && (
        <Press
          onClick={() => { haptic.selection(); onToggleFilters(); }}
          aria-label="Filtres caméra"
          className={`${btn} pointer-events-auto`}
          style={{
            ...btnStyle,
            outline: filtersOpen ? "2px solid oklch(0.85 0.18 90)" : undefined,
            outlineOffset: -2,
          }}
        >
          <Sparkles size={16} />
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

function FlipButton({ onFlip }: { onFlip: () => void }) {
  return (
    <motion.div whileTap={{ rotate: 180 }} transition={{ duration: 0.4 }}>
      <Press
        onClick={() => { haptic.selection(); onFlip(); }}
        aria-label="Retourner la caméra"
        className={`${btn} pointer-events-auto`}
        style={btnStyle}
      >
        <RefreshCw size={16} />
      </Press>
    </motion.div>
  );
}
