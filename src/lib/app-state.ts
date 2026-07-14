// Foreground/background hook. Uses Capacitor App plugin on native,
// falls back to document visibilitychange on the web.
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App, type AppState } from "@capacitor/app";

function nativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function useAppActive(): boolean {
  const [active, setActive] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  useEffect(() => {
    if (nativePlatform()) {
      let handle: { remove: () => void } | null = null;
      // Sync once — listener alone misses the initial Capacitor state.
      void App.getState()
        .then((s: AppState) => setActive(s.isActive))
        .catch(() => {});
      App.addListener("appStateChange", (s: AppState) => {
        setActive(s.isActive);
      }).then((h) => {
        handle = h;
      });
      return () => {
        handle?.remove();
      };
    }
    const onVis = () => setActive(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return active;
}
