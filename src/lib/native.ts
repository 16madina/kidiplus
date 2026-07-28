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
    // Keep native splash until the React intro paints (or this ceiling).
    // Was 2.5s — too short on App Store cold start / cellular, so the
    // navy shell vanished before the video could show.
    window.setTimeout(() => { void hideNativeSplash(); }, 10_000);
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

  // Universal Links / App Links / custom-scheme deep links.
  // - Warm start: `appUrlOpen` (tap a https://kidiplus.com/live/… share while
  //   the app is already running, or kidiplus://… from /open /join bridges).
  // - Cold start: `getLaunchUrl` (app launched from a link while killed).
  // - After install from /download?next=…: resume `kidi.pending_path`.
  // OAuth still lands on /auth-callback via the same path.
  try {
    const { App } = await import("@capacitor/app");
    const { pathFromDeepLinkUrl } = await import("@/lib/deep-links");

    const navigateInApp = (path: string) => {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current === path) return;
      window.location.replace(path);
    };

    const openDeepLink = (rawUrl: string) => {
      const path = pathFromDeepLinkUrl(rawUrl);
      if (!path) return false;
      // Close SFSafariViewController / Chrome Custom Tab if OAuth / PayPal left it open.
      void import("@capacitor/browser").then(({ Browser }) => {
        void Browser.close().catch(() => {});
        setTimeout(() => {
          void Browser.close().catch(() => {});
        }, 350);
      });

      // YouTube OAuth return — stay on current page, refresh connect UI.
      if (path.startsWith("/youtube-connected")) {
        try {
          const u = new URL(path, "https://kidiplus.com");
          const status = u.searchParams.get("status") ?? "ok";
          const channel = u.searchParams.get("channel");
          window.dispatchEvent(
            new CustomEvent("kidi:youtube-connected", {
              detail: {
                ok: status === "ok",
                status,
                channel: channel ?? undefined,
              },
            }),
          );
        } catch {
          /* ignore */
        }
        return true;
      }

      // Facebook OAuth return — stay on current page, refresh connect UI.
      if (path.startsWith("/facebook-connected")) {
        try {
          const u = new URL(path, "https://kidiplus.com");
          const status = u.searchParams.get("status") ?? "ok";
          const page = u.searchParams.get("page");
          window.dispatchEvent(
            new CustomEvent("kidi:facebook-connected", {
              detail: {
                ok: status === "ok" || status === "select_page",
                status,
                page: page ?? undefined,
              },
            }),
          );
        } catch {
          /* ignore */
        }
        return true;
      }

      // PayPal server return — stay on the current WebView page (no reload).
      if (path.startsWith("/paypal-done")) {
        try {
          const u = new URL(path, "https://kidiplus.com");
          const status = u.searchParams.get("status") ?? "ok";
          const amount = u.searchParams.get("amount");
          const currency = u.searchParams.get("currency");
          const duplicate = u.searchParams.get("duplicate") === "1";
          const kind = u.searchParams.get("kind") ?? "topup";
          const orderId = u.searchParams.get("orderId");
          if (kind === "order") {
            sessionStorage.setItem(
              "kidi:paypal_order_done",
              JSON.stringify({ status, orderId, duplicate }),
            );
            void import("@/lib/paypal-checkout-client").then(({ clearPendingPaypalCheckout }) => {
              clearPendingPaypalCheckout();
            });
            window.dispatchEvent(
              new CustomEvent("kidi:paypal-order-done", {
                detail: {
                  ok: status === "ok",
                  status,
                  orderId: orderId ?? undefined,
                  duplicate,
                },
              }),
            );
          } else {
            sessionStorage.setItem(
              "kidi:paypal_done",
              JSON.stringify({ status, amount, currency, duplicate }),
            );
            void import("@/lib/paypal-topup-client").then(({ clearPendingPaypalOrder }) => {
              clearPendingPaypalOrder();
            });
            void import("@/lib/soft-profile-routes").then(({ stashSoftSection, dispatchOpenSection }) => {
              stashSoftSection("wallet");
              dispatchOpenSection("wallet");
            });
            window.dispatchEvent(
              new CustomEvent("kidi:paypal-topup-done", {
                detail: {
                  ok: status === "ok",
                  status,
                  amount: amount != null ? Number(amount) : undefined,
                  currency: currency ?? undefined,
                  duplicate,
                },
              }),
            );
          }
        } catch {
          /* ignore */
        }
        return true;
      }

      navigateInApp(path);
      return true;
    };

    App.addListener("appUrlOpen", (event: { url: string }) => {
      openDeepLink(event.url);
    });

    const launch = await App.getLaunchUrl().catch(() => null);
    if (launch?.url && openDeepLink(launch.url)) {
      try { window.localStorage.removeItem("kidi.pending_path"); } catch { /* ignore */ }
    } else {
      try {
        const pending = window.localStorage.getItem("kidi.pending_path");
        if (pending?.startsWith("/")) {
          window.localStorage.removeItem("kidi.pending_path");
          navigateInApp(pending);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* @capacitor/app not installed — skip */
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

