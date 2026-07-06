import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { LiveStream } from "@/lib/live-mock";

type Ctx = {
  active: LiveStream | null;
  open: (s: LiveStream) => void;
  close: () => void;
};

const LiveViewerContext = createContext<Ctx | null>(null);

export function LiveViewerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<LiveStream | null>(null);
  const open = useCallback((s: LiveStream) => setActive(s), []);
  const close = useCallback(() => setActive(null), []);
  return (
    <LiveViewerContext.Provider value={{ active, open, close }}>
      {children}
    </LiveViewerContext.Provider>
  );
}

export function useLiveViewer(): Ctx {
  const v = useContext(LiveViewerContext);
  if (!v) throw new Error("useLiveViewer must be used within LiveViewerProvider");
  return v;
}
