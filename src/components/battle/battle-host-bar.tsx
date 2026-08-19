import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  Plus,
  X,
  Sparkles,
  Package,
  Shield,
  LogOut,
} from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

const ICON = 18;
const STROKE = 1.9;

const fab =
  "!min-h-12 !min-w-12 h-12 w-12 rounded-full grid place-items-center pointer-events-auto";
const tool =
  "!min-h-11 !min-w-11 h-11 w-11 rounded-full text-white grid place-items-center pointer-events-auto";

const glass = {
  backgroundColor: "rgba(10,12,20,0.55)",
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.16)",
  boxShadow:
    "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.14)",
} as const;

const offStyle = {
  backgroundColor: "rgba(216,44,52,0.82)",
  border: "1px solid rgba(255,255,255,0.28)",
} as const;

const goldFab = {
  backgroundColor: "oklch(0.85 0.18 90)",
  border: "1px solid color-mix(in oklab, oklch(0.92 0.14 90) 70%, transparent)",
  color: "#10162B",
  boxShadow:
    "0 0 18px color-mix(in oklab, oklch(0.85 0.18 90) 38%, transparent), 0 6px 18px rgba(0,0,0,0.35)",
} as const;

/**
 * During Défi Plus the full HostToolRail is replaced by this FAB.
 * A persistent + stays on screen; tapping it unfolds mic / cam / flip / filters / etc.
 */
export function BattleHostBar({
  hideAV,
  micOn,
  camOn,
  canFlip,
  flipBusy,
  filtersActive = false,
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
  filtersActive?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onFlip?: () => void;
  onLeave: () => void;
  onOpenModerators?: () => void;
  onOpenProducts?: () => void;
  onOpenFilters?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    // Capture so we close even when another overlay swallows the bubble.
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  const close = () => setOpen(false);

  const tools: Array<{
    key: string;
    label: string;
    onClick: () => void;
    node: ReactNode;
    style?: CSSProperties;
  }> = [];

  if (!hideAV && onToggleMic) {
    tools.push({
      key: "mic",
      label: micOn
        ? t("battle.tools.muteMic", "Couper le micro")
        : t("battle.tools.unmuteMic", "Réactiver le micro"),
      onClick: () => {
        haptic.selection();
        onToggleMic();
      },
      node: micOn ? (
        <Mic size={ICON} strokeWidth={STROKE} />
      ) : (
        <MicOff size={ICON} strokeWidth={STROKE} />
      ),
      style: micOn ? glass : { ...glass, ...offStyle },
    });
  }
  if (!hideAV && onToggleCam) {
    tools.push({
      key: "cam",
      label: camOn
        ? t("battle.tools.muteCam", "Couper la caméra")
        : t("battle.tools.unmuteCam", "Activer la caméra"),
      onClick: () => {
        haptic.selection();
        onToggleCam();
      },
      node: camOn ? (
        <Video size={ICON} strokeWidth={STROKE} />
      ) : (
        <VideoOff size={ICON} strokeWidth={STROKE} />
      ),
      style: camOn ? glass : { ...glass, ...offStyle },
    });
  }
  if (!hideAV && canFlip && onFlip) {
    tools.push({
      key: "flip",
      label: t("battle.tools.flip", "Retourner la caméra"),
      onClick: () => {
        if (flipBusy) return;
        haptic.selection();
        onFlip();
      },
      node: (
        <RefreshCw
          size={ICON}
          strokeWidth={STROKE}
          className={flipBusy ? "animate-spin" : undefined}
        />
      ),
      style: { ...glass, opacity: flipBusy ? 0.55 : 1 },
    });
  }
  if (onOpenFilters) {
    tools.push({
      key: "filters",
      label: t("battle.more.settings", "Filtres"),
      onClick: () => {
        haptic.selection();
        close();
        onOpenFilters();
      },
      node: <Sparkles size={ICON} strokeWidth={STROKE} />,
      style: filtersActive
        ? {
            ...glass,
            border: "1.5px solid oklch(0.85 0.18 90)",
            color: "oklch(0.88 0.16 90)",
          }
        : glass,
    });
  }
  if (onOpenProducts) {
    tools.push({
      key: "products",
      label: t("battle.more.products", "Articles"),
      onClick: () => {
        haptic.medium();
        close();
        onOpenProducts();
      },
      node: <Package size={ICON} strokeWidth={STROKE} />,
      style: glass,
    });
  }
  if (onOpenModerators) {
    tools.push({
      key: "mods",
      label: t("battle.more.moderators", "Modérateurs"),
      onClick: () => {
        haptic.selection();
        close();
        onOpenModerators();
      },
      node: <Shield size={ICON} strokeWidth={STROKE} />,
      style: glass,
    });
  }
  tools.push({
    key: "leave",
    label: t("battle.hud.leave", "Quitter le défi"),
    onClick: () => {
      haptic.warning();
      close();
      onLeave();
    },
    node: <LogOut size={ICON} strokeWidth={STROKE} />,
    style: { ...glass, ...offStyle },
  });

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute z-[34] flex flex-col items-center gap-2.5"
      style={{
        // Above the host chat composer, clear of the product cards row.
        right: "max(0.65rem, env(safe-area-inset-right, 0px))",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
      }}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tools"
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="pointer-events-none flex flex-col-reverse items-center gap-2.5"
          >
            {tools.map((item, i) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col items-center gap-0.5"
              >
                <Press
                  onClick={item.onClick}
                  aria-label={item.label}
                  className={tool}
                  style={item.style}
                >
                  {item.node}
                </Press>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Press
        onClick={() => {
          haptic.medium();
          setOpen((v) => !v);
        }}
        aria-label={
          open
            ? t("battle.more.close", "Fermer")
            : t("battle.more.title", "Outils du live")
        }
        aria-expanded={open}
        className={fab}
        style={open ? { ...glass, color: "#fff" } : goldFab}
      >
        {open ? (
          <X size={22} strokeWidth={2.4} />
        ) : (
          <Plus size={24} strokeWidth={2.6} />
        )}
      </Press>
    </div>
  );
}
