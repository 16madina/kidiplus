// Contexte global du filtre actif pendant setup/live.
//
// Le host choisit une lens dans le carrousel :
// - Lens Snap (isSnapLens) : le moteur Camera Kit rend le vrai filtre AR.
//   En preview, un canvas remplace le <video> ; en live, un TrackProcessor
//   LiveKit publie la piste filtrée aux viewers.
// - Style CSS : appliqué en `filter:` sur le <video> (et non visible viewers).
//
// Les lenses Snap sont chargées paresseusement depuis le Lens Group KIDI+
// (premier appel à loadLenses — déclenché à l'ouverture du carrousel).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LENSES, NONE_LENS, type Lens } from "./lenses-catalog";
import {
  isCameraKitSupported,
  loadSnapLenses,
  SNAP_LENS_GROUP_ID,
} from "./camera-kit";

type FilterContextValue = {
  activeLens: Lens;
  setActiveLens: (lens: Lens) => void;
  clearLens: () => void;
  /** Chaîne CSS `filter:` prête à coller sur un <video>. `"none"` = pas de filtre CSS. */
  cssFilter: string;
  lenses: Lens[];
  /** Charge les vraies lenses Snap du groupe (no-op si déjà fait). */
  loadLenses: () => void;
  lensesLoading: boolean;
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [activeLens, setActiveLens] = useState<Lens>(NONE_LENS);
  const [snapLenses, setSnapLenses] = useState<Lens[]>([]);
  const [lensesLoading, setLensesLoading] = useState(false);
  const loadStartedRef = useRef(false);

  const loadLenses = useCallback(() => {
    if (loadStartedRef.current || !isCameraKitSupported()) return;
    loadStartedRef.current = true;
    setLensesLoading(true);
    loadSnapLenses()
      .then((lenses) => {
        setSnapLenses(
          lenses.map((l) => ({
            lensId: l.id,
            groupId: l.groupId || SNAP_LENS_GROUP_ID,
            name: l.name || "Lens",
            icon: "✨",
            iconUrl: l.iconUrl || l.preview?.imageUrl || undefined,
            category: "snap" as const,
            webPreview: "none",
            isSnapLens: true,
          })),
        );
      })
      .catch((e) => {
        console.warn("[filters] snap lenses load failed", e);
        loadStartedRef.current = false; // retry possible à la prochaine ouverture
      })
      .finally(() => setLensesLoading(false));
  }, []);

  const value = useMemo<FilterContextValue>(
    () => ({
      activeLens,
      setActiveLens,
      clearLens: () => setActiveLens(NONE_LENS),
      cssFilter: activeLens.isSnapLens ? "none" : activeLens.webPreview,
      // Vraies lenses AR d'abord, puis les styles CSS.
      lenses: [NONE_LENS, ...snapLenses, ...LENSES.filter((l) => l.lensId !== "none")],
      loadLenses,
      lensesLoading,
    }),
    [activeLens, snapLenses, loadLenses, lensesLoading],
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
      loadLenses: () => {},
      lensesLoading: false,
    };
  }
  return ctx;
}
