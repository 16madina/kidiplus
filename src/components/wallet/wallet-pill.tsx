// WalletPill — small dark pill with a gold wallet icon and current balance.
// Used in the live viewer top bar and (optionally) in the home header.
// Tapping opens the top-up sheet passed via `onTap`.

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Wallet } from "lucide-react";
import { useEffect, useRef } from "react";
import { Press } from "@/components/press";
import { useWalletSafe } from "@/lib/wallet-context";
import { formatMoneyShort } from "@/lib/money";

export function WalletPill({
  onTap,
  tone = "glass",
}: {
  onTap: () => void;
  /** `glass` = translucent black over video; `solid` = card-style for headers */
  tone?: "glass" | "solid";
}) {
  const { balance, currency } = useWalletSafe();

  // Animated count-up when the balance changes.
  const mv = useMotionValue(balance);
  const prev = useRef(balance);
  useEffect(() => {
    const controls = animate(mv, balance, {
      duration: 0.6,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => {
        prev.current = balance;
      },
    });
    return () => controls.stop();
  }, [balance, mv]);
  const label = useTransform(mv, (v) => formatMoneyShort(v, currency));

  const bumped = balance > prev.current;

  return (
    <Press
      onClick={onTap}
      aria-label={formatMoneyShort(balance, currency)}
      className="!min-h-8 rounded-full px-2.5 py-1"
      style={
        tone === "glass"
          ? {
              backgroundColor: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.08)",
            }
          : {
              backgroundColor: "oklch(0.16 0.01 60)",
              color: "white",
              border: "1px solid var(--border)",
            }
      }
    >
      <motion.span
        animate={bumped ? { scale: [1, 1.15, 1] } : undefined}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="flex items-center gap-1.5 text-[12.5px] font-bold tabular-nums"
      >
        <Wallet size={13} color="#c8a24a" />
        <motion.span>{label}</motion.span>
      </motion.span>
    </Press>
  );
}
