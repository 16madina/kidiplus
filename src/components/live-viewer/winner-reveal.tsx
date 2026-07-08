// Winner reveal animation: KiDi+ logo scales in, holds ~0.6s, then does a
// 3D flip revealing the auction winner (avatar + name). Stays ~2.5s and
// fades out. Sound-free, transform/opacity only.
//
// Used by both host and viewer screens on `room.lastAuctionEnd`.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand/logo";

type Phase = "logo" | "flip" | "winner" | "done";

export function WinnerReveal({
  open,
  winnerName,
  winnerAvatarUrl,
  isMe,
  onDone,
}: {
  open: boolean;
  winnerName: string | null;
  winnerAvatarUrl?: string | null;
  isMe: boolean;
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

  const displayLabel = winnerName ?? "—";
  const title = isMe
    ? t("auction.winner.you", "Tu as gagné !")
    : t("auction.winner.other", "{{name}} a gagné !", { name: displayLabel });

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
          style={{ perspective: 1200 }}
        >
          <motion.div
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              rotateY,
            }}
            transition={{
              scale: { type: "spring", stiffness: 260, damping: 16 },
              opacity: { duration: 0.25 },
              rotateY: { duration: 0.55, ease: [0.32, 0.72, 0, 1] },
            }}
            className="relative flex items-center justify-center"
            style={{
              width: 260,
              height: 260,
              transformStyle: "preserve-3d",
            }}
          >
            {/* Front — logo */}
            <div
              className="absolute inset-0 flex items-center justify-center rounded-[36px]"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                background:
                  "linear-gradient(135deg, oklch(0.24 0.05 260), oklch(0.14 0.05 260))",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1.5px oklch(0.78 0.14 85 / 0.55)",
              }}
            >
              <Logo size={92} />
            </div>

            {/* Back — winner card */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-[36px] px-5 text-center text-white"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                background:
                  "linear-gradient(135deg, oklch(0.24 0.05 260), oklch(0.14 0.05 260))",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1.5px oklch(0.78 0.14 85 / 0.55)",
              }}
            >
              <div
                className="grid h-24 w-24 place-items-center overflow-hidden rounded-full"
                style={{
                  background: "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.7 0.16 75))",
                  boxShadow: "0 12px 28px oklch(0.78 0.14 85 / 0.45)",
                  padding: 4,
                }}
              >
                {winnerAvatarUrl ? (
                  <img
                    src={winnerAvatarUrl}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center rounded-full text-[36px] font-black text-[#10162B]"
                    style={{ background: "oklch(0.95 0.04 85)" }}
                  >
                    {(displayLabel[0] ?? "?").toUpperCase()}
                  </div>
                )}
              </div>
              <p
                className="mt-3 text-[20px] font-black leading-tight"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
              >
                {title} 🎉
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
