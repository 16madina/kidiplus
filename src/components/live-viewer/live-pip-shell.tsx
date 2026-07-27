import { motion, useMotionValue } from "framer-motion";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useInSystemPip } from "@/lib/pip-session";
import { haptic } from "@/lib/haptics";

/**
 * Full-screen ↔ floating mini-player shell.
 *
 * Keep a SINGLE motion node for mini↔full↔system-PiP so LiveKit <video>
 * never remounts (remount caused a splash/poster flash on iOS when expanding
 * the mini or returning from system PiP).
 * Drag offsets are reset via motion values when leaving mini — no key swap.
 */
export function LivePipShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { presentation, expand, close } = useLiveViewer();
  const inSystemPip = useInSystemPip();
  const floatingMini = presentation === "minimized" && !inSystemPip;
  const draggedRef = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useLayoutEffect(() => {
    if (floatingMini) return;
    x.set(0);
    y.set(0);
  }, [floatingMini, x, y]);

  const mode = inSystemPip ? "system" : floatingMini ? "mini" : "full";

  return (
    <motion.div
      data-kp-live-pip={mode}
      initial={false}
      drag={floatingMini}
      dragMomentum={false}
      dragElastic={0.12}
      dragConstraints={
        floatingMini && typeof window !== "undefined"
          ? {
              left: -(window.innerWidth - 140),
              right: 8,
              top: -(window.innerHeight - 280),
              bottom: 8,
            }
          : { left: 0, right: 0, top: 0, bottom: 0 }
      }
      onDragStart={() => {
        draggedRef.current = true;
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 120);
      }}
      className={
        floatingMini
          ? "fixed z-[55] max-w-none overflow-hidden bg-black shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/20"
          : inSystemPip
            ? "fixed inset-0 z-[2147483000] max-w-none overflow-hidden bg-black"
            : "fixed inset-0 z-[60] w-full max-w-none overflow-hidden bg-black"
      }
      style={
        floatingMini
          ? {
              x,
              y,
              width: 118,
              height: 210,
              borderRadius: 18,
              right: 12,
              bottom: 72,
              marginBottom: "env(safe-area-inset-bottom, 0px)",
              touchAction: "none",
            }
          : {
              x: 0,
              y: 0,
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: "100%",
              height: "100%",
              maxWidth: inSystemPip ? "none" : undefined,
              borderRadius: 0,
              transform: "none",
              margin: 0,
            }
      }
    >
      {children}

      {floatingMini && (
        <div className="absolute inset-0 z-40">
          <button
            type="button"
            aria-label={t("live.expand", "Agrandir le live")}
            className="absolute inset-0 cursor-pointer"
            onClick={() => {
              if (draggedRef.current) return;
              x.set(0);
              y.set(0);
              haptic.light();
              expand();
            }}
          />
          <span
            className="pointer-events-none absolute left-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-black tracking-wide text-white"
            style={{ backgroundColor: "var(--live)" }}
          >
            LIVE
          </span>
          <button
            type="button"
            aria-label={t("live.leave")}
            className="absolute right-1 top-1 z-10 grid h-8 w-8 place-items-center rounded-full text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              haptic.light();
              close();
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function useLivePip() {
  const { presentation, minimize, expand, close } = useLiveViewer();
  const inSystemPip = useInSystemPip();
  const floatingMini = presentation === "minimized" && !inSystemPip;
  return {
    minimized: floatingMini,
    chromeHidden: floatingMini || inSystemPip,
    inSystemPip,
    minimize,
    expand,
    close,
  };
}
