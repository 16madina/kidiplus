// Carrousel horizontal de lenses/filtres, style Snapchat / TikTok.
// S'ouvre depuis un bouton (setup + live) et s'affiche en bas de l'écran.
//
// Sélection = tap sur la vignette. Le filtre s'applique instantanément à la
// caméra locale (via le FilterContext). Un bouton croix ferme le carrousel ;
// le filtre reste actif tant que le host ne repasse pas sur "Aucun".

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, ImagePlus, PanelsTopLeft, UserRound, Aperture } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { useFilter } from "@/lib/filters/filter-context";
import { useLiveEffects } from "@/lib/filters/live-effects-context";
import type { PosterMode } from "@/lib/filters/live-effects-compositor";
import type { Lens } from "@/lib/filters/lenses-catalog";

const GOLD = "oklch(0.85 0.18 90)";

export type FiltersCarouselProps = {
  open: boolean;
  onClose: () => void;
  /** When set, shows a clear done CTA (setup filter try-on). */
  doneLabel?: string;
  /** Extra hint above the strip (e.g. try-on on face). */
  hint?: string;
};

export function FiltersCarousel({ open, onClose, doneLabel, hint }: FiltersCarouselProps) {
  const { t } = useTranslation();
  const {
    lenses,
    activeLens,
    setActiveLens,
    loadLenses,
    refreshLenses,
    lensesLoading,
    lensesError,
  } = useFilter();
  const effects = useLiveEffects();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const posterModeRef = useRef<PosterMode>("cover");

  // Charge les vraies lenses Snap (AR) à la première ouverture du carrousel.
  useEffect(() => {
    if (open) loadLenses();
  }, [open, loadLenses]);

  useEffect(() => {
    if (open && lensesError) {
      toast.error(lensesError, { id: "snap-lenses-error" });
    }
  }, [open, lensesError]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 px-3 pb-6 pt-3"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)",
          }}
        >
          {hint && (
            <p className="mb-2 px-2 text-center text-[12px] font-semibold text-white/85">
              {hint}
            </p>
          )}
          <div className="mb-2 flex items-center justify-between gap-2 px-2">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[13px] font-bold text-white">Filtres</span>
              <Press
                onClick={() => {
                  haptic.selection();
                  refreshLenses();
                }}
                aria-label="Actualiser les filtres AR"
                className="!min-h-7 !min-w-7 h-7 w-7 shrink-0 rounded-full text-white grid place-items-center"
                style={{
                  backgroundColor: "rgba(0,0,0,0.5)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <RefreshCw size={12} className={lensesLoading ? "animate-spin" : undefined} />
              </Press>
              <span className="truncate text-[11px] text-white/60">
                {activeLens.lensId === "none" ? "Aucun" : activeLens.name}
              </span>
            </div>
            <Press
              onClick={() => {
                haptic.selection();
                onClose();
              }}
              aria-label={doneLabel ?? "Fermer les filtres"}
              className={
                doneLabel
                  ? "!min-h-9 h-9 shrink-0 rounded-full px-3.5 text-[12px] font-bold inline-flex items-center gap-1.5"
                  : "!min-h-8 !min-w-8 h-8 w-8 rounded-full text-white grid place-items-center"
              }
              style={
                doneLabel
                  ? {
                      background: GOLD,
                      color: "#10162B",
                    }
                  : {
                      backgroundColor: "rgba(0,0,0,0.5)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }
              }
            >
              {doneLabel ? (
                <>
                  <Check size={14} strokeWidth={3} />
                  {doneLabel}
                </>
              ) : (
                <X size={14} />
              )}
            </Press>
          </div>

          <p className="mb-1 px-1 text-[11px] font-semibold text-white/70">
            {t("broadcast.effects.title", "Fond & poster")}
          </p>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {!effects.backgroundUnavailable && (
              <EffectTile
                label={t("broadcast.effects.blur", "Flou d'arrière-plan")}
                active={effects.backgroundMode === "blur"}
                thumb={null}
                icon={<Aperture size={18} />}
                onClick={() => {
                  haptic.selection();
                  effects.setBackgroundBlur(effects.backgroundMode !== "blur");
                }}
              />
            )}
            <EffectTile
              label={t("broadcast.effects.greenScreen", "Fond personnalisé")}
              active={effects.backgroundMode === "image"}
              thumb={effects.backgroundMode === "image" ? effects.backgroundUrl : null}
              icon={<ImagePlus size={18} />}
              onClick={() => {
                haptic.selection();
                if (effects.backgroundMode === "image") effects.clearBackground();
                else bgInputRef.current?.click();
              }}
            />
            <EffectTile
              label={t("broadcast.effects.posterFace", "Poster")}
              active={!!effects.posterUrl && effects.posterMode === "cover"}
              thumb={effects.posterMode === "cover" ? effects.posterUrl : null}
              icon={<UserRound size={18} />}
              onClick={() => {
                haptic.selection();
                if (effects.posterUrl && effects.posterMode === "cover") {
                  effects.clearPoster();
                  return;
                }
                posterModeRef.current = "cover";
                posterInputRef.current?.click();
              }}
            />
            <EffectTile
              label={t("broadcast.effects.posterSide", "À côté")}
              active={!!effects.posterUrl && effects.posterMode === "side"}
              thumb={effects.posterMode === "side" ? effects.posterUrl : null}
              icon={<PanelsTopLeft size={18} />}
              onClick={() => {
                haptic.selection();
                if (effects.posterUrl && effects.posterMode === "side") {
                  effects.clearPoster();
                  return;
                }
                posterModeRef.current = "side";
                posterInputRef.current?.click();
              }}
            />
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) effects.setBackgroundFile(f);
            }}
          />
          <input
            ref={posterInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) effects.setPosterFile(f, posterModeRef.current);
            }}
          />

          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {lensesLoading && (
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl"
                style={{
                  backgroundColor: "rgba(0,0,0,0.55)",
                  border: "2px solid rgba(255,255,255,0.14)",
                }}
              >
                <Loader2 size={18} className="animate-spin text-white/70" />
              </div>
            )}
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

function EffectTile({
  label,
  active,
  thumb,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  thumb: string | null;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Press
      onClick={onClick}
      aria-label={label}
      className="!min-h-16 h-16 w-16 shrink-0 rounded-2xl grid place-items-center relative"
      style={{
        background: active ? "oklch(0.85 0.18 90 / 0.18)" : "rgba(0,0,0,0.55)",
        border: `2px solid ${active ? GOLD : "rgba(255,255,255,0.14)"}`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 h-full w-full rounded-2xl object-cover"
          draggable={false}
        />
      )}
      <div
        className="relative flex flex-col items-center gap-0.5"
        style={
          thumb
            ? {
                position: "absolute",
                inset: 0,
                justifyContent: "flex-end",
                paddingBottom: 3,
                background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 50%)",
                borderRadius: 14,
              }
            : undefined
        }
      >
        {!thumb && <span className="text-white">{icon}</span>}
        <span
          className="max-w-[60px] truncate text-[9px] font-semibold leading-tight"
          style={{ color: active ? GOLD : "white" }}
        >
          {label}
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
      {lens.iconUrl && (
        <img
          src={lens.iconUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-2xl object-cover"
          draggable={false}
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
        />
      )}
      <div
        className="relative flex flex-col items-center gap-0.5"
        style={
          lens.iconUrl
            ? {
                position: "absolute",
                inset: 0,
                justifyContent: "flex-end",
                paddingBottom: 3,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 45%)",
                borderRadius: 14,
              }
            : undefined
        }
      >
        {!lens.iconUrl && <span className="text-[22px] leading-none">{lens.icon}</span>}
        <span
          className="max-w-[60px] truncate text-[9px] font-semibold leading-tight"
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
