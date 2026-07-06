import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = {
  dark: boolean;
  setDark: (v: boolean) => void;
  notif: boolean;
  setNotif: (v: boolean) => void;
  sounds: boolean;
  setSounds: (v: boolean) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [dark, setDarkState] = useState(false);
  const [notif, setNotif] = useState(true);
  const [sounds, setSounds] = useState(true);

  const setDark = useCallback((v: boolean) => setDarkState(v), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <SettingsContext.Provider value={{ dark, setDark, notif, setNotif, sounds, setSounds }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const v = useContext(SettingsContext);
  if (!v) throw new Error("useSettings must be used within SettingsProvider");
  return v;
}
