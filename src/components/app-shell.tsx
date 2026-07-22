import { createContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { BottomTabBar } from "./bottom-tab-bar";
import { HomeScreen } from "@/screens/home-screen";
import { SearchScreen } from "@/screens/search-screen";
import { LiveScreen } from "@/screens/live-screen";
import { ActivityScreen } from "@/screens/activity-screen";
import { ProfileScreen } from "@/screens/profile-screen";
import {
  LiveViewerProvider,
  useLiveViewer,
} from "@/lib/live-viewer-context";
import {
  SellerProfileProvider,
  useSellerProfile,
} from "@/lib/seller-profile-context";
import { PUSH_OPEN_EVENT, type PushOpenPayload } from "@/lib/push-router";
import { fetchLiveById } from "@/lib/lives-db";
import { SettingsProvider } from "@/lib/settings-context";
import { PushProvider } from "@/lib/push";
import { PushDeniedBanner } from "@/components/push-denied-banner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/i18n/language-context";
import { WalletProvider } from "@/lib/wallet-context";

import { bootstrapNative } from "@/lib/native";
import { NativeUpdateGate } from "@/components/native-update-gate";
import { LiveViewerScreen } from "./live-viewer/live-viewer-screen";
import { LivePipController } from "./live-viewer/live-pip-controller";
import { SellerProfileScreen } from "./seller-profile/seller-profile-screen";
import { AuthFlow } from "./auth/auth-flow";
import { SplashScreen } from "./splash-screen";
import { EASE_IOS } from "@/lib/motion";
import { ImmersiveProvider, useImmersive } from "@/lib/immersive-context";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import { ModerationBanGate } from "@/components/moderation/moderation-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthPromptProvider } from "@/lib/auth-prompt-context";
import { GuestShell } from "@/components/guest-shell";
import { useInSystemPip } from "@/lib/pip-session";



export type TabKey = "home" | "search" | "live" | "activity" | "profile";

export function AppShell() {
  const [splashDone, setSplashDone] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.sessionStorage.getItem("kp:splashShown") === "1";
    } catch {
      return false;
    }
  });
  const handleSplashDone = () => {
    try {
      window.sessionStorage.setItem("kp:splashShown", "1");
    } catch {
      /* ignore */
    }
    setSplashDone(true);
  };
  return (
    <AuthProvider>
      <LanguageProvider>
        <SettingsProvider>
          <PushProvider>
            <WalletProvider>
              <SellerProfileProvider>
                <LiveViewerProvider>
                  <PushDeniedBanner />
                  <NativeUpdateGate />
                  <AuthGate />
                  <AnimatePresence>
                    {!splashDone && (
                      <SplashScreen onDone={handleSplashDone} />
                    )}
                  </AnimatePresence>
                </LiveViewerProvider>
              </SellerProfileProvider>
            </WalletProvider>
          </PushProvider>
        </SettingsProvider>
      </LanguageProvider>
    </AuthProvider>


  );
}

function AuthGate() {
  const { loading, session, guestMode } = useAuth();
  if (loading) {
    return (
      <div
        className="mx-auto flex h-[100dvh] w-full max-w-xl items-center justify-center bg-background"
        style={{ isolation: "isolate" }}
      >
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }
  // Full app shell for both authenticated users and guests (via the
  // "Continuer en tant qu'invité" opt-in). Guests get read-only surfaces
  // and every write path is intercepted by <AuthPromptProvider>. If neither,
  // fall back to the minimal <GuestShell> which still supports /live/$id
  // deep-links + the AuthFlow underneath.
  const allowShell = !!session || guestMode;
  return (
    <ImmersiveProvider>
      <AuthPromptProvider>
        <AnimatePresence mode="wait">
          {allowShell ? (
            <motion.div
              key="app"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_IOS }}
              className="h-full w-full"
            >
              <AppShellInner />
              {session && <ModerationBanGate>{null}</ModerationBanGate>}
            </motion.div>
          ) : (
            <motion.div
              key="guest"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_IOS }}
              className="h-full w-full"
            >
              <GuestShell />
            </motion.div>
          )}
        </AnimatePresence>
      </AuthPromptProvider>
    </ImmersiveProvider>
  );
}






function AppShellInner() {
  const [active, setActive] = useState<TabKey>("home");
  const {
    active: liveStream,
    close: closeLive,
    open: openLive,
    presentation,
    minimize: minimizeLive,
  } = useLiveViewer();
  const liveFullScreen = !!liveStream && presentation === "full";
  const liveMinimized = !!liveStream && presentation === "minimized";
  const inSystemPip = useInSystemPip();
  const hideTabs = liveFullScreen || inSystemPip;
  const { activeSeller, close: closeSeller, open: openSeller } = useSellerProfile();
  const { immersive } = useImmersive();
  const keyboardOpen = useKeyboardOpen();

  // Native bootstrap (status bar, splash, keyboard, theme sync).
  useEffect(() => {
    void bootstrapNative();
    // Opportunistic cleanup — cancel overdue unpaid auction orders on app load.
    void import("@/lib/lives-db").then((m) => {
      m.expireOverdueOrders().catch(() => 0);
      m.cancelStaleScheduledLives().catch(() => 0);
    });
  }, []);

  // Cross-screen tab navigation (dispatched via CustomEvent "kidi:navigate-tab").
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<TabKey>).detail;
      if (detail && ["home", "search", "live", "activity", "profile"].includes(detail)) {
        setActive(detail);
      }
    };
    window.addEventListener("kidi:navigate-tab", onNav);
    return () => window.removeEventListener("kidi:navigate-tab", onNav);
  }, []);

  // Soft profile URLs (/wallet, /orders, …) stash a section then redirect here.
  // Also resume `kidi.pending_path` on web (native bootstrap already handles Capacitor).
  // Web PayPal return lands on /?paypal_done=1&status=…
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { takeSoftSection, softSectionFromPath, stashSoftSection, dispatchOpenSection } =
        await import("@/lib/soft-profile-routes");
      try {
        const pending = window.localStorage.getItem("kidi.pending_path");
        if (pending?.startsWith("/")) {
          window.localStorage.removeItem("kidi.pending_path");
          const mapped = softSectionFromPath(pending.split("?")[0] ?? pending);
          if (mapped) stashSoftSection(mapped);
        }
      } catch {
        /* ignore */
      }
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.get("paypal_done") === "1") {
          const status = u.searchParams.get("status") ?? "ok";
          sessionStorage.setItem(
            "kidi:paypal_done",
            JSON.stringify({
              status,
              amount: u.searchParams.get("amount"),
              currency: u.searchParams.get("currency"),
              duplicate: u.searchParams.get("duplicate") === "1",
            }),
          );
          stashSoftSection("wallet");
          u.searchParams.delete("paypal_done");
          u.searchParams.delete("status");
          u.searchParams.delete("amount");
          u.searchParams.delete("currency");
          u.searchParams.delete("duplicate");
          u.searchParams.delete("reason");
          window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}` || "/");
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const section = takeSoftSection();
      if (!section) return;
      setActive("profile");
      // Let Profile / Guest mount, then open overlay or auth.
      setTimeout(() => {
        if (!cancelled) dispatchOpenSection(section);
      }, 80);
    };
    void run();
    return () => { cancelled = true; };
  }, []);




  // Deep-link router: reacts to push taps + in-app notification taps.
  useEffect(() => {
    const onOpen = async (e: Event) => {
      const p = (e as CustomEvent<PushOpenPayload>).detail;
      if (!p) return;
      const kind = String(p.kind ?? "notif");
      if (kind === "resume_host_live") {
        setActive("live");
        setTimeout(() => {
          try {
            window.dispatchEvent(
              new CustomEvent("kidi:resume-host-live", {
                detail: { live_id: p.live_id ?? null },
              }),
            );
          } catch {}
        }, 80);
        return;
      }
      if (kind === "chat" && p.thread_id) {
        // Direct message → activity tab, Messages inbox opens the thread.
        setActive("activity");
        setTimeout(() => {
          try {
            window.dispatchEvent(
              new CustomEvent("kidi:open-dm", { detail: { thread_id: p.thread_id } }),
            );
          } catch {}
        }, 80);
        return;
      }
      if (kind === "live" || kind === "chat") {
        if (p.live_id) {
          const stream = await fetchLiveById(p.live_id).catch(() => null);
          if (stream) { openLive(stream); return; }
        }
        setActive("live");
        return;
      }
      if (kind === "order") {
        setActive("activity");
        // Give the tab a tick to mount, then ask activity to open the detail.
        if (p.order_id) {
          setTimeout(() => {
            try {
              window.dispatchEvent(new CustomEvent("kidi:open-order", { detail: { order_id: p.order_id } }));
            } catch {}
          }, 60);
        }
        return;
      }
      if (kind === "seller") {
        if (p.seller_handle) { openSeller(p.seller_handle); return; }
        setActive("profile");
        return;
      }
      if (kind === "home" || kind === "welcome") {
        setActive("home");
        return;
      }
      // Fallback → activity tab.
      setActive("activity");
    };
    window.addEventListener(PUSH_OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(PUSH_OPEN_EVENT, onOpen as EventListener);
  }, [openLive, openSeller]);


  // Android hardware back: full live → mini player; mini → close; else tabs/minimize app.
  useEffect(() => {
    let native = false;
    try {
      native = Capacitor.isNativePlatform();
    } catch {}
    if (!native) return;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (liveFullScreen) {
        minimizeLive();
        return;
      }
      if (liveMinimized) {
        closeLive();
        return;
      }
      if (activeSeller) {
        closeSeller();
        return;
      }
      if (active !== "home") {
        setActive("home");
        return;
      }
      App.minimizeApp().catch(() => {});
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, [liveFullScreen, liveMinimized, activeSeller, active, closeLive, closeSeller, minimizeLive]);

  return (
    <div
      className={
        immersive || liveFullScreen
          ? "relative mx-auto flex h-[100dvh] w-full max-w-none flex-col overflow-hidden bg-background"
          : "relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-background"
      }
      style={{ isolation: "isolate" }}
    >
      <div data-kp-shell-chrome>
      <TabPane visible={active === "home"}>
        <ErrorBoundary boundary="tab_home"><HomeScreen /></ErrorBoundary>
      </TabPane>
      <TabPane visible={active === "search"}>
        <ErrorBoundary boundary="tab_search"><SearchScreen /></ErrorBoundary>
      </TabPane>
      <TabPane visible={active === "live"}>
        <ErrorBoundary boundary="tab_live"><LiveScreen /></ErrorBoundary>
      </TabPane>
      <TabPane visible={active === "activity"}>
        <ErrorBoundary boundary="tab_activity"><ActivityScreen /></ErrorBoundary>
      </TabPane>
      <TabPane visible={active === "profile"}>
        <ErrorBoundary boundary="tab_profile"><ProfileScreen /></ErrorBoundary>
      </TabPane>
      </div>

      {!immersive && !hideTabs && !keyboardOpen && (
        <div data-kp-shell-chrome>
          <BottomTabBar active={active} onChange={setActive} />
        </div>
      )}

      {/* Under the live only — must stay inside this stacking context (never on body). */}
      {inSystemPip && (
        <div
          className="pointer-events-none absolute inset-0 z-[50] bg-black"
          aria-hidden
        />
      )}

      <AnimatePresence>
        {liveStream && (
          <ErrorBoundary boundary="live_viewer" onReset={closeLive}>
            <LiveViewerScreen />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      <LivePipController />

      <AnimatePresence>
        {activeSeller && (
          <ErrorBoundary boundary="seller_profile" onReset={closeSeller}>
            <SellerProfileScreen />
          </ErrorBoundary>
        )}
      </AnimatePresence>


      <Toaster
        position="top-center"
        // Sonner uses `mobileOffset` below 600px (phones) and ignores `offset`.
        // Keep toasts below the home header (safe-area + ~56px bar).
        offset={{ top: "calc(env(safe-area-inset-top) + 56px + 12px)" }}
        mobileOffset={{ top: "calc(env(safe-area-inset-top) + 56px + 12px)" }}
        duration={3000}
        visibleToasts={3}
        toastOptions={{
          unstyled: false,
          classNames: {
            toast:
              "!bg-background/80 !text-foreground !border !border-border !shadow-lg !rounded-2xl !backdrop-blur-xl",
            title: "!text-[14px] !font-semibold",
            description: "!text-muted-foreground !text-[12px]",
          },
          style: {
            backdropFilter: "saturate(180%) blur(20px)",
            WebkitBackdropFilter: "saturate(180%) blur(20px)",
          },
        }}
      />
    </div>
  );
}

export const TabVisibilityContext = createContext<boolean>(true);

function TabPane({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <TabVisibilityContext.Provider value={visible}>
      <div
        aria-hidden={!visible}
        className="absolute inset-0 overflow-hidden"
        style={{ display: visible ? "block" : "none" }}
      >
        {children}
      </div>
    </TabVisibilityContext.Provider>
  );
}
