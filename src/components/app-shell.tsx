import { useState } from "react";
import { BottomTabBar } from "./bottom-tab-bar";
import { HomeScreen } from "@/screens/home-screen";
import { SearchScreen } from "@/screens/search-screen";
import { LiveScreen } from "@/screens/live-screen";
import { ActivityScreen } from "@/screens/activity-screen";
import { ProfileScreen } from "@/screens/profile-screen";

export type TabKey = "home" | "search" | "live" | "activity" | "profile";

// All tab screens are kept mounted; we toggle visibility so scroll position
// and internal state are preserved across tab switches (native feel).
export function AppShell() {
  const [active, setActive] = useState<TabKey>("home");

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
      className="absolute inset-0 overflow-y-auto pb-safe"
      style={{
        display: visible ? "block" : "none",
        paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </div>
  );
}
