// Reveal overlay — Whatnot-style.
//
// Two variants share the same lifecycle:
//   - "winner" (default): KiDi+ logo → gold winner card.
//   - "unsold": KiDi+ logo → red "Article non vendu" card.
//
// Animation uses opacity/scale only (no rotateY / backfaceVisibility).
// LiveKit Web Egress Chrome often fails to composite 3D transforms into
// the RTMP frame — which made the reveal invisible on YouTube/Facebook.
//
// Sequence (~5.2s, identical on host + viewers + social egress):
//   0.00-0.70s  KiDi+ logo scales in.
//   0.70-5.00s  Winner / unsold card hold (uppercase name).
//   5.00-5.50s  Fade out, then onDone().
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Frown } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { playAuctionSoldChime } from "@/lib/auction-sold-chime";

type Phase = "logo" | "card" | "out";
export type RevealVariant = "winner" | "unsold";

const TIMINGS_APP = {
  card: 1100,
  out: 5200,
  done: 5700,
} as const;

/** Shorter on social egress so YT/FB delay doesn't leave the reveal over the next item. */
const TIMINGS_SOCIAL = {
  card: 800,
  out: 3200,
  done: 3600,
} as const;

function displayName(full: string | null | undefined): string {
  if (!full) return "—";
  return full.trim().toUpperCase();
}

function firstName(full: string | null | undefined): string {
  if (!full) return "—";
  const trimmed = full.trim();
  const space = trimmed.indexOf(" ");
  const short = space === -1 ? trimmed : trimmed.slice(0, space);
  return short.toUpperCase();
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
  surface = "app",
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
  /** Social egress uses a shorter hold to stay closer to the host. */
  surface?: "app" | "social";
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const timings = surface === "social" ? TIMINGS_SOCIAL : TIMINGS_APP;
  const [phase, setPhase] = useState<Phase>("logo");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(
    winnerAvatarUrl ?? null,
  );

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
    if (variant === "winner") {
      playAuctionSoldChime();
    }
    const t1 = setTimeout(() => setPhase("card"), timings.card);
    const t2 = setTimeout(() => setPhase("out"), timings.out);
    const t3 = setTimeout(() => onDoneRef.current(), timings.done);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // revealKey must re-trigger for every win (same winnerId is common).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revealKey, winnerId, winnerName, variant, surface]);

  useEffect(() => {
    if (!open || !winnerAvatarUrl) return;
    setResolvedAvatar(winnerAvatarUrl);
    setAvatarFailed(false);
  }, [open, winnerAvatarUrl, revealKey]);

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
        if (error || !data?.avatar_url || cancelled) return;
        const url = await resolveAvatarUrl(data.avatar_url);
        if (url && !cancelled) {
          setResolvedAvatar(url);
          setAvatarFailed(false);
        }
      } catch {
        /* best-effort */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, winnerId, variant, revealKey]);

  if (!open) return null;

  const fadingOut = phase === "out";
  const showCard = phase === "card" || phase === "out";
  const shownName = displayName(winnerName);
  const saidName = firstName(winnerName);
  const said = isMe
    ? t("auction.winner.saidMe", "Tu as dit + 🎉")
    : t("auction.winner.said", "{{name}} a dit + 🎉", { name: saidName });

  const isUnsold = variant === "unsold";
  const logoGlow = isUnsold
    ? "drop-shadow(0 12px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 22px oklch(0.7 0.22 25 / 0.5))"
    : "drop-shadow(0 12px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 22px oklch(0.82 0.14 85 / 0.45))";
  const displayAvatar = resolvedAvatar;
  const productLabel = productName?.trim()
    ? productName.trim().toUpperCase()
    : null;

  return (
    <AnimatePresence>
      {!fadingOut && (
        <motion.div
          key="reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute inset-0 z-[60] grid place-items-center px-5"
          style={{
            // Solid overlay only — backdrop-filter often disappears in egress capture.
            background: "rgba(0,0,0,0.78)",
          }}
        >
          <div
            className="relative flex w-full items-center justify-center"
            style={{ maxWidth: 420, minHeight: 320 }}
          >
            {/* Logo beat */}
            <AnimatePresence>
              {!showCard && (
                <motion.div
                  key="logo"
                  initial={{ scale: 0.55, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.08, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ filter: logoGlow }}
                >
                  <Logo size={220} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Winner / unsold card */}
            <AnimatePresence>
              {showCard && (
                <motion.div
                  key="card"
                  initial={{ scale: 0.82, opacity: 0 }}
                  animate={{
                    scale: fadingOut ? 0.94 : 1,
                    opacity: 1,
                  }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                  className="flex w-full flex-col items-center justify-center gap-3 text-center"
                >
                  {isUnsold ? (
                    <>
                      <div
                        className="grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-full text-white"
                        style={{
                          padding: 3,
                          background:
                            "linear-gradient(135deg, oklch(0.72 0.22 25), oklch(0.55 0.22 25))",
                          boxShadow:
                            "0 12px 28px rgba(0,0,0,0.55), 0 0 22px oklch(0.7 0.22 25 / 0.55)",
                        }}
                      >
                        <div
                          className="grid h-full w-full place-items-center rounded-full"
                          style={{ background: "oklch(0.2 0.06 25)" }}
                        >
                          <Frown size={36} />
                        </div>
                      </div>
                      <p
                        className="max-w-[90vw] text-white"
                        style={{
                          fontSize: "clamp(26px, 7.5vw, 36px)",
                          fontWeight: 900,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          textShadow: "0 3px 16px rgba(0,0,0,0.75)",
                        }}
                      >
                        {t("auction.unsold.title", "Article non vendu")}
                      </p>
                      {productLabel && (
                        <p
                          className="max-w-[90vw] truncate"
                          style={{
                            fontSize: "clamp(15px, 4vw, 19px)",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "oklch(0.9 0.12 25)",
                            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
                          }}
                        >
                          {productLabel}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div
                        className="relative grid h-[100px] w-[100px] place-items-center overflow-hidden rounded-full"
                        style={{
                          padding: 3,
                          background:
                            "linear-gradient(135deg, oklch(0.9 0.14 90), oklch(0.7 0.16 70))",
                          boxShadow:
                            "0 12px 28px rgba(0,0,0,0.55), 0 0 22px oklch(0.82 0.14 85 / 0.55)",
                        }}
                      >
                        <div
                          className="absolute inset-[3px] grid place-items-center rounded-full text-[34px] font-black"
                          style={{
                            background: "oklch(0.16 0.05 260)",
                            color: "oklch(0.9 0.14 90)",
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
                            }}
                          />
                        )}
                        {displayAvatar && !avatarFailed && (
                          <img
                            src={displayAvatar}
                            alt=""
                            className="pointer-events-none absolute h-0 w-0 opacity-0"
                            onError={() => setAvatarFailed(true)}
                          />
                        )}
                      </div>
                      <span
                        className="rounded-full px-4 py-1.5 text-[13px] font-black uppercase tracking-[0.18em]"
                        style={{
                          background:
                            "linear-gradient(135deg, oklch(0.9 0.14 90), oklch(0.75 0.16 75))",
                          color: "#10162B",
                          boxShadow: "0 8px 20px oklch(0.8 0.14 85 / 0.5)",
                        }}
                      >
                        {t("auction.winner.badge", "Gagnant")}
                      </span>
                      <p
                        className="max-w-[94vw] truncate text-white"
                        style={{
                          fontSize: "clamp(36px, 11vw, 52px)",
                          fontWeight: 900,
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                          textShadow: "0 4px 22px rgba(0,0,0,0.85)",
                        }}
                      >
                        {shownName}
                      </p>
                      {productLabel ? (
                        <p
                          className="max-w-[90vw] truncate"
                          style={{
                            fontSize: "clamp(14px, 3.6vw, 17px)",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            color: "rgba(255,255,255,0.9)",
                            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
                          }}
                        >
                          {productLabel}
                        </p>
                      ) : null}
                      <p
                        className="italic"
                        style={{
                          fontSize: "clamp(16px, 4vw, 20px)",
                          fontWeight: 800,
                          background:
                            "linear-gradient(180deg, oklch(0.94 0.12 90), oklch(0.74 0.16 75))",
                          WebkitBackgroundClip: "text",
                          backgroundClip: "text",
                          color: "transparent",
                        }}
                      >
                        {said}
                      </p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
