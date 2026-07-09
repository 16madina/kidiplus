// Compact horizontal chip strip for camera filters.
// Anchors just below the tool rail, above the featured card.
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { FILTER_LABELS_FR, FILTER_LABELS_EN, type FilterKey } from "@/lib/camera-filter-pipeline";

const ORDER: FilterKey[] = ["none", "bright", "warm", "soft", "bw", "vivid"];

export function FilterPicker({
  open,
  active,
  onPick,
}: {
  open: boolean;
  active: FilterKey;
  onPick: (k: FilterKey) => void;
}) {
  const { i18n } = useTranslation();
  const labels = i18n.language.startsWith("en") ? FILTER_LABELS_EN : FILTER_LABELS_FR;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-auto absolute right-16 z-30 flex max-w-[70vw] gap-2 overflow-x-auto rounded-full px-2 py-1.5"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {ORDER.map((k) => {
            const isActive = k === active;
            return (
              <Press
                key={k}
                onClick={() => { haptic.selection(); onPick(k); }}
                hapticOnTap={false}
                className="!min-h-8 shrink-0 rounded-full px-3 text-[11px] font-bold"
                style={{
                  backgroundColor: isActive ? "oklch(0.85 0.18 90)" : "rgba(255,255,255,0.14)",
                  color: isActive ? "#10162B" : "white",
                  outline: isActive ? "2px solid oklch(0.9 0.18 90)" : undefined,
                  outlineOffset: -2,
                }}
              >
                {labels[k]}
              </Press>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
