// Contexte global du filtre actif pendant setup/live.
//
// Le host choisit une lens dans le carrousel ; l'aperçu vidéo (broadcast-video)
// lit `activeLens.webPreview` et l'applique en CSS. Sur natif, un plugin
// Camera Kit remplacera la piste MediaStreamTrack avant publication LiveKit —
// le CSS web reste juste comme fallback / mode démo.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { LENSES, NONE_LENS, type Lens } from "./lenses-catalog";

type FilterContextValue = {
  activeLens: Lens;
  setActiveLens: (lens: Lens) => void;
  clearLens: () => void;
  /** Chaîne CSS `filter:` prête à coller sur un <video>. `"none"` = pas de filtre. */
  cssFilter: string;
  lenses: Lens[];
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [activeLens, setActiveLens] = useState<Lens>(NONE_LENS);

  const value = useMemo<FilterContextValue>(
    () => ({
      activeLens,
      setActiveLens,
      clearLens: () => setActiveLens(NONE_LENS),
      cssFilter: activeLens.webPreview,
      lenses: LENSES,
    }),
    [activeLens],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    // Fallback silencieux : si un composant est monté hors provider (par ex.
    // en test unitaire), on renvoie l'état "aucun filtre" plutôt que crasher.
    return {
      activeLens: NONE_LENS,
      setActiveLens: () => {},
      clearLens: () => {},
      cssFilter: "none",
      lenses: LENSES,
    };
  }
  return ctx;
}
