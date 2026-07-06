// Native shell bootstrap: status bar, keyboard, splash, orientation.
// Every call is guarded — no-op in the browser.
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let started = false;

export async function bootstrapNative(): Promise<void> {
  if (started || !isNative()) return;
  started = true;

  // Edge-to-edge status bar.
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await syncStatusBarWithTheme();
  } catch {}

  // Hide splash with a short fade.
  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {}

  // Observe theme changes and mirror to the native status bar.
  if (typeof MutationObserver !== "undefined") {
    const obs = new MutationObserver(() => {
      void syncStatusBarWithTheme();
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}

/** Set status bar icons to match current theme (dark class → light icons). */
export async function syncStatusBarWithTheme(): Promise<void> {
  if (!isNative()) return;
  const dark = document.documentElement.classList.contains("dark");
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {}
}

/** Force light-content status bar (white icons) — for the live viewer. */
export async function pushStatusBarLight(): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    await StatusBar.setStyle({ style: Style.Dark }); // Style.Dark = dark content BG → light icons
  } catch {}
  return () => {
    void syncStatusBarWithTheme();
  };
}

export async function dismissKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    await Keyboard.hide();
  } catch {}
}
