import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import { EASE_IOS } from "@/lib/motion";
import { Logo } from "@/components/brand/logo";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [exiting, setExiting] = useState(false);
  // Video stays fully transparent until the 'playing' event fires — this
  // guarantees the Android WebView default play-button placeholder can
  // never be seen (it only draws on the <video> element itself).
  const [videoVisible, setVideoVisible] = useState(false);

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
      setExiting(true);
      window.setTimeout(onDone, 260);
    };

    const forceSilentInlineAutoplay = () => {
      // Android WebView can ignore HTML attributes until the JS properties are
      // set on the media element itself, before every play() attempt.
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      // @ts-expect-error webkit-only
      v.webkitPlaysInline = true;
      v.loop = false;
      v.controls = false;
      v.disablePictureInPicture = true;
      v.removeAttribute("controls");
      v.setAttribute("autoplay", "");
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "true");
      v.setAttribute("x5-playsinline", "true");
      v.setAttribute("preload", "auto");
    };

    forceSilentInlineAutoplay();

    // Safety net if 'ended' never fires (some Android WebViews).
    const timeout = window.setTimeout(finish, 6500);
    // If play() rejects (autoplay denied), skip the video after a beat —
    // never show a play control or a frozen frame.
    let skipTimeout = 0;
    // If real playback hasn't started within 1.5s, keep the logo splash and
    // finish cleanly — the user never sees any player chrome.
    const playingWatchdog = window.setTimeout(() => {
      if (!videoVisible) finish();
    }, 1500);

    const tryPlay = () => {
      forceSilentInlineAutoplay();
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          skipTimeout = window.setTimeout(finish, 900);
        });
      }
    };
    tryPlay();
    window.requestAnimationFrame(tryPlay);

    const onPlaying = () => {
      // Frames are actually rendering now — safe to reveal the video.
      setVideoVisible(true);
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
  }, [onDone, videoVisible]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ isolation: "isolate", backgroundColor: "#10162B" }}
    >
      {/* Branded fallback — always painted behind the video. If the video
          never becomes visible (autoplay denied, slow decode, Android
          placeholder), this is all the user sees: navy + pulsing logo. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: "#10162B" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Logo size={160} />
      </motion.div>

      <video
        ref={videoRef}
        src={splashAsset.url}
        autoPlay
        muted
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
