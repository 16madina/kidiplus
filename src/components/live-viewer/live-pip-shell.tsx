import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useInSystemPip } from "@/lib/pip-session";
import { haptic } from "@/lib/haptics";

/**
 * Full-screen ↔ floating mini-player shell.
 *
 * Android system PiP shows the whole WebView in the bubble — so in that mode
 * we render a plain fixed inset-0 black layer (no framer size animation, no
 * max-width). Otherwise the home tab bar peeks under the live in the PiP window.
 *
 * Mini player: tap body → expand; tap X → close. Do NOT use framer onTap on the
 * shell — it also fires when pressing X and re-opens the live instead of closing.
 */
export function LivePipShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { presentation, expand, close } = useLiveViewer();
  const inSystemPip = useInSystemPip();
  const floatingMini = presentation === "minimized" && !inSystemPip;

  // System PiP: skip framer-motion sizing — it can leave gaps that reveal tabs.
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

  return (
    <motion.div
      initial={false}
      animate={
        floatingMini
          ? {
              width: 118,
              height: 210,
              borderRadius: 18,
              top: "auto",
              left: "auto",
              right: 12,
              bottom: 72,
              x: 0,
              y: 0,
            }
          : {
              width: "100%",
              maxWidth: 576,
              height: "100%",
              borderRadius: 0,
              top: 0,
              bottom: 0,
              left: "50%",
              right: "auto",
              x: "-50%",
              y: 0,
            }
      }
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.85 }}
      drag={floatingMini}
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
      data-kp-live-pip={floatingMini ? "mini" : "full"}
      className={
        floatingMini
          ? "fixed z-[55] max-w-none overflow-hidden bg-black shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/20"
          : "fixed z-[60] max-w-xl overflow-hidden bg-black"
      }
      style={floatingMini ? { marginBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
    >
      {children}

      {floatingMini && (
        <div className="absolute inset-0 z-40">
          {/* Expand hit-area — separate from X so close is never overridden. */}
          <button
            type="button"
            aria-label={t("live.expand", "Agrandir le live")}
            className="absolute inset-0 cursor-pointer"
            onClick={() => {
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
              // Stop framer drag + parent handlers from stealing the close tap.
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
