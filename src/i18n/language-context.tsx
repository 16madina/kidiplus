import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import i18n, {
  SUPPORTED,
  detectDeviceLanguage,
  type Lang,
} from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const STORAGE_KEY = "kidi.lang";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
};

const LanguageContext = createContext<Ctx | null>(null);

function readStored(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "fr" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function persistLocal(l: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
}

function applyLang(l: Lang) {
  void i18n.changeLanguage(l);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", l);
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Stored choice first, else the browser/device language (fr or en).
  const [lang, setLangState] = useState<Lang>(
    () => readStored() ?? detectDeviceLanguage(),
  );

  const { profile } = useAuth();

  // Apply the initial language once on mount.
  useEffect(() => {
    applyLang(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a signed-in profile resolves, prefer its saved language.
  useEffect(() => {
    const p = profile as (typeof profile & { language?: string }) | null;
    const pl = p?.language;
    if (pl === "fr" || pl === "en") {
      if (pl !== lang) {
        setLangState(pl);
        applyLang(pl);
        persistLocal(pl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const setLang = useCallback<Ctx["setLang"]>(
    async (l) => {
      if (!(SUPPORTED as readonly string[]).includes(l)) return;
      setLangState(l);
      applyLang(l);
      persistLocal(l);
      // Best-effort sync to the profile when signed in.
      if (profile?.id) {
        try {
          await supabase
            .from("profiles")
            // language column is not yet in generated types; cast safely
            .update({ language: l } as unknown as never)
            .eq("id", profile.id);
        } catch {
          /* ignore */
        }
      }
    },
    [profile?.id],
  );

  const value = useMemo<Ctx>(() => ({ lang, setLang }), [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): Ctx {
  const v = useContext(LanguageContext);
  if (!v) throw new Error("useLanguage must be used within LanguageProvider");
  return v;
}
