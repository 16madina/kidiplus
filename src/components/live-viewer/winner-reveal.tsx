// Winner reveal overlay — Whatnot-style.
//
// Sequence (~3.2s, identical on host + viewers):
//   0.00-0.60s  KiDi+ logo scales in (spring), soft gold glow.
//   0.60-1.00s  3D flip (rotateY) → winner card: avatar in gold ring,
//               display name (tasteful, ellipsized), "a dit + 🎉" in gold.
//   1.00-2.80s  Hold.
//   2.80-3.20s  Fade + slight scale down, then onDone().
//
// Dismissal is driven by a single setTimeout scheduled on mount and cleaned up
// on unmount. `onDone` is stored in a ref so parent re-renders (frequent on
// the host: auction ticks, chat, presence) do NOT re-run the timer effect and
// clear the pending timeouts — that was the host-side freeze.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand/logo";

type Phase = "logo" | "flip" | "hold" | "out";

const TIMINGS = {
  flip: 600,     // start rotateY at 600ms
  hold: 1000,    // fully revealed at 1000ms
  out: 2800,     // begin fade-out
  done: 3200,    // unmount signal
} as const;

function firstName(full: string | null | undefined): string {
  if (!full) return "—";
  const trimmed = full.trim();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export function WinnerReveal({
  open,
  winnerName,
  winnerAvatarUrl,
  isMe = false,
  onDone,
}: {
  open: boolean;
  winnerName: string | null;
  winnerAvatarUrl?: string | null;
  isMe?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("logo");

  // Keep the latest onDone without re-triggering the timer effect.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Drive the animation lifecycle. Only depends on `open` — timers survive
  // parent re-renders (host bid ticks, chat, presence).
  useEffect(() => {
    if (!open) {
      setPhase("logo");
      return;
    }
    setPhase("logo");
    const t1 = setTimeout(() => setPhase("flip"), TIMINGS.flip);
    const t2 = setTimeout(() => setPhase("hold"), TIMINGS.hold);
    const t3 = setTimeout(() => setPhase("out"), TIMINGS.out);
    const t4 = setTimeout(() => onDoneRef.current(), TIMINGS.done);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [open]);

  if (!open) return null;

  const flipped = phase !== "logo";
  const fadingOut = phase === "out";
  const shownName = firstName(winnerName);
  const said = isMe
    ? t("auction.winner.saidMe", "Tu as dit + 🎉")
    : t("auction.winner.said", "{{name}} a dit + 🎉", { name: shownName });

  return (
    <AnimatePresence>
      {!fadingOut && (
        <motion.div
          key="winner-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute inset-0 z-50 grid place-items-center px-6"
          style={{
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            perspective: 1400,
          }}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale: fadingOut ? 0.94 : 1,
              opacity: 1,
              rotateY: flipped ? 180 : 0,
            }}
            transition={{
              scale: { type: "spring", stiffness: 260, damping: 18 },
              opacity: { duration: 0.25 },
              rotateY: { duration: 0.55, ease: [0.32, 0.72, 0, 1] },
            }}
            className="relative flex items-center justify-center"
            style={{
              width: "min(78vw, 320px)",
              minHeight: 220,
              transformStyle: "preserve-3d",
            }}
          >
            {/* FRONT — the real KiDi+ logo, transparent, gold glow */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <div
                style={{
                  filter:
                    "drop-shadow(0 12px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 22px oklch(0.82 0.14 85 / 0.45))",
                }}
              >
                <Logo size={112} />
              </div>
            </div>

            {/* BACK — winner card, no heavy background, just polished text */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              {/* Avatar in gold ring */}
              <div
                className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full"
                style={{
                  padding: 3,
                  background:
                    "linear-gradient(135deg, oklch(0.9 0.14 90), oklch(0.7 0.16 70))",
                  boxShadow:
                    "0 10px 24px rgba(0,0,0,0.5), 0 0 18px oklch(0.82 0.14 85 / 0.5)",
                }}
              >
                {winnerAvatarUrl ? (
                  <img
                    src={winnerAvatarUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center rounded-full text-[28px] font-black"
                    style={{
                      background: "oklch(0.16 0.05 260)",
                      color: "oklch(0.9 0.14 90)",
                    }}
                  >
                    {(shownName[0] ?? "?").toUpperCase()}
                  </div>
                )}
              </div>

              {/* Display name — tasteful, single line, ellipsized */}
              <p
                className="max-w-[60vw] truncate text-white"
                style={{
                  fontSize: "clamp(20px, 5vw, 24px)",
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                }}
              >
                {winnerName ?? "—"}
              </p>

              {/* Gold accent line */}
              <p
                className="italic"
                style={{
                  fontSize: "clamp(15px, 3.6vw, 18px)",
                  fontWeight: 700,
                  background:
                    "linear-gradient(180deg, oklch(0.94 0.12 90), oklch(0.74 0.16 75))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  textShadow: "0 2px 8px rgba(0,0,0,0.35)",
                }}
              >
                {said}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
