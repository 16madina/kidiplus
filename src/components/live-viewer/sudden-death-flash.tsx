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
    const to = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(to);
  }, [tick]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={tick}
          initial={{ opacity: 0, y: -14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none absolute left-1/2 top-32 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-black tracking-tight"
          style={{
            background: "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.7 0.16 75))",
            color: "#10162B",
            boxShadow: "0 10px 28px oklch(0.78 0.14 85 / 0.55)",
          }}
        >
          {t("auction.suddenDeath.flash", "⚡ Mort subite — enchère prolongée !")}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
