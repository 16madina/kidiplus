// Giant final-seconds countdown — shared host / viewers / social egress.
// Positioned in the social "safe band" (middle of frame) so YouTube/Facebook
// chrome does not crop it. Does not change the featured product card size.

import { AnimatePresence, motion } from "framer-motion";

export function AuctionFinalCountdown({
  secondsLeft,
  active,
}: {
  secondsLeft: number;
  active: boolean;
}) {
  const show = active && secondsLeft > 0 && secondsLeft <= 10;
  const urgent = secondsLeft <= 5;

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key={secondsLeft}
          initial={{ opacity: 0, scale: 0.45 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute inset-x-0 z-[55] flex flex-col items-center justify-center"
          style={{
            // Mid safe band: below YT/FB top chrome, above bottom chat.
            top: "20%",
            bottom: "38%",
          }}
        >
          <div
            className="mb-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white"
            style={{ background: "rgba(0,0,0,0.72)" }}
          >
            {urgent ? "Dernières secondes" : "Fin d'enchère"}
          </div>
          <div
            className="rounded-[1.75rem] px-8 py-3.5 font-black tabular-nums tracking-tight"
            style={{
              fontSize: "clamp(64px, 20vw, 108px)",
              lineHeight: 1,
              background: urgent
                ? "linear-gradient(135deg, oklch(0.62 0.24 25), oklch(0.45 0.22 25))"
                : "linear-gradient(135deg, oklch(0.88 0.14 85), oklch(0.7 0.16 70))",
              color: urgent ? "#fff" : "#10162B",
              boxShadow: urgent
                ? "0 20px 56px oklch(0.55 0.22 25 / 0.65)"
                : "0 20px 56px oklch(0.78 0.14 85 / 0.55)",
              textShadow: urgent ? "0 3px 14px rgba(0,0,0,0.5)" : undefined,
              border: urgent
                ? "3px solid rgba(255,255,255,0.35)"
                : "3px solid rgba(16,22,43,0.15)",
            }}
          >
            {secondsLeft}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
