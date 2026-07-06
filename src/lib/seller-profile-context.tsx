import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Ctx = {
  activeSeller: string | null;
  open: (name: string) => void;
  close: () => void;
};

const SellerProfileContext = createContext<Ctx | null>(null);

export function SellerProfileProvider({ children }: { children: ReactNode }) {
  const [activeSeller, setActive] = useState<string | null>(null);
  const open = useCallback((name: string) => setActive(name), []);
  const close = useCallback(() => setActive(null), []);
  return (
    <SellerProfileContext.Provider value={{ activeSeller, open, close }}>
      {children}
    </SellerProfileContext.Provider>
  );
}

export function useSellerProfile(): Ctx {
  const v = useContext(SellerProfileContext);
  if (!v) throw new Error("useSellerProfile must be used within SellerProfileProvider");
  return v;
}
