import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useInSystemPip } from "@/lib/pip-session";
import { haptic } from "@/lib/haptics";

/**
 * Full-screen ↔ floating mini-player shell.
 *
 * Android system PiP shows the whole WebView in the bubble — so in that mode
 * we render a plain fixed inset-0 black layer (no framer size animation).
 *
 * Mini player: tap body → expand; tap X → close; drag to reposition.
 * Remount on mini↔full (key) so iOS WebKit does not keep a leftover drag
 * transform that clips / offsets the restored full live.
 */
export function LivePipShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { presentation, expand, close } = useLiveViewer();
  const inSystemPip = useInSystemPip();
  const floatingMini = presentation === "minimized" && !inSystemPip;
  // Ignore the click that iOS synthesizes at the end of a drag.
  const draggedRef = useRef(false);

  if (inSystemPip) {
    return (
      <div
        data-kp-live-pip="system"
        className="overflow-hidden bg-black"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          maxWidth: "none",
          margin: 0,
          transform: "none",
          borderRadius: 0,
          zIndex: 2147483000,
        }}
      >
        {children}
      </div>
    );
  }

  if (floatingMini) {
    return (
      <motion.div
        key="mini"
        data-kp-live-pip="mini"
        initial={false}
        className="fixed z-[55] max-w-none overflow-hidden bg-black shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/20"
        style={{
          width: 118,
          height: 210,
          borderRadius: 18,
          right: 12,
          bottom: 72,
          marginBottom: "env(safe-area-inset-bottom, 0px)",
          touchAction: "none",
        }}
        drag
        dragMomentum={false}
        dragElastic={0.12}
        dragConstraints={
          typeof window !== "undefined"
            ? {
                left: -(window.innerWidth - 140),
                right: 8,
                top: -(window.innerHeight - 280),
                bottom: 8,
              }
            : undefined
        }
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={() => {
          // Keep the flag through the trailing click on iOS Safari/WebView.
          window.setTimeout(() => {
            draggedRef.current = false;
          }, 120);
        }}
      >
        {children}

        <div className="absolute inset-0 z-40">
          <button
            type="button"
            aria-label={t("live.expand", "Agrandir le live")}
            className="absolute inset-0 cursor-pointer"
            onClick={() => {
              if (draggedRef.current) return;
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
      </motion.div>
    );
  }

  // Fresh mount for full screen — no drag transform inheritance from mini.
  return (
    <motion.div
      key="full"
      data-kp-live-pip="full"
      initial={false}
      className="fixed inset-0 z-[60] mx-auto w-full max-w-xl overflow-hidden bg-black"
      style={{
        transform: "none",
      }}
    >
      {children}
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
