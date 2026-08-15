import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clampPosterTransform,
  DEFAULT_POSTER_TRANSFORM,
  type PosterMode,
  type PosterTransform,
} from "@/lib/filters/live-effects-compositor";

export type LiveEffectsState = {
  backgroundUrl: string | null;
  posterUrl: string | null;
  posterMode: PosterMode;
  posterTransform: PosterTransform;
  hasEffects: boolean;
  setBackgroundFile: (file: File | null) => void;
  setPosterFile: (file: File | null, mode: PosterMode) => void;
  setPosterTransform: (t: PosterTransform) => void;
  clearBackground: () => void;
  clearPoster: () => void;
  clearAll: () => void;
};

const LiveEffectsContext = createContext<LiveEffectsState | null>(null);

function revoke(url: string | null) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export function LiveEffectsProvider({ children }: { children: ReactNode }) {
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterMode, setPosterMode] = useState<PosterMode>("off");
  const [posterTransform, setPosterTransformState] = useState<PosterTransform>(
    DEFAULT_POSTER_TRANSFORM.cover,
  );
  const bgRef = useRef<string | null>(null);
  const posterRef = useRef<string | null>(null);

  const setBackgroundFile = useCallback((file: File | null) => {
    revoke(bgRef.current);
    if (!file) {
      bgRef.current = null;
      setBackgroundUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    bgRef.current = url;
    setBackgroundUrl(url);
  }, []);

  const setPosterFile = useCallback((file: File | null, mode: PosterMode) => {
    revoke(posterRef.current);
    if (!file || mode === "off") {
      posterRef.current = null;
      setPosterUrl(null);
      setPosterMode("off");
      return;
    }
    const url = URL.createObjectURL(file);
    posterRef.current = url;
    setPosterUrl(url);
    setPosterMode(mode);
    setPosterTransformState(
      mode === "side" ? DEFAULT_POSTER_TRANSFORM.side : DEFAULT_POSTER_TRANSFORM.cover,
    );
  }, []);

  const setPosterTransform = useCallback((t: PosterTransform) => {
    setPosterTransformState(clampPosterTransform(t));
  }, []);

  const clearBackground = useCallback(() => setBackgroundFile(null), [setBackgroundFile]);
  const clearPoster = useCallback(() => setPosterFile(null, "off"), [setPosterFile]);
  const clearAll = useCallback(() => {
    clearBackground();
    clearPoster();
  }, [clearBackground, clearPoster]);

  const value = useMemo<LiveEffectsState>(
    () => ({
      backgroundUrl,
      posterUrl,
      posterMode,
      posterTransform,
      hasEffects: !!backgroundUrl || (!!posterUrl && posterMode !== "off"),
      setBackgroundFile,
      setPosterFile,
      setPosterTransform,
      clearBackground,
      clearPoster,
      clearAll,
    }),
    [
      backgroundUrl,
      posterUrl,
      posterMode,
      posterTransform,
      setBackgroundFile,
      setPosterFile,
      setPosterTransform,
      clearBackground,
      clearPoster,
      clearAll,
    ],
  );

  return <LiveEffectsContext.Provider value={value}>{children}</LiveEffectsContext.Provider>;
}

const EMPTY: LiveEffectsState = {
  backgroundUrl: null,
  posterUrl: null,
  posterMode: "off",
  posterTransform: DEFAULT_POSTER_TRANSFORM.cover,
  hasEffects: false,
  setBackgroundFile: () => {},
  setPosterFile: () => {},
  setPosterTransform: () => {},
  clearBackground: () => {},
  clearPoster: () => {},
  clearAll: () => {},
};

export function useLiveEffects(): LiveEffectsState {
  return useContext(LiveEffectsContext) ?? EMPTY;
}
