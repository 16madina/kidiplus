// Bridges Android system PiP ↔ live viewer session.
//
// Critical UX: the OS PiP window shows the ENTIRE WebView. If tabs / welcome
// are visible, they appear in the bubble under the live. Native MainActivity
// injects .kp-in-system-pip + dispatches kidi:pip-prepare BEFORE entering PiP;
// we expand the live so the bubble is video-only — and MUST clear that state
// when the app is foreground again, or chrome/X stay hidden forever.
import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { useLiveViewer } from "@/lib/live-viewer-context";
import {
  addPipModeListener,
  isAndroidPipPlatform,
  pipIsActive,
  pipIsSupported,
  pipSetEnabled,
} from "@/lib/pip-native";
import { getInSystemPip, getPipHold, setInSystemPip, setPipHold } from "@/lib/pip-session";

function setPipDomClass(on: boolean) {
  try {
    document.documentElement.classList.toggle("kp-in-system-pip", on);
    if (!on) {
      document.documentElement.style.background = "";
      if (document.body) document.body.style.background = "";
      document.getElementById("kp-pip-force-style")?.remove();
      document.getElementById("kp-pip-mask")?.remove();
      document.querySelectorAll(".kp-pip-live-target").forEach((el) => {
        el.classList.remove("kp-pip-live-target");
      });
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

function clearSystemPipUi() {
  setInSystemPip(false);
  setPipDomClass(false);
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
      clearSystemPipUi();
      return;
    }
    let cancelled = false;
    void (async () => {
      const supported = await pipIsSupported();
      if (cancelled) return;
      const on = supported && liveOpen;
      setPipHold(on);
      await pipSetEnabled(on);
      if (!on) clearSystemPipUi();
    })();
    return () => {
      cancelled = true;
      setPipHold(false);
      void pipSetEnabled(false);
      clearSystemPipUi();
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
    const onClear = () => {
      clearSystemPipUi();
    };
    window.addEventListener("kidi:pip-prepare", onPrepare);
    window.addEventListener("kidi:pip-clear", onClear);
    return () => {
      window.removeEventListener("kidi:pip-prepare", onPrepare);
      window.removeEventListener("kidi:pip-clear", onClear);
    };
  }, []);

  // Leave app → prepare; return to foreground → always clear unless still in PiP.
  useEffect(() => {
    if (!isAndroidPipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    void App.addListener("appStateChange", (s) => {
      if (!s.isActive && getPipHold() && activeRef.current) {
        wasInPipRef.current = true;
        prepareSystemPipUi(() => expandRef.current());
        return;
      }
      if (s.isActive) {
        void (async () => {
          const stillPip = await pipIsActive();
          if (stillPip) return;
          // Returning to the app (or a false prepare from a brief pause):
          // restore chrome so X / tabs work again.
          if (getInSystemPip() || wasInPipRef.current) {
            clearSystemPipUi();
            wasInPipRef.current = false;
            if (activeRef.current) expandRef.current();
          }
        })();
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
      clearSystemPipUi();
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
      clearSystemPipUi();
    };
  }, []);

  return null;
}
