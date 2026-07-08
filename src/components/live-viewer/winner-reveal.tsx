// Winner reveal animation: KiDi+ badge logo scales in, holds ~0.6s, then does
// a 3D flip revealing the winner's NAME in huge gold letters with "A DIT +"
// underneath. No card background — pure text over the video. Transform/opacity
// only, no sound.
//
// Used by both host and viewer screens on `room.lastAuctionEnd`.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import logoBadge from "@/assets/kidi-logo-badge.png.asset.json";

type Phase = "logo" | "flip" | "winner" | "done";

export function WinnerReveal({
  open,
  winnerName,
  onDone,
}: {
  open: boolean;
  winnerName: string | null;
  /** Kept for API compatibility — no longer rendered. */
  winnerAvatarUrl?: string | null;
  /** Kept for API compatibility — no longer changes the copy. */
  isMe?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("logo");

  useEffect(() => {
    if (!open) {
      setPhase("logo");
      return;
    }
    const t1 = setTimeout(() => setPhase("flip"), 700);
    const t2 = setTimeout(() => setPhase("winner"), 1100);
    const t3 = setTimeout(() => setPhase("done"), 3600);
    const t4 = setTimeout(() => onDone(), 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [open, onDone]);

  if (!open) return null;

  const displayName = (winnerName ?? "—").toUpperCase();
  const saidLabel = t("auction.winner.said", "A DIT +");

  const rotateY = phase === "logo" ? 0 : 180;

  return (
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          key="winner-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute inset-0 z-50 grid place-items-center"
          style={{ perspective: 1400 }}
        >
          <motion.div
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotateY }}
            transition={{
              scale: { type: "spring", stiffness: 240, damping: 15 },
              opacity: { duration: 0.25 },
              rotateY: { duration: 0.6, ease: [0.32, 0.72, 0, 1] },
            }}
            className="relative flex items-center justify-center"
            style={{
              width: "min(78vw, 420px)",
              height: "min(78vw, 420px)",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Front — bare logo, no card */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <img
                src={logoBadge.url}
                alt="KiDi+"
                draggable={false}
                className="h-full w-full object-contain"
                style={{
                  filter:
                    "drop-shadow(0 18px 40px rgba(0,0,0,0.55)) drop-shadow(0 0 24px oklch(0.82 0.14 85 / 0.35))",
                }}
              />
            </div>

            {/* Back — winner name, no background */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <motion.p
                initial={{ y: 14, opacity: 0, scale: 0.9 }}
                animate={
                  phase === "winner" || phase === "flip"
                    ? { y: 0, opacity: 1, scale: 1 }
                    : { y: 14, opacity: 0, scale: 0.9 }
                }
                transition={{
                  delay: 0.15,
                  type: "spring",
                  stiffness: 260,
                  damping: 18,
                }}
                className="font-black leading-none tracking-tight"
                style={{
                  fontSize: "clamp(44px, 12vw, 96px)",
                  background:
                    "linear-gradient(180deg, oklch(0.92 0.12 90), oklch(0.72 0.16 75))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  textShadow: "0 6px 24px rgba(0,0,0,0.55)",
                  filter:
                    "drop-shadow(0 4px 12px rgba(0,0,0,0.55)) drop-shadow(0 0 18px oklch(0.82 0.14 85 / 0.4))",
                  letterSpacing: "-0.02em",
                }}
              >
                {displayName}
              </motion.p>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={
                  phase === "winner" || phase === "flip"
                    ? { y: 0, opacity: 1 }
                    : { y: 10, opacity: 0 }
                }
                transition={{ delay: 0.32, duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                className="mt-3 font-black uppercase text-white"
                style={{
                  fontSize: "clamp(18px, 4.2vw, 30px)",
                  letterSpacing: "0.22em",
                  textShadow: "0 3px 12px rgba(0,0,0,0.7)",
                }}
              >
                {saidLabel}
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
