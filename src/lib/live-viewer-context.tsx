import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { LiveStream } from "@/lib/live-mock";

type Ctx = {
  active: LiveStream | null;
  /** Set of real (DB-backed) currently-live streams to cycle through via
   *  vertical swipes. Populated by openList; may be empty. */
  playlist: LiveStream[];
  /** Whether the cycle can advance in either direction. */
  hasNext: boolean;
  hasPrev: boolean;
  open: (s: LiveStream) => void;
  /** Open a live and remember the surrounding list so viewers can swipe
   *  vertically between currently-live streams (TikTok / Whatnot style).
   *  Non-real streams (no liveId) are filtered out of the swipe list so we
   *  never try to hop to mock content. */
  openList: (list: LiveStream[], index: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
};

const LiveViewerContext = createContext<Ctx | null>(null);

export function LiveViewerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LiveStream | null>(null);
  const [playlist, setPlaylist] = useState<LiveStream[]>([]);
  const cursorRef = useRef<number>(-1);

  const open = useCallback((s: LiveStream) => {
    setActive(s);
    setPlaylist([]);
    cursorRef.current = -1;
  }, []);

  const openList = useCallback((list: LiveStream[], index: number) => {
    // Only real DB lives can be reconnected — mock streams have no roomName
    // wired to a real LiveKit room, so skip them.
    const real = list.filter((s) => !!s.liveId && !!s.roomName);
    const target = list[index] ?? null;
    if (!target) return;
    if (target.liveId && target.roomName) {
      setPlaylist(real);
      cursorRef.current = real.findIndex((s) => s.id === target.id);
    } else {
      setPlaylist([]);
      cursorRef.current = -1;
    }
    setActive(target);
  }, []);

  const close = useCallback(() => {
    setActive(null);
    setPlaylist([]);
    cursorRef.current = -1;
  }, []);

  const step = useCallback((delta: number) => {
    const list = playlist;
    const cur = cursorRef.current;
    if (list.length <= 1 || cur < 0) return;
    const nextIdx = cur + delta;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    cursorRef.current = nextIdx;
    setActive(list[nextIdx]);
  }, [playlist]);

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const hasNext = playlist.length > 1 && cursorRef.current >= 0 && cursorRef.current < playlist.length - 1;
  const hasPrev = playlist.length > 1 && cursorRef.current > 0;

  const value = useMemo<Ctx>(
    () => ({ active, playlist, hasNext, hasPrev, open, openList, close, next, prev }),
    [active, playlist, hasNext, hasPrev, open, openList, close, next, prev],
  );

  return <LiveViewerContext.Provider value={value}>{children}</LiveViewerContext.Provider>;
}

export function useLiveViewer(): Ctx {
  const v = useContext(LiveViewerContext);
  if (!v) throw new Error("useLiveViewer must be used within LiveViewerProvider");
  return v;
}
