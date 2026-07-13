// Bridges Android system PiP ↔ live viewer session.
//
// Critical UX: the OS PiP window shows the ENTIRE WebView. If tabs / welcome
// are visible, they appear in the bubble under the live. Native MainActivity
// injects .kp-in-system-pip + dispatches kidi:pip-prepare BEFORE entering PiP;
// we must also expand the live so the bubble is video-only.
import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { useLiveViewer } from "@/lib/live-viewer-context";
import {
  addPipModeListener,
  isAndroidPipPlatform,
  pipIsSupported,
  pipSetEnabled,
} from "@/lib/pip-native";
import { getPipHold, setInSystemPip, setPipHold } from "@/lib/pip-session";

function setPipDomClass(on: boolean) {
  try {
    document.documentElement.classList.toggle("kp-in-system-pip", on);
    if (!on) {
      document.documentElement.style.background = "";
      if (document.body) document.body.style.background = "";
    }
  } catch {
    /* ignore */
  }
}

function prepareSystemPipUi(expand: () => void) {
  setInSystemPip(true);
  setPipDomClass(true);
  expand();
}

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
      setPipDomClass(false);
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
      setPipDomClass(false);
      setInSystemPip(false);
    };
  }, [liveOpen]);

  // Native fires this from evaluateJavascript before enterPictureInPictureMode.
  useEffect(() => {
    if (!isAndroidPipPlatform()) return;
    const onPrepare = () => {
      if (!getPipHold() || !activeRef.current) return;
      wasInPipRef.current = true;
      prepareSystemPipUi(() => expandRef.current());
    };
    window.addEventListener("kidi:pip-prepare", onPrepare);
    return () => window.removeEventListener("kidi:pip-prepare", onPrepare);
  }, []);

  // Optimistic: hide tabs / fill video the instant we leave the app.
  useEffect(() => {
    if (!isAndroidPipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    void App.addListener("appStateChange", (s) => {
      if (!s.isActive && getPipHold() && activeRef.current) {
        wasInPipRef.current = true;
        prepareSystemPipUi(() => expandRef.current());
      }
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, []);

  useEffect(() => {
    if (!isAndroidPipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    void addPipModeListener((activePip) => {
      if (cancelled) return;
      if (activePip) {
        wasInPipRef.current = true;
        prepareSystemPipUi(() => expandRef.current());
        return;
      }
      // Left system PiP (tap to restore, or close window).
      setInSystemPip(false);
      setPipDomClass(false);
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
      setPipDomClass(false);
    };
  }, []);

  return null;
}
