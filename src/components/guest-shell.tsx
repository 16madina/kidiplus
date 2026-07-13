// GuestShell — minimal app shell rendered for logged-out visitors.
//
// A guest can only be here through a public deep-link (/live/$id) or the
// PUSH_OPEN_EVENT that /live/$id dispatches. The shell:
//   - listens for kidi:push-open and opens the requested live via
//     LiveViewerProvider (same context AppShellInner uses),
//   - renders the <LiveViewerScreen/> overlay when a live is active,
//   - renders <AuthFlow/> underneath so closing the live drops the guest
//     into sign-in.
//
// The guest cannot navigate tabs, browse the feed, or open sellers — those
// live inside AppShellInner and remain gated. The DB / RLS layer is the
// ultimate authority; this shell just narrows the surface area.

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { PUSH_OPEN_EVENT, type PushOpenPayload } from "@/lib/push-router";
import { fetchLiveById } from "@/lib/lives-db";
import { LiveViewerScreen } from "@/components/live-viewer/live-viewer-screen";
import { LivePipController } from "@/components/live-viewer/live-pip-controller";
import { AuthFlow } from "@/components/auth/auth-flow";
import { ErrorBoundary } from "@/components/error-boundary";

export function GuestShell() {
  const { active: liveStream, close: closeLive, open: openLive } = useLiveViewer();

  // Same deep-link listener AppShellInner uses, restricted to "live"/"chat"
  // kinds. Other kinds (order, seller, activity, home) all require an
  // account, so we ignore them for guests.
  useEffect(() => {
    const onOpen = async (e: Event) => {
      const p = (e as CustomEvent<PushOpenPayload>).detail;
      if (!p) return;
      const kind = String(p.kind ?? "notif");
      if ((kind === "live" || kind === "chat") && p.live_id) {
        const stream = await fetchLiveById(p.live_id).catch(() => null);
        if (stream) openLive(stream);
      }
    };
    window.addEventListener(PUSH_OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(PUSH_OPEN_EVENT, onOpen as EventListener);
  }, [openLive]);

  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-background"
      style={{ isolation: "isolate" }}
    >
      <div data-kp-shell-chrome>
        <AuthFlow />
      </div>
      <AnimatePresence>
        {liveStream && (
          <ErrorBoundary boundary="live_viewer_guest" onReset={closeLive}>
            <LiveViewerScreen />
          </ErrorBoundary>
        )}
      </AnimatePresence>
      <LivePipController />
    </div>
  );
}
