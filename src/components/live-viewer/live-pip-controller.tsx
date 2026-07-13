// Bridges native system PiP ↔ live viewer session (Android WebView PiP + iOS LiveKit PiP).
//
// Android: OS shows the entire WebView — JS must expand video-only UI before capture.
// iOS: native LivePipSession renders LiveKit frames into AVPictureInPictureController.
//
// Closing rules (both platforms):
// - Viewer closes live → dismiss PiP.
// - User closes the system PiP window → close the live session.
// - User taps the PiP bubble → restore app + expand live.
import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { getToken } from "@/lib/livekit";
import { useAuth } from "@/lib/auth-context";
import {
  addPipModeListener,
  isAndroidPipPlatform,
  isIosPipPlatform,
  isNativePipPlatform,
  pipDismiss,
  pipEnter,
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
  // Android WebView PiP needs the black / video-only DOM treatment.
  // iOS PiP is a native surface — keep WebView chrome restoration light.
  if (isAndroidPipPlatform()) {
    setPipDomClass(true);
  }
  expand();
}

function clearSystemPipUi() {
  setInSystemPip(false);
  setPipDomClass(false);
}

export function LivePipController() {
  const { active, expand, close } = useLiveViewer();
  const { user, profile } = useAuth();
  const wasInPipRef = useRef(false);
  const expandRef = useRef(expand);
  const closeRef = useRef(close);
  const activeRef = useRef(active);
  expandRef.current = expand;
  closeRef.current = close;
  activeRef.current = active;

  const liveOpen = !!active;
  const roomName = active?.roomName ?? null;

  useEffect(() => {
    if (!isNativePipPlatform()) {
      setPipHold(false);
      clearSystemPipUi();
      return;
    }
    let cancelled = false;
    void (async () => {
      const supported = await pipIsSupported();
      if (cancelled) return;
      const on = supported && liveOpen && !!roomName;
      setPipHold(on);
      if (!on) {
        await pipSetEnabled(false);
        clearSystemPipUi();
        await pipDismiss();
        return;
      }

      let session: { url: string; token: string } | undefined;
      if (isIosPipPlatform() && roomName) {
        try {
          const identity = user?.id
            ? `pip_${user.id.slice(0, 10)}`
            : `pip_guest_${Math.random().toString(36).slice(2, 10)}`;
          const name = profile?.display_name || profile?.handle || "viewer";
          session = await getToken(roomName, identity, name, "viewer");
          console.info("[pip] iOS native session ready", { roomName, identity });
        } catch (e) {
          console.warn("[pip] iOS token failed", e);
          setPipHold(false);
          await pipSetEnabled(false);
          return;
        }
      }
      if (cancelled) return;
      await pipSetEnabled(true, session);
    })();
    return () => {
      cancelled = true;
      setPipHold(false);
      void pipSetEnabled(false);
      clearSystemPipUi();
    };
  }, [liveOpen, roomName, user?.id, profile?.display_name, profile?.handle]);

  // Android native injects kidi:pip-prepare before enterPictureInPictureMode.
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

  useEffect(() => {
    if (!isNativePipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    void App.addListener("appStateChange", (s) => {
      if (!s.isActive && getPipHold() && activeRef.current) {
        wasInPipRef.current = true;
        if (isAndroidPipPlatform()) {
          prepareSystemPipUi(() => expandRef.current());
        } else if (isIosPipPlatform()) {
          setInSystemPip(true);
          // Explicitly ask native to start PiP (willResignActive can race).
          void pipEnter();
        }
        return;
      }
      if (s.isActive) {
        void (async () => {
          const stillPip = await pipIsActive();
          if (stillPip) return;
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
    if (!isNativePipPlatform()) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    void addPipModeListener((activePip) => {
      if (cancelled) return;
      if (activePip) {
        wasInPipRef.current = true;
        if (isAndroidPipPlatform()) {
          prepareSystemPipUi(() => expandRef.current());
        } else {
          setInSystemPip(true);
        }
        return;
      }
      clearSystemPipUi();
      if (!wasInPipRef.current) return;
      wasInPipRef.current = false;
      void (async () => {
        await new Promise((r) => setTimeout(r, 80));
        if (cancelled) return;
        let appActive = false;
        try {
          const st = await App.getState();
          appActive = !!st.isActive;
        } catch {
          appActive = false;
        }
        if (!activeRef.current) return;
        if (appActive) {
          expandRef.current();
        } else {
          closeRef.current();
        }
      })();
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
