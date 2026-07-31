import { createContext, useContext } from "react";
import {
  openActivity as openActivityEvent,
  type OpenActivityPayload,
} from "@/lib/push-router";

type ActivityOverlayApi = {
  openActivity: (payload?: OpenActivityPayload) => void;
};

/**
 * Prefer this over the window CustomEvent when inside AppShell —
 * Profile / Home get a direct setState path that cannot miss the listener.
 * Falls back to the global event outside the provider (SSR / tests).
 */
const ActivityOverlayContext = createContext<ActivityOverlayApi>({
  openActivity: openActivityEvent,
});

export function ActivityOverlayProvider({
  value,
  children,
}: {
  value: ActivityOverlayApi;
  children: React.ReactNode;
}) {
  return (
    <ActivityOverlayContext.Provider value={value}>
      {children}
    </ActivityOverlayContext.Provider>
  );
}

export function useActivityOverlay() {
  return useContext(ActivityOverlayContext);
}
