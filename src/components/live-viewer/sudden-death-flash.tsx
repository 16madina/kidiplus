// Sudden-death / anti-snipe flash — a short pulsing badge shown to everyone
// when the auction deadline is extended by a last-second bid.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function SuddenDeathFlash({ tick }: { tick: number }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (tick === 0) return;
    setShow(true);
    const to = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(to);
  }, [tick]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={tick}
          initial={{ opacity: 0, y: -14, scale: 0.88 }}
          animate={{ opacity: [1, 1, 0.92, 1], y: 0, scale: [1, 1.06, 1] }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute left-1/2 top-28 z-50 -translate-x-1/2 rounded-full px-6 py-3 text-[16px] font-black tracking-tight"
          style={{
            background: "linear-gradient(135deg, oklch(0.9 0.15 85), oklch(0.72 0.17 70))",
            color: "#10162B",
            boxShadow: "0 16px 40px oklch(0.78 0.14 85 / 0.65)",
          }}
        >
          {t("auction.suddenDeath.flash", "⚡ Mort subite — enchère prolongée !")}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
