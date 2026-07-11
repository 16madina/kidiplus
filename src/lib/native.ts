// Native shell bootstrap: status bar, keyboard, splash, orientation, share.
// Every call is guarded — no-op in the browser.
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Share } from "@capacitor/share";


/** True when running inside the Capacitor WebView (iOS / Android). */
export function isNative(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
    // Fallback: SSR bundle can initialize before the native bridge script runs,
    // or the page may have navigated to an allowlisted host where Capacitor
    // reports "web" even though androidBridge / webkit bridge is present.
    if (typeof window !== "undefined") {
      const w = window as Window & {
        androidBridge?: unknown;
        webkit?: { messageHandlers?: { bridge?: unknown } };
      };
      if (w.androidBridge || w.webkit?.messageHandlers?.bridge) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Hide the Capacitor native splash. Called from the React <SplashScreen>
 * as soon as the video's first frame is painted (event: `playing`) so the
 * user never sees the WebView's default white background between the two.
 */
export async function hideNativeSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {}
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

  // If the React <SplashScreen> is going to mount (first time this session)
  // it will call hideNativeSplash() itself when the intro video paints its
  // first frame — that's the seamless path. Otherwise (splash already
  // shown this session, or video failed), hide after a short delay so the
  // app never gets stuck behind the native splash.
  const splashAlreadyShown = (() => {
    try { return window.sessionStorage.getItem("kp:splashShown") === "1"; }
    catch { return false; }
  })();
  if (splashAlreadyShown) {
    void hideNativeSplash();
  } else {
    // Watchdog: hide after 2.5s even if the video never fires 'playing'.
    window.setTimeout(() => { void hideNativeSplash(); }, 2500);
  }




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

/** Open the native OS share sheet (iOS/Android). Falls back to Web Share API or clipboard. */
export async function nativeShare(data: {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}): Promise<void> {
  if (isNative()) {
    try {
      await Share.share(data);
      return;
    } catch {}
  }

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(data);
      return;
    } catch {}
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(data.url || data.text || "");
    } catch {}
  }
}

