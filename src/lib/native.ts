// Native shell bootstrap: status bar, keyboard, splash, orientation, share.
// Every call is guarded — no-op in the browser.
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Share } from "@capacitor/share";


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

  // NOTE: We do NOT hide the native splash here anymore. The React
  // <SplashScreen> component calls `hideNativeSplash()` only once the
  // splash video is actually painting its first frame — this eliminates
  // the white flash between the native splash and the video.


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

