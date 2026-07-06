import { useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import { LiveViewerScreen } from "./live-viewer/live-viewer-screen";
import { SellerProfileScreen } from "./seller-profile/seller-profile-screen";

export type TabKey = "home" | "search" | "live" | "activity" | "profile";

export function AppShell() {
  return (
    <SellerProfileProvider>
      <LiveViewerProvider>
        <AppShellInner />
      </LiveViewerProvider>
    </SellerProfileProvider>
  );
}

function AppShellInner() {
  const [active, setActive] = useState<TabKey>("home");
  const { active: liveStream } = useLiveViewer();
  const { activeSeller } = useSellerProfile();

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

      <BottomTabBar active={active} onChange={setActive} />

      <AnimatePresence>
        {liveStream && <LiveViewerScreen />}
      </AnimatePresence>

      <AnimatePresence>
        {activeSeller && <SellerProfileScreen />}
      </AnimatePresence>
    </div>
  );
}

function TabPane({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!visible}
      className="absolute inset-0 overflow-hidden"
      style={{ display: visible ? "block" : "none" }}
    >
      {children}
    </div>
  );
}
