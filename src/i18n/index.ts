import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./fr.json";
import en from "./en.json";

export const SUPPORTED = ["fr", "en"] as const;
export type Lang = (typeof SUPPORTED)[number];

/** Detect an initial language from device settings. Only fr/en supported. */
export function detectDeviceLanguage(): Lang {
  if (typeof navigator === "undefined") return "fr";
  const raw = (navigator.language || "fr").toLowerCase();
  if (raw.startsWith("en")) return "en";
  return "fr";
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng: "fr",
    fallbackLng: "fr",
    supportedLngs: SUPPORTED as unknown as string[],
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key "${key}" for ${JSON.stringify(lngs)}`);
      }
    },
  });
}

export default i18n;
