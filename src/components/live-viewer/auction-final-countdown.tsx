// Final-seconds countdown — shared host / viewers / social egress.
// Does not change the featured product card size.
//
// `density="social"` = large (YouTube/Facebook safe band).
// `density="app"` = compact (KiDi+ host + viewers — must not dominate the UI).

import { AnimatePresence, motion } from "framer-motion";

export function AuctionFinalCountdown({
  secondsLeft,
  active,
  density = "app",
}: {
  secondsLeft: number;
  active: boolean;
  density?: "app" | "social";
}) {
  const show = active && secondsLeft > 0 && secondsLeft <= 10;
  const urgent = secondsLeft <= 5;
  const social = density === "social";

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key={secondsLeft}
          initial={{ opacity: 0, scale: 0.55 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute inset-x-0 z-[55] flex flex-col items-center justify-center"
          style={
            social
              ? { top: "20%", bottom: "38%" }
              : { top: "18%", bottom: "auto" }
          }
        >
          {social && (
            <div
              className="mb-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white"
              style={{ background: "rgba(0,0,0,0.72)" }}
            >
              {urgent ? "Dernières secondes" : "Fin d'enchère"}
            </div>
          )}
          <div
            className="font-black tabular-nums tracking-tight"
            style={{
              borderRadius: social ? "1.75rem" : "1.15rem",
              padding: social ? "0.875rem 2rem" : "0.4rem 1.1rem",
              fontSize: social
                ? "clamp(64px, 20vw, 108px)"
                : "clamp(36px, 11vw, 52px)",
              lineHeight: 1,
              background: urgent
                ? "linear-gradient(135deg, oklch(0.62 0.24 25), oklch(0.45 0.22 25))"
                : "linear-gradient(135deg, oklch(0.88 0.14 85), oklch(0.7 0.16 70))",
              color: urgent ? "#fff" : "#10162B",
              boxShadow: urgent
                ? "0 14px 36px oklch(0.55 0.22 25 / 0.55)"
                : "0 14px 36px oklch(0.78 0.14 85 / 0.45)",
              textShadow: urgent ? "0 2px 10px rgba(0,0,0,0.45)" : undefined,
              border: urgent
                ? "2px solid rgba(255,255,255,0.35)"
                : "2px solid rgba(16,22,43,0.12)",
            }}
          >
            {secondsLeft}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
