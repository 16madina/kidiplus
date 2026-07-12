import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import { EASE_IOS } from "@/lib/motion";
import { hideNativeSplash, isNative } from "@/lib/native";

/**
 * Intro splash with brand audio ("qui dit plus ?").
 *
 * Strategy (no tap required, never blocks the app):
 * 1. Prefer unmuted autoplay — Capacitor WebViews already allow this
 *    (Android: setMediaPlaybackRequiresUserGesture(false);
 *     iOS Capacitor: mediaTypesRequiringUserActionForPlayback = []).
 * 2. If the OS still rejects audible autoplay (browser tab, Low Power Mode,
 *    etc.), fall back to muted video so the animation always plays.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [exiting, setExiting] = useState(false);
  // Video stays fully transparent until the 'playing' event fires — this
  // guarantees the Android WebView default play-button placeholder can
  // never be seen (it only draws on the <video> element itself).
  const [videoVisible, setVideoVisible] = useState(false);
  const videoVisibleRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      window.clearTimeout(playingWatchdog);
      // Safety net: if we never fired 'playing' (autoplay blocked, decode
      // error…) still drop the native splash so the app becomes visible.
      void hideNativeSplash();
      setExiting(true);
      window.setTimeout(onDone, 260);
    };

    const applyInlinePlaybackFlags = () => {
      v.playsInline = true;
      // @ts-expect-error webkit-only
      v.webkitPlaysInline = true;
      v.loop = false;
      v.controls = false;
      v.disablePictureInPicture = true;
      v.removeAttribute("controls");
      v.setAttribute("autoplay", "");
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "true");
      v.setAttribute("x5-playsinline", "true");
      v.setAttribute("preload", "auto");
    };

    const setMuted = (muted: boolean) => {
      v.muted = muted;
      v.defaultMuted = muted;
      if (muted) v.setAttribute("muted", "");
      else v.removeAttribute("muted");
      try {
        v.volume = muted ? 0 : 1;
      } catch {
        /* ignore */
      }
    };

    applyInlinePlaybackFlags();

    const timeout = window.setTimeout(finish, 6500);
    let skipTimeout = 0;
    const playingWatchdog = window.setTimeout(() => {
      if (!videoVisibleRef.current) finish();
    }, 1500);

    const tryPlay = () => {
      applyInlinePlaybackFlags();
      // Want sound first — especially in the native app shell.
      setMuted(false);
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          // Audible autoplay accepted.
          console.debug("[splash] playing with sound", { native: isNative() });
        }).catch(() => {
          // OS blocked audible autoplay — keep the animation, drop audio.
          console.debug("[splash] audible autoplay blocked → muted fallback");
          setMuted(true);
          const mutedPlay = v.play();
          if (mutedPlay && typeof mutedPlay.then === "function") {
            mutedPlay.catch(() => {
              skipTimeout = window.setTimeout(finish, 900);
            });
          }
        });
      }
    };
    tryPlay();
    window.requestAnimationFrame(tryPlay);

    const onPlaying = () => {
      videoVisibleRef.current = true;
      setVideoVisible(true);
      // The first video frame is on screen — safe to hide the native
      // Capacitor splash now (no white flash between the two).
      void hideNativeSplash();
    };

    v.addEventListener("loadedmetadata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", finish);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      window.clearTimeout(playingWatchdog);
      v.removeEventListener("loadedmetadata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", finish);
    };
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ isolation: "isolate", backgroundColor: "#10162B", pointerEvents: exiting ? "none" : "auto" }}
    >
      {/* Plain navy backdrop behind the video — no logo fallback, per design. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: "#10162B" }}
      />

      <video
        ref={videoRef}
        src={splashAsset.url}
        autoPlay
        playsInline
        {...({ "webkit-playsinline": "true", "x5-playsinline": "true" } as Record<string, string>)}
        preload="auto"
        controls={false}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate nofullscreen"
        className="splash-video absolute inset-0 h-full w-full object-cover"
        style={{
          pointerEvents: "none",
          opacity: videoVisible ? 1 : 0,
          transition: "opacity 150ms linear",
          backgroundColor: "#10162B",
        }}
      />
    </motion.div>
  );
}
