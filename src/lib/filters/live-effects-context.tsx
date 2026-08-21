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
  type BackgroundMode,
  type PosterMode,
  type PosterTransform,
} from "@/lib/filters/live-effects-compositor";

export type LiveEffectsState = {
  backgroundUrl: string | null;
  backgroundMode: BackgroundMode;
  backgroundUnavailable: boolean;
  posterUrl: string | null;
  posterMode: PosterMode;
  posterTransform: PosterTransform;
  hasEffects: boolean;
  setBackgroundFile: (file: File | null) => void;
  setBackgroundBlur: (on: boolean) => void;
  markBackgroundUnavailable: () => void;
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
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("none");
  const [backgroundUnavailable, setBackgroundUnavailable] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterMode, setPosterMode] = useState<PosterMode>("off");
  const [posterTransform, setPosterTransformState] = useState<PosterTransform>(
    DEFAULT_POSTER_TRANSFORM,
  );
  const bgRef = useRef<string | null>(null);
  const posterRef = useRef<string | null>(null);

  const setBackgroundFile = useCallback((file: File | null) => {
    revoke(bgRef.current);
    if (!file) {
      bgRef.current = null;
      setBackgroundUrl(null);
      setBackgroundMode((m) => (m === "image" ? "none" : m));
      return;
    }
    const url = URL.createObjectURL(file);
    bgRef.current = url;
    setBackgroundUrl(url);
    setBackgroundMode("image");
  }, []);

  const setBackgroundBlur = useCallback((on: boolean) => {
    setBackgroundMode(on ? "blur" : "none");
    if (on) {
      revoke(bgRef.current);
      bgRef.current = null;
      setBackgroundUrl(null);
    }
  }, []);

  const markBackgroundUnavailable = useCallback(() => {
    setBackgroundUnavailable(true);
    setBackgroundMode("none");
    revoke(bgRef.current);
    bgRef.current = null;
    setBackgroundUrl(null);
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
    setPosterTransformState(DEFAULT_POSTER_TRANSFORM);
  }, []);

  const setPosterTransform = useCallback((t: PosterTransform) => {
    setPosterTransformState(clampPosterTransform(t));
  }, []);

  const clearBackground = useCallback(() => {
    setBackgroundFile(null);
    setBackgroundMode("none");
  }, [setBackgroundFile]);
  const clearPoster = useCallback(() => setPosterFile(null, "off"), [setPosterFile]);
  const clearAll = useCallback(() => {
    clearBackground();
    clearPoster();
  }, [clearBackground, clearPoster]);

  const value = useMemo<LiveEffectsState>(
    () => ({
      backgroundUrl,
      backgroundMode,
      backgroundUnavailable,
      posterUrl,
      posterMode,
      posterTransform,
      hasEffects:
        backgroundMode !== "none" || (!!posterUrl && posterMode !== "off"),
      setBackgroundFile,
      setBackgroundBlur,
      markBackgroundUnavailable,
      setPosterFile,
      setPosterTransform,
      clearBackground,
      clearPoster,
      clearAll,
    }),
    [
      backgroundUrl,
      backgroundMode,
      backgroundUnavailable,
      setBackgroundBlur,
      markBackgroundUnavailable,
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
  backgroundMode: "none",
  backgroundUnavailable: false,
  posterUrl: null,
  posterMode: "off",
  posterTransform: DEFAULT_POSTER_TRANSFORM,
  hasEffects: false,
  setBackgroundFile: () => {},
  setBackgroundBlur: () => {},
  markBackgroundUnavailable: () => {},
  setPosterFile: () => {},
  setPosterTransform: () => {},
  clearBackground: () => {},
  clearPoster: () => {},
  clearAll: () => {},
};

export function useLiveEffects(): LiveEffectsState {
  return useContext(LiveEffectsContext) ?? EMPTY;
}
