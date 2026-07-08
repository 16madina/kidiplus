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
import { SettingsProvider } from "@/lib/settings-context";
import { PushProvider } from "@/lib/push";
import { PushDeniedBanner } from "@/components/push-denied-banner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/i18n/language-context";
import { WalletProvider } from "@/lib/wallet-context";

import { bootstrapNative } from "@/lib/native";
import { LiveViewerScreen } from "./live-viewer/live-viewer-screen";
import { SellerProfileScreen } from "./seller-profile/seller-profile-screen";
import { AuthFlow } from "./auth/auth-flow";
import { SplashScreen } from "./splash-screen";
import { EASE_IOS } from "@/lib/motion";
import { ImmersiveProvider, useImmersive } from "@/lib/immersive-context";
import { ModerationBanGate } from "@/components/moderation/moderation-gate";

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
  const { loading, session } = useAuth();
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
  return (
    <AnimatePresence mode="wait">
      {session ? (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="h-full w-full"
        >
          <ImmersiveProvider>
            <AppShellInner />
            <ModerationBanGate>{null}</ModerationBanGate>
          </ImmersiveProvider>
        </motion.div>
      ) : (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="h-full w-full"
        >
          <AuthFlow />
        </motion.div>
      )}
    </AnimatePresence>
  );
}




function AppShellInner() {
  const [active, setActive] = useState<TabKey>("home");
  const { active: liveStream, close: closeLive } = useLiveViewer();
  const { activeSeller, close: closeSeller } = useSellerProfile();
  const { immersive } = useImmersive();

  // Native bootstrap (status bar, splash, keyboard, theme sync).
  useEffect(() => {
    void bootstrapNative();
    // Opportunistic cleanup — cancel overdue unpaid auction orders on app load.
    void import("@/lib/lives-db").then((m) => m.expireOverdueOrders()).catch(() => 0);
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

  // Android hardware back button: close sheets/live viewer first, then minimize.
  useEffect(() => {
    let native = false;
    try {
      native = Capacitor.isNativePlatform();
    } catch {}
    if (!native) return;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (liveStream) {
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
  }, [liveStream, activeSeller, active, closeLive, closeSeller]);

  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-background"
      style={{ isolation: "isolate" }}
    >
      <TabPane visible={active === "home"}>
        <HomeScreen />
      </TabPane>
      <TabPane visible={active === "search"}>
        <SearchScreen />
      </TabPane>
      <TabPane visible={active === "live"}>
        <LiveScreen />
      </TabPane>
      <TabPane visible={active === "activity"}>
        <ActivityScreen />
      </TabPane>
      <TabPane visible={active === "profile"}>
        <ProfileScreen />
      </TabPane>

      {!immersive && !liveStream && (
        <BottomTabBar active={active} onChange={setActive} />
      )}

      <AnimatePresence>
        {liveStream && <LiveViewerScreen />}
      </AnimatePresence>

      <AnimatePresence>
        {activeSeller && <SellerProfileScreen />}
      </AnimatePresence>

      <Toaster
        position="top-center"
        offset={16}
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
