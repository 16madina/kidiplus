import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LiveStream } from "@/lib/live-mock";
import { fetchActiveLives } from "@/lib/lives-db";

type Ctx = {
  active: LiveStream | null;
  playlist: LiveStream[];
  hasNext: boolean;
  hasPrev: boolean;
  peekNext: LiveStream | null;
  peekPrev: LiveStream | null;
  open: (s: LiveStream) => void;
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

  const setPlaylistFromList = useCallback((list: LiveStream[], target: LiveStream) => {
    // Keep the exact visible list when the user taps a card. This includes
    // mock/fictitious streams from the home feed, so the vertical pager can be
    // tested even when no real live is running.
    const visible = list.filter((s) => !!s.id);
    const withTarget = visible.some((s) => s.id === target.id)
      ? visible
      : [target, ...visible];
    setPlaylist(withTarget);
    cursorRef.current = withTarget.findIndex((s) => s.id === target.id);
  }, []);

  const refreshPlaylistFromDb = useCallback(async (target: LiveStream) => {
    if (!target.liveId || !target.roomName) return;
    try {
      const rows = await fetchActiveLives(60);
      setPlaylistFromList(rows, target);
    } catch (e) {
      console.debug("[pager] refreshPlaylistFromDb failed", e);
    }
  }, [setPlaylistFromList]);

  const open = useCallback((s: LiveStream) => {
    setActive(s);
    // Seed a single-item playlist so downstream code has a stable cursor;
    // then top up with the ambient list of currently-live streams so the
    // vertical pager works even when the entry point didn't provide a list
    // (search results, seller profile, deep links, etc.).
    if (s.liveId && s.roomName) {
      setPlaylist([s]);
      cursorRef.current = 0;
      void refreshPlaylistFromDb(s);
    } else {
      setPlaylist([s]);
      cursorRef.current = 0;
    }
  }, [refreshPlaylistFromDb]);

  const openList = useCallback((list: LiveStream[], index: number) => {
    const target = list[index] ?? null;
    if (!target) return;
    setActive(target);
    setPlaylistFromList(list, target);
    // Refresh with fresh DB data so the swipe list stays accurate even if
    // the caller passed a stale filtered array.
    if (target.liveId && target.roomName) void refreshPlaylistFromDb(target);
  }, [setPlaylistFromList, refreshPlaylistFromDb]);

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

  // While a live is mounted, disable body overscroll so iOS Safari doesn't
  // eat vertical pan gestures at the pager level.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    return () => { document.body.style.overscrollBehavior = prev; };
  }, [active]);

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
