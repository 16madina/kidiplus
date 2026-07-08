import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/splash.mp4.asset.json";
import { EASE_IOS } from "@/lib/motion";

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

    v.addEventListener("loadedmetadata", tryPlay);
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("ended", finish);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(skipTimeout);
      v.removeEventListener("loadedmetadata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
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
        autoPlay
        muted
        defaultMuted
        playsInline
        {...({ "webkit-playsinline": "true", "x5-playsinline": "true" } as Record<string, string>)}
        preload="auto"
        controls={false}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate nofullscreen"
        className="splash-video h-full w-full object-cover"
        style={{ pointerEvents: "none" }}
      />
    </motion.div>
  );
}
