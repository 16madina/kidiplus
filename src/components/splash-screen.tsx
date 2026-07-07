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
    // Autoplay muted inline for iOS/Android/web.
    v.muted = true;
    v.playsInline = true;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();

    // Safety timeout in case the video never fires 'ended'.
    const timeout = window.setTimeout(() => finish(), 6500);

    const finish = () => {
      window.clearTimeout(timeout);
      setExiting(true);
      window.setTimeout(onDone, 260);
    };
    v.addEventListener("ended", finish);
    return () => {
      window.clearTimeout(timeout);
      v.removeEventListener("ended", finish);
    };
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{ isolation: "isolate" }}
    >
      <video
        ref={videoRef}
        src={splashAsset.url}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      />
    </motion.div>
  );
}
