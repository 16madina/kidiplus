// Bridges Android system PiP ↔ live viewer session.
// - Marks native as eligible while a live is open (Home → auto PiP).
// - Holds LiveKit across the inactive→pip race.
// - In system PiP, keep the live edge-to-edge (never the in-app mini card),
//   otherwise the welcome/home UI shows in the PiP bubble behind the video.
import { useEffect, useRef } from "react";
import { useLiveViewer } from "@/lib/live-viewer-context";
import {
  addPipModeListener,
  isAndroidPipPlatform,
  pipIsSupported,
  pipSetEnabled,
} from "@/lib/pip-native";
import { setInSystemPip, setPipHold } from "@/lib/pip-session";

export function LivePipController() {
  const { active, expand } = useLiveViewer();
  const wasInPipRef = useRef(false);
  const expandRef = useRef(expand);
  const activeRef = useRef(active);
  expandRef.current = expand;
  activeRef.current = active;

  const liveOpen = !!active;

  useEffect(() => {
    if (!isAndroidPipPlatform()) {
      setPipHold(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supported = await pipIsSupported();
      if (cancelled) return;
      const on = supported && liveOpen;
      setPipHold(on);
      await pipSetEnabled(on);
    })();
    return () => {
      cancelled = true;
      setPipHold(false);
      void pipSetEnabled(false);
    };
  }, [liveOpen]);

  useEffect(() => {
    if (!isAndroidPipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    void addPipModeListener((activePip) => {
      if (cancelled) return;
      setInSystemPip(activePip);
      if (activePip) {
        wasInPipRef.current = true;
        // Fill the system PiP window with video only (not the floating mini card).
        expandRef.current();
        return;
      }
      setInSystemPip(false);
      if (!wasInPipRef.current) return;
      wasInPipRef.current = false;
      if (!activeRef.current) return;
      expandRef.current();
    }).then((h) => {
      handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
      setInSystemPip(false);
    };
  }, []);

  return null;
}
