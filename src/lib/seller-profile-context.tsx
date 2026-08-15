import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type SellerProfileTab = "boutique" | "vitrine" | "lives" | "avis";

type Ctx = {
  activeSeller: string | null;
  initialTab: SellerProfileTab | null;
  open: (name: string, tab?: SellerProfileTab) => void;
  close: () => void;
  consumeInitialTab: () => SellerProfileTab | null;
};

const SellerProfileContext = createContext<Ctx | null>(null);

export function SellerProfileProvider({ children }: { children: ReactNode }) {
  const [activeSeller, setActive] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<SellerProfileTab | null>(null);

  const open = useCallback((name: string, tab?: SellerProfileTab) => {
    setInitialTab(tab ?? null);
    setActive(name);
  }, []);

  const close = useCallback(() => {
    setActive(null);
    setInitialTab(null);
  }, []);

  const consumeInitialTab = useCallback(() => {
    const t = initialTab;
    if (t) setInitialTab(null);
    return t;
  }, [initialTab]);

  return (
    <SellerProfileContext.Provider
      value={{ activeSeller, initialTab, open, close, consumeInitialTab }}
    >
      {children}
    </SellerProfileContext.Provider>
  );
}

export function useSellerProfile(): Ctx {
  const v = useContext(SellerProfileContext);
  if (!v) throw new Error("useSellerProfile must be used within SellerProfileProvider");
  return v;
}
