import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

/** Top dock for the two camera boxes — leaves the lower screen for chat / likes. */
export const BATTLE_VIDEO_DOCK_STYLE = {
  top: "calc(env(safe-area-inset-top, 0px) + 124px)",
  height: "min(36dvh, 300px)",
} as const;

export const BATTLE_CARD_ROW_STYLE = {
  top: "calc(env(safe-area-inset-top, 0px) + 124px + min(36dvh, 300px) + 6px)",
  height: 76,
} as const;

/** Vertical glow + gold “Défi Plus” badge between the two cameras. */
export function BattleSplitDivider() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2">
      <div
        className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, #3b82f6 18%, #93c5fd 50%, #3b82f6 82%, transparent 100%)",
          boxShadow: "0 0 14px 3px rgba(59,130,246,0.55)",
        }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="grid h-11 w-11 place-items-center rounded-full text-center"
          style={{
            background: "linear-gradient(160deg, #f8e08a 0%, #e8b923 42%, #c99212 100%)",
            color: "#1a1408",
            boxShadow:
              "0 0 0 2px rgba(255,236,170,0.55), 0 0 18px 5px rgba(234,179,8,0.38)",
          }}
        >
          <span className="flex flex-col items-center text-[8px] font-black leading-[1.05] tracking-[0.02em]">
            {t("battle.split.vs")
              .split(/\s+/)
              .map((word) => (
                <span key={word}>{word}</span>
              ))}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
