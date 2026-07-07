import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  immersive: boolean;
  push: () => void;
  pop: () => void;
};

const ImmersiveContext = createContext<Ctx>({
  immersive: false,
  push: () => {},
  pop: () => {},
});

/**
 * Provider tracking whether any full-screen immersive surface (host broadcast,
 * viewer live) is mounted. When immersive > 0, chrome like the bottom tab bar
 * is hidden so nothing overlaps the immersive UI.
 */
export function ImmersiveProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const push = useCallback(() => setCount((c) => c + 1), []);
  const pop = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  return (
    <ImmersiveContext.Provider value={{ immersive: count > 0, push, pop }}>
      {children}
    </ImmersiveContext.Provider>
  );
}

export function useImmersive() {
  return useContext(ImmersiveContext);
}

/** Hook: while mounted (and `active` is true), the app is in immersive mode. */
export function useImmersiveScope(active: boolean = true) {
  const { push, pop } = useImmersive();
  useEffect(() => {
    if (!active) return;
    push();
    return () => pop();
  }, [active, push, pop]);
}
