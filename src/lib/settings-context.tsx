import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const DARK_STORAGE_KEY = "kidi-theme-dark";

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

  useEffect(() => {
    const saved = localStorage.getItem(DARK_STORAGE_KEY);
    if (saved !== null) {
      setDarkState(saved === "1");
    }
  }, []);

  const setDark = useCallback((v: boolean) => {
    setDarkState(v);
    try {
      localStorage.setItem(DARK_STORAGE_KEY, v ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, []);

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
