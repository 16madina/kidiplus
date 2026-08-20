import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import { EASE_IOS } from "@/lib/motion";
import { hideNativeSplash, isNative } from "@/lib/native";

/**
 * Intro splash with brand audio ("qui dit plus ?").
 *
 * Strategy (no tap required, never blocks the app):
 * 1. Prefer same-origin `/splash.mp4` (bundled in `public/`, reliable on App Store).
 * 2. Fall back to the Lovable CDN absolute URL.
 * 3. Prefer unmuted autoplay in Capacitor; if blocked, muted fallback.
 * 4. Reveal the video as soon as playback starts — never keep opacity 0 while
 *    audio is already playing (WKWebView often skips painting invisible videos).
 * 5. Hide the native Capacitor splash on mount (navy shell matches) so it
 *    cannot cover the HTML video while sound plays underneath.
 */
function splashSources(): string[] {
  const cdnPath = splashAsset.url;
  const absCdn = /^https?:\/\//i.test(cdnPath)
    ? cdnPath
    : `https://kidiplus.com${cdnPath.startsWith("/") ? "" : "/"}${cdnPath}`;
  // Same-origin first after deploy; absolute CDN as backup.
  return ["/splash.mp4", absCdn];
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [exiting, setExiting] = useState(false);
  const videoVisibleRef = useRef(false);
  const sourceIdxRef = useRef(0);
  const sources = useRef(splashSources()).current;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Native splash must not sit on top of the React intro — users would hear
    // "qui dit plus" while still seeing the static Capacitor splash / navy.
    void hideNativeSplash();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      window.clearTimeout(playingWatchdog);
      void hideNativeSplash();
      setExiting(true);
      window.setTimeout(onDone, 260);
    };

    const revealVideo = () => {
      if (videoVisibleRef.current) return;
      videoVisibleRef.current = true;
      void hideNativeSplash();
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

    // Hard ceiling — never block the app forever (video is ~3–5s).
    const timeout = window.setTimeout(finish, 12_000);
    let skipTimeout = 0;
    // Cold start on cellular can take several seconds before first frame.
    const playingWatchdog = window.setTimeout(() => {
      if (!videoVisibleRef.current) finish();
    }, 8_000);

    const tryPlay = () => {
      applyInlinePlaybackFlags();
      setMuted(false);
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          console.debug("[splash] playing with sound", { native: isNative() });
          // play() resolved ⇒ audio (and usually video) is running. Reveal
          // immediately — do not wait only for "playing", which can lag or
          // never paint when opacity was 0.
          revealVideo();
        }).catch(() => {
          console.debug("[splash] audible autoplay blocked → muted fallback");
          setMuted(true);
          const mutedPlay = v.play();
          if (mutedPlay && typeof mutedPlay.then === "function") {
            mutedPlay
              .then(() => {
                revealVideo();
              })
              .catch(() => {
                skipTimeout = window.setTimeout(finish, 900);
              });
          }
        });
      }
    };

    const tryNextSource = () => {
      if (sourceIdxRef.current + 1 >= sources.length) return false;
      sourceIdxRef.current += 1;
      const next = sources[sourceIdxRef.current];
      console.warn("[splash] switching source", next);
      v.src = next;
      v.load();
      tryPlay();
      return true;
    };

    const onError = () => {
      if (!tryNextSource()) {
        skipTimeout = window.setTimeout(finish, 400);
      }
    };

    // Start with first source.
    if (v.getAttribute("src") !== sources[0]) {
      v.src = sources[0];
      v.load();
    }
    tryPlay();
    window.requestAnimationFrame(tryPlay);

    const onTimeUpdate = () => {
      if (v.currentTime > 0) revealVideo();
    };

    v.addEventListener("loadedmetadata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("playing", revealVideo);
    v.addEventListener("loadeddata", revealVideo);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", finish);
    v.addEventListener("error", onError);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      window.clearTimeout(playingWatchdog);
      v.removeEventListener("loadedmetadata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("playing", revealVideo);
      v.removeEventListener("loadeddata", revealVideo);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", finish);
      v.removeEventListener("error", onError);
    };
  }, [onDone, sources]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ isolation: "isolate", backgroundColor: "#10162B", pointerEvents: exiting ? "none" : "auto" }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: "#10162B" }}
      />

      <video
        ref={videoRef}
        src={sources[0]}
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
          // Always paintable: opacity 0 while audio plays is a known WKWebView
          // bug (sound on, black screen). Navy underlay covers any pre-frame gap.
          opacity: 1,
          backgroundColor: "#10162B",
        }}
      />
    </motion.div>
  );
}
