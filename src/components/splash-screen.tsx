import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import { EASE_IOS } from "@/lib/motion";

// 1×1 navy PNG (#10162B) — used as poster so Android WebView doesn't flash
// a white frame or a play-button placeholder before playback starts.
const NAVY_POSTER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      setExiting(true);
      window.setTimeout(onDone, 260);
    };

    // Programmatic muted setup — Android WebView often ignores the HTML
    // `muted` attribute alone, so force it here before play().
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    // @ts-expect-error webkit-only
    v.webkitPlaysInline = true;
    v.loop = false;
    v.controls = false;
    v.disablePictureInPicture = true;
    v.setAttribute("preload", "auto");

    // Safety net if 'ended' never fires (some Android WebViews).
    const timeout = window.setTimeout(finish, 6500);
    // If play() rejects (autoplay denied), skip the video after a beat —
    // never show a play control or a frozen frame.
    let skipTimeout = 0;

    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          // Autoplay denied — gracefully skip to the app.
          skipTimeout = window.setTimeout(finish, 900);
        });
      }
    };
    tryPlay();

    v.addEventListener("ended", finish);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      v.removeEventListener("ended", finish);
    };
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ isolation: "isolate", backgroundColor: "#10162B" }}
    >
      <video
        ref={videoRef}
        src={splashAsset.url}
        poster={NAVY_POSTER}
        autoPlay
        muted
        playsInline
        {...({ "webkit-playsinline": "true", "x5-playsinline": "true" } as Record<string, string>)}
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate nofullscreen"
        className="splash-video h-full w-full object-cover"
        style={{ pointerEvents: "none" }}
      />
    </motion.div>
  );
}
