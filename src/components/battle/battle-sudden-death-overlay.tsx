import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EASE_IOS } from "@/lib/motion";

export function BattleSuddenDeathOverlay({ active }: { active: boolean }) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="defi-plus-sudden"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: EASE_IOS }}
          className="pointer-events-none absolute inset-x-0 z-[67] flex justify-center px-3"
          style={{ top: "calc(env(safe-area-inset-top) + 104px)" }}
        >
          <div
            className="max-w-[86%] truncate rounded-full px-3 py-1 text-center"
            style={{
              background: "linear-gradient(135deg, oklch(0.9 0.15 85), oklch(0.72 0.17 70))",
              color: "#10162B",
              boxShadow: "0 6px 18px oklch(0.78 0.14 85 / 0.35)",
            }}
          >
            <span className="text-[11px] font-black tracking-tight">⚡ {t("battle.sudden.title")}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
