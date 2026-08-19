// Short center flash when a new bid lands — host / viewers / social egress.
// Auto-dismisses; parents only bump `pulseKey` when a fresh bid arrives.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export function BidPulseFlash({
  text,
  pulseKey,
}: {
  text: string | null;
  /** Bump on each new bid (e.g. lastBid.ts). */
  pulseKey: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!text || pulseKey === 0) return;
    setShow(true);
    const to = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(to);
  }, [pulseKey, text]);

  return (
    <AnimatePresence>
      {show && text && (
        <motion.div
          key={pulseKey}
          initial={{ opacity: 0, y: -12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute left-1/2 top-[34%] z-[47] max-w-[80%] -translate-x-1/2 truncate rounded-full px-3 py-1.5 text-[12px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.72 0.2 55), oklch(0.58 0.2 35))",
            boxShadow: "0 6px 18px oklch(0.65 0.18 45 / 0.35)",
          }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
