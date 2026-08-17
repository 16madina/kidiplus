import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EASE_IOS } from "@/lib/motion";

export function BattleSuddenDeathOverlay({
  active,
  onPickLastItem,
}: {
  active: boolean;
  onPickLastItem?: () => void;
}) {
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
          className="pointer-events-none absolute inset-x-3 z-[67]"
          style={{ top: "calc(env(safe-area-inset-top) + 118px)" }}
        >
          <div
            className="rounded-[20px] px-4 py-3 text-center"
            style={{
              background: "linear-gradient(135deg, oklch(0.9 0.15 85), oklch(0.72 0.17 70))",
              color: "#10162B",
              boxShadow: "0 16px 40px oklch(0.78 0.14 85 / 0.45)",
            }}
          >
            <p className="text-[15px] font-black tracking-tight">{t("battle.sudden.title")}</p>
            <p className="mt-0.5 text-[12px] font-semibold opacity-80">{t("battle.sudden.body")}</p>
            {onPickLastItem && (
              <button
                type="button"
                onClick={onPickLastItem}
                className="pointer-events-auto mt-2 rounded-full bg-[#10162B] px-3 py-1.5 text-[11px] font-bold text-white"
              >
                {t("battle.sudden.pick")}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
