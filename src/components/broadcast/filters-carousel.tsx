// Carrousel horizontal de lenses/filtres, style Snapchat / TikTok.
// S'ouvre depuis un bouton (setup + live) et s'affiche en bas de l'écran.
//
// Sélection = tap sur la vignette. Le filtre s'applique instantanément à la
// caméra locale (via le FilterContext). Un bouton croix ferme le carrousel ;
// le filtre reste actif tant que le host ne repasse pas sur "Aucun".

import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { useFilter } from "@/lib/filters/filter-context";
import type { Lens } from "@/lib/filters/lenses-catalog";

const GOLD = "oklch(0.85 0.18 90)";

export type FiltersCarouselProps = {
  open: boolean;
  onClose: () => void;
};

export function FiltersCarousel({ open, onClose }: FiltersCarouselProps) {
  const { lenses, activeLens, setActiveLens } = useFilter();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 px-3 pb-6 pt-3"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white">Filtres</span>
              <span className="text-[11px] text-white/60">
                {activeLens.lensId === "none" ? "Aucun" : activeLens.name}
              </span>
            </div>
            <Press
              onClick={() => {
                haptic.selection();
                onClose();
              }}
              aria-label="Fermer les filtres"
              className="!min-h-8 !min-w-8 h-8 w-8 rounded-full text-white grid place-items-center"
              style={{
                backgroundColor: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <X size={14} />
            </Press>
          </div>

          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {lenses.map((lens) => (
              <LensTile
                key={lens.lensId}
                lens={lens}
                active={lens.lensId === activeLens.lensId}
                onSelect={() => {
                  haptic.selection();
                  setActiveLens(lens);
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LensTile({
  lens,
  active,
  onSelect,
}: {
  lens: Lens;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Press
      onClick={onSelect}
      aria-label={`Filtre ${lens.name}`}
      className="!min-h-16 h-16 w-16 shrink-0 rounded-2xl grid place-items-center relative"
      style={{
        background: active
          ? "oklch(0.85 0.18 90 / 0.18)"
          : "rgba(0,0,0,0.55)",
        border: `2px solid ${active ? GOLD : "rgba(255,255,255,0.14)"}`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[22px] leading-none">{lens.icon}</span>
        <span
          className="text-[9px] font-semibold leading-tight"
          style={{ color: active ? GOLD : "white" }}
        >
          {lens.name}
        </span>
      </div>
      {active && (
        <div
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full grid place-items-center"
          style={{ background: GOLD, color: "#10162B" }}
        >
          <Check size={10} strokeWidth={3} />
        </div>
      )}
    </Press>
  );
}
