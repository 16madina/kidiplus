// Bridges native system PiP ↔ live viewer session (Android WebView PiP + iOS LiveKit PiP).
//
// Android: OS shows the entire WebView — JS must expand video-only UI before capture.
// iOS: native LivePipSession renders LiveKit frames into AVPictureInPictureController.
//
// Closing rules (both platforms):
// - Viewer closes live → dismiss PiP.
// - User closes the system PiP window → close the live session.
// - User taps the PiP bubble → restore app + expand live.
// - PiP *fails* to start → keep the live open (do NOT treat as user dismiss).
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
  /** True only after native confirmed system PiP actually started. */
  const pipActuallyStartedRef = useRef(false);
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
        pipActuallyStartedRef.current = false;
        await pipSetEnabled(false);
        clearSystemPipUi();
        await pipDismiss();
        return;
      }

      let session: { url: string; token: string } | undefined;
      if (isIosPipPlatform() && roomName) {
        try {
          // Guests must match /^guest_[a-zA-Z0-9_-]+$/ on the LiveKit token API.
          // Signed-in users get a pip_* identity so the native viewer doesn't
          // collide with the WebView participant (viewer_*).
          const identity = user?.id
            ? `pip_${user.id.replace(/-/g, "").slice(0, 10)}`
            : `guest_pip_${Math.random().toString(36).slice(2, 10)}`;
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
      pipActuallyStartedRef.current = false;
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
        if (isAndroidPipPlatform()) {
          prepareSystemPipUi(() => expandRef.current());
        } else if (isIosPipPlatform()) {
          // Keep media session alive while we try to enter system PiP.
          // Do NOT mark pip as "started" yet — that caused failed starts to
          // close the live session.
          setInSystemPip(true);
          void (async () => {
            for (const delay of [0, 300, 800, 1600, 3000]) {
              if (delay) await new Promise((r) => setTimeout(r, delay));
              if (!getPipHold() || !activeRef.current) return;
              try {
                const st = await App.getState();
                if (st.isActive) return;
              } catch {
                /* ignore */
              }
              if (pipActuallyStartedRef.current || (await pipIsActive())) {
                pipActuallyStartedRef.current = true;
                return;
              }
              await pipEnter();
            }
          })();
        }
        return;
      }
      if (s.isActive) {
        void (async () => {
          const stillPip = await pipIsActive();
          if (stillPip) return;
          if (getInSystemPip() || pipActuallyStartedRef.current) {
            // Expand first while still flagged as system-PiP so the shell
            // stays fullscreen — then clear the flag next frame (avoids a
            // mini/poster flash on iOS restore).
            if (activeRef.current) expandRef.current();
            pipActuallyStartedRef.current = false;
            requestAnimationFrame(() => {
              clearSystemPipUi();
            });
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
        pipActuallyStartedRef.current = true;
        if (isAndroidPipPlatform()) {
          prepareSystemPipUi(() => expandRef.current());
        } else {
          setInSystemPip(true);
        }
        return;
      }

      // PiP stopped. Only close the live if system PiP had actually started
      // (user dismissed the bubble). A failed start must NOT kill the session.
      const hadRealPip = pipActuallyStartedRef.current;
      pipActuallyStartedRef.current = false;
      if (!hadRealPip) {
        console.info("[pip] stop ignored — PiP never actually started");
        return;
      }

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
        if (!activeRef.current) {
          clearSystemPipUi();
          return;
        }
        if (appActive) {
          // Expand while still in system-PiP chrome, then clear next frame.
          expandRef.current();
          requestAnimationFrame(() => clearSystemPipUi());
        } else {
          clearSystemPipUi();
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
