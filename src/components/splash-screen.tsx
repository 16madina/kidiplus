import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import logoAsset from "@/assets/logo.png.asset.json";
import { EASE_IOS } from "@/lib/motion";
import { Capacitor } from "@capacitor/core";


// 1×1 navy PNG (#10162B) — used as poster so Android WebView doesn't flash
// a white frame or a play-button placeholder before playback starts.
const NAVY_POSTER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Android WebView refuses inline video autoplay in too many device/OS
// combos and falls back to showing its native play-control overlay.
// On Android we skip the video entirely and show a branded logo fade
// instead — the Capacitor splash (#0C1122) already covers cold start.
function isAndroidNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [exiting, setExiting] = useState(false);
  const useStaticSplash = isAndroidNative();

  useEffect(() => {
    let finished = false;
    let timeout = 0;
    let skipTimeout = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      setExiting(true);
      window.setTimeout(onDone, 260);
    };

    if (useStaticSplash) {
      // Branded logo fade — ~1.4 s then dismiss.
      timeout = window.setTimeout(finish, 1400);
      return () => window.clearTimeout(timeout);
    }

    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    // @ts-expect-error webkit-only
    v.webkitPlaysInline = true;
    v.loop = false;
    v.controls = false;
    v.disablePictureInPicture = true;
    v.setAttribute("preload", "auto");

    timeout = window.setTimeout(finish, 6500);

    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
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
  }, [onDone, useStaticSplash]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ isolation: "isolate", backgroundColor: "#10162B" }}
    >
      {useStaticSplash ? (
        <motion.img
          src={logoAsset.url}
          alt="KiDi+"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE_IOS }}
          className="pointer-events-none select-none"
          style={{ width: "min(46vw, 220px)", height: "auto" }}
          draggable={false}
        />
      ) : (
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
      )}
    </motion.div>
  );
}

