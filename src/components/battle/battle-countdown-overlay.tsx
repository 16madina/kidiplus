import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EASE_IOS } from "@/lib/motion";
import { BATTLE_BRAND_I18N_KEY } from "@/lib/battle-constants";

export function BattleCountdownOverlay({ remainingMs }: { remainingMs: number }) {
  const { t } = useTranslation();
  const count = Math.max(0, Math.ceil(remainingMs / 1000));
  const visible = remainingMs > 0 && count > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="defi-plus-countdown"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[68] grid place-items-center bg-black/55 px-6"
        >
          <div className="text-center text-white">
            <p className="text-[12px] font-black uppercase tracking-[0.22em] text-[oklch(0.85_0.18_90)]">
              {t(BATTLE_BRAND_I18N_KEY)}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-white/80">
              {t("battle.headline")}
            </p>
            <motion.p
              key={count}
              initial={{ scale: 0.72, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.28, ease: EASE_IOS }}
              className="mt-4 text-[72px] font-black leading-none tabular-nums"
            >
              {count}
            </motion.p>
            <p className="mt-3 text-[14px] font-medium text-white/75">
              {t("battle.countdown.title", { count })}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
