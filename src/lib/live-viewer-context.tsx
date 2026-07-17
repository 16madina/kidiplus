import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LiveStream } from "@/lib/live-mock";
import { fetchActiveLives } from "@/lib/lives-db";
import { logLiveInteraction } from "@/lib/interactions-db";

/** Full-screen live vs in-app floating mini player (keeps session alive). */
export type LiveViewerPresentation = "full" | "minimized";

type Ctx = {
  active: LiveStream | null;
  playlist: LiveStream[];
  hasNext: boolean;
  hasPrev: boolean;
  peekNext: LiveStream | null;
  peekPrev: LiveStream | null;
  /** full = immersive overlay; minimized = floating mini player over tabs */
  presentation: LiveViewerPresentation;
  open: (s: LiveStream) => void;
  openList: (list: LiveStream[], index: number) => void;
  close: () => void;
  minimize: () => void;
  expand: () => void;
  next: () => void;
  prev: () => void;
};

const LiveViewerContext = createContext<Ctx | null>(null);

export function LiveViewerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LiveStream | null>(null);
  const [playlist, setPlaylist] = useState<LiveStream[]>([]);
  const [presentation, setPresentation] = useState<LiveViewerPresentation>("full");
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

  /**
   * Refresh real lives from DB without wiping the home-feed playlist.
   * Previously we replaced the list with DB-only rows, so opening one real
   * live dropped all demo/sample cards and left a single-item playlist
   * (no vertical swipe). Keep seed order; update/drop ended real lives.
   */
  const refreshPlaylistFromDb = useCallback(async (
    target: LiveStream,
    seedList?: LiveStream[],
  ) => {
    if (!target.liveId || !target.roomName) return;
    try {
      const rows = await fetchActiveLives(60);
      if (!seedList?.length) {
        setPlaylistFromList(rows, target);
        return;
      }
      const byLiveId = new Map(
        rows.filter((r) => r.liveId).map((r) => [r.liveId!, r]),
      );
      const merged: LiveStream[] = [];
      const seen = new Set<string>();
      for (const s of seedList) {
        if (s.liveId) {
          const fresh = byLiveId.get(s.liveId);
          if (!fresh) continue;
          merged.push(fresh);
          seen.add(s.liveId);
        } else {
          merged.push(s);
        }
      }
      for (const r of rows) {
        if (r.liveId && !seen.has(r.liveId)) merged.push(r);
      }
      setPlaylistFromList(merged.length ? merged : rows, target);
    } catch (e) {
      console.debug("[pager] refreshPlaylistFromDb failed", e);
    }
  }, [setPlaylistFromList]);

  const open = useCallback((s: LiveStream) => {
    setActive(s);
    setPresentation("full");
    void logLiveInteraction(s, "click");
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
    setPresentation("full");
    void logLiveInteraction(target, "click");
    setPlaylistFromList(list, target);
    // Refresh real rows in place — keep samples so swipe next/prev still works.
    if (target.liveId && target.roomName) void refreshPlaylistFromDb(target, list);
  }, [setPlaylistFromList, refreshPlaylistFromDb]);

  const close = useCallback(() => {
    setActive(null);
    setPlaylist([]);
    setPresentation("full");
    cursorRef.current = -1;
  }, []);

  const minimize = useCallback(() => {
    setPresentation("minimized");
  }, []);

  const expand = useCallback(() => {
    setPresentation("full");
  }, []);

  const step = useCallback((delta: number) => {
    const list = playlist;
    const cur = cursorRef.current;
    if (list.length <= 1 || cur < 0) return;
    const nextIdx = cur + delta;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    cursorRef.current = nextIdx;
    setActive(list[nextIdx]);
    setPresentation("full");
  }, [playlist]);

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const hasNext = playlist.length > 1 && cursorRef.current >= 0 && cursorRef.current < playlist.length - 1;
  const hasPrev = playlist.length > 1 && cursorRef.current > 0;
  const peekNext = hasNext ? playlist[cursorRef.current + 1] : null;
  const peekPrev = hasPrev ? playlist[cursorRef.current - 1] : null;

  // While a live is mounted full-screen, disable body overscroll so iOS
  // Safari doesn't eat vertical pan gestures at the pager level.
  useEffect(() => {
    if (!active || presentation !== "full") return;
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    return () => { document.body.style.overscrollBehavior = prev; };
  }, [active, presentation]);

  const value = useMemo<Ctx>(
    () => ({
      active,
      playlist,
      hasNext,
      hasPrev,
      peekNext,
      peekPrev,
      presentation,
      open,
      openList,
      close,
      minimize,
      expand,
      next,
      prev,
    }),
    [
      active,
      playlist,
      hasNext,
      hasPrev,
      peekNext,
      peekPrev,
      presentation,
      open,
      openList,
      close,
      minimize,
      expand,
      next,
      prev,
    ],
  );

  return <LiveViewerContext.Provider value={value}>{children}</LiveViewerContext.Provider>;
}

export function useLiveViewer(): Ctx {
  const v = useContext(LiveViewerContext);
  if (!v) throw new Error("useLiveViewer must be used within LiveViewerProvider");
  return v;
}
