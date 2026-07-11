// Reveal overlay — Whatnot-style.
//
// Two variants share the same lifecycle:
//   - "winner" (default): KiDi+ logo → flip → gold winner card.
//   - "unsold": KiDi+ logo → flip → red "Article non vendu" card.
//
// Sequence (~3.2s, identical on host + viewers):
//   0.00-0.60s  KiDi+ logo scales in (spring).
//   0.60-1.00s  3D flip (rotateY) → reveal card.
//   1.00-2.80s  Hold.
//   2.80-3.20s  Fade + slight scale down, then onDone().
//
// Dismissal is driven by a single setTimeout scheduled on mount and cleaned up
// on unmount. `onDone` is stored in a ref so parent re-renders do NOT re-run
// the timer effect.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Frown } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";

type Phase = "logo" | "flip" | "hold" | "out";
export type RevealVariant = "winner" | "unsold";

const TIMINGS = {
  flip: 600,
  hold: 1000,
  out: 2800,
  done: 3200,
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
  winnerId,
  winnerAvatarUrl,
  isMe = false,
  variant = "winner",
  productName,
  revealKey,
  onDone,
}: {
  open: boolean;
  winnerName: string | null;
  winnerId?: string | null;
  winnerAvatarUrl?: string | null;
  isMe?: boolean;
  variant?: RevealVariant;
  productName?: string | null;
  /** Unique per auction end — remounts the animation even if same winner. */
  revealKey?: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("logo");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(winnerAvatarUrl ?? null);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!open) {
      setPhase("logo");
      setAvatarFailed(false);
      setResolvedAvatar(null);
      return;
    }
    setPhase("logo");
    setAvatarFailed(false);
    setResolvedAvatar(winnerAvatarUrl ?? null);
    console.debug("[winner-reveal diag] open", {
      variant,
      winnerName,
      winnerId,
      revealKey,
      winnerAvatarUrl,
      hasUrl: !!winnerAvatarUrl,
    });
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
    // revealKey must re-trigger for every win (same winnerId is common).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revealKey, winnerId, winnerName, variant]);

  // Accept late-arriving signed URLs from the parent without resetting timers.
  useEffect(() => {
    if (!open || !winnerAvatarUrl) return;
    setResolvedAvatar(winnerAvatarUrl);
    setAvatarFailed(false);
  }, [open, winnerAvatarUrl, revealKey]);

  // Self-heal avatar: resolve from profiles on mount / when winner changes.
  useEffect(() => {
    if (!open || variant !== "winner" || !winnerId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", winnerId)
          .maybeSingle();
        if (error) {
          console.debug("[winner-reveal diag] profile fetch error", error);
        }
        if (!data?.avatar_url || cancelled) return;
        const url = await resolveAvatarUrl(data.avatar_url);
        console.debug("[winner-reveal diag] resolved avatar", {
          path: data.avatar_url,
          hasUrl: !!url,
        });
        if (url && !cancelled) {
          setResolvedAvatar(url);
          setAvatarFailed(false);
        }
      } catch (e) {
        console.debug("[winner-reveal diag] avatar resolve failed", e);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, winnerId, variant, revealKey]);

  if (!open) return null;

  const flipped = phase !== "logo";
  const fadingOut = phase === "out";
  const shownName = firstName(winnerName);
  const said = isMe
    ? t("auction.winner.saidMe", "Tu as dit + 🎉")
    : t("auction.winner.said", "{{name}} a dit + 🎉", { name: shownName });

  const isUnsold = variant === "unsold";
  const logoGlow = isUnsold
    ? "drop-shadow(0 12px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 22px oklch(0.7 0.22 25 / 0.5))"
    : "drop-shadow(0 12px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 22px oklch(0.82 0.14 85 / 0.45))";
  const displayAvatar = resolvedAvatar;

  return (
    <AnimatePresence>
      {!fadingOut && (
        <motion.div
          key="reveal"
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
            {/* FRONT — KiDi+ logo */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <div style={{ filter: logoGlow }}>
                <Logo size={112} />
              </div>
            </div>

            {/* BACK — winner or unsold card */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              {isUnsold ? (
                <>
                  <div
                    className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full text-white"
                    style={{
                      padding: 3,
                      background:
                        "linear-gradient(135deg, oklch(0.72 0.22 25), oklch(0.55 0.22 25))",
                      boxShadow:
                        "0 10px 24px rgba(0,0,0,0.5), 0 0 18px oklch(0.7 0.22 25 / 0.5)",
                    }}
                  >
                    <div
                      className="grid h-full w-full place-items-center rounded-full"
                      style={{ background: "oklch(0.2 0.06 25)" }}
                    >
                      <Frown size={32} />
                    </div>
                  </div>
                  <p
                    className="max-w-[70vw] truncate text-white"
                    style={{
                      fontSize: "clamp(20px, 5vw, 24px)",
                      fontWeight: 800,
                      letterSpacing: "-0.01em",
                      textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                    }}
                  >
                    {t("auction.unsold.title", "Article non vendu")}
                  </p>
                  {productName && (
                    <p
                      className="max-w-[70vw] truncate"
                      style={{
                        fontSize: "clamp(14px, 3.6vw, 17px)",
                        fontWeight: 600,
                        color: "oklch(0.9 0.12 25)",
                        textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      {productName}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div
                    className="relative grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full"
                    style={{
                      padding: 3,
                      background:
                        "linear-gradient(135deg, oklch(0.9 0.14 90), oklch(0.7 0.16 70))",
                      boxShadow:
                        "0 10px 24px rgba(0,0,0,0.5), 0 0 18px oklch(0.82 0.14 85 / 0.5)",
                    }}
                  >
                    {/* Initials as fallback; photo via background-image — <img>
                        often fails to paint inside rotateY + backface-hidden. */}
                    <div
                      className="absolute inset-[3px] grid place-items-center rounded-full text-[28px] font-black"
                      style={{
                        background: "oklch(0.16 0.05 260)",
                        color: "oklch(0.9 0.14 90)",
                        transform: "translateZ(1px)",
                      }}
                    >
                      {(shownName[0] ?? "?").toUpperCase()}
                    </div>
                    {displayAvatar && !avatarFailed && (
                      <div
                        key={displayAvatar}
                        role="img"
                        aria-hidden
                        className="absolute inset-[3px] z-[1] rounded-full"
                        style={{
                          backgroundImage: `url(${JSON.stringify(displayAvatar)})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          transform: "translateZ(2px)",
                        }}
                        onError={() => setAvatarFailed(true)}
                      />
                    )}
                    {/* Hidden preload to detect broken URLs (div bg can't onError). */}
                    {displayAvatar && !avatarFailed && (
                      <img
                        src={displayAvatar}
                        alt=""
                        className="pointer-events-none absolute h-0 w-0 opacity-0"
                        onError={() => {
                          console.debug("[winner-avatar diag] img error", displayAvatar);
                          setAvatarFailed(true);
                        }}
                      />
                    )}
                  </div>
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
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
