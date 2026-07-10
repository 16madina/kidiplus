// Pinned "Démo" card + full-screen video player.
//
// - Card is rendered as the first item of the home live grid.
// - Same aspect-ratio and shape as LiveCard so the grid stays uniform.
// - We probe the demo video URL once on mount; if the file isn't there
//   (404/network error), the card hides itself entirely (Apple review
//   dislikes "coming soon" placeholders).
//
// Video location (in priority order):
//   1. `/demo-video.mp4` under the project's `public/` folder.
//      This is the single source configured today — just drop the file
//      at `public/demo-video.mp4` and publish.
//
// The player is a native <video controls playsInline> in a full-screen
// black overlay, with a top-right close button. No chat/bid/gift overlays.

import demoVideoAsset from "@/assets/demo-video.mp4.asset.json";
import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";

export const DEMO_VIDEO_URL = "/demo-video.mp4";

/** Probe once whether the demo video is reachable. Returns null while
 *  pending, true if HEAD returns 2xx, false otherwise. */
export function useDemoAvailable(url: string = DEMO_VIDEO_URL): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (!cancelled) setOk(r.ok);
      } catch {
        if (!cancelled) setOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return ok;
}

export function DemoCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS }}
      className="relative"
    >
      <Press
        onClick={onOpen}
        aria-label={t("home.demo.title")}
        className="!block h-full w-full overflow-hidden rounded-2xl p-0 text-left"
        style={{
          aspectRatio: "3 / 4",
          backgroundImage:
            "linear-gradient(150deg, #1a2340 0%, #0d1530 55%, #050912 100%)",
        }}
      >
        {/* soft gold radial highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(120% 90% at 50% 45%, rgba(200,162,74,0.28) 0%, rgba(200,162,74,0) 60%)",
          }}
        />

        {/* DEMO badge */}
        <div className="absolute left-2 top-2 z-10">
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: "#c8a24a", color: "#0d1530" }}
          >
            {t("home.demo.badge")}
          </span>
        </div>

        {/* center play button */}
        <div className="absolute inset-0 z-10 grid place-items-center">
          <motion.div
            initial={{ scale: 0.92, opacity: 0.9 }}
            animate={{ scale: [0.98, 1.04, 0.98] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="grid h-16 w-16 place-items-center rounded-full shadow-xl"
            style={{
              backgroundColor: "rgba(255,255,255,0.94)",
              boxShadow: "0 10px 40px rgba(200,162,74,0.35)",
            }}
          >
            <Play size={28} fill="#0d1530" color="#0d1530" strokeWidth={0} />
          </motion.div>
        </div>

        {/* bottom title */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 p-2.5 pt-10 text-left"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))",
          }}
        >
          <p className="truncate text-[13px] font-semibold text-white">
            {t("home.demo.title")}
          </p>
          <p
            className="mt-0.5 truncate text-[11px]"
            style={{ color: "#e6c877" }}
          >
            {t("home.demo.subtitle")}
          </p>
        </div>
      </Press>
    </motion.div>
  );
}

export function DemoPlayer({
  open,
  onClose,
  src = DEMO_VIDEO_URL,
}: {
  open: boolean;
  onClose: () => void;
  src?: string;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    // Autoplay with sound after an explicit user gesture (they tapped the card).
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.volume = 1;
      const p = v.play();
      if (p) p.catch(() => { /* browser may still block sound — user can tap play */ });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stop = useCallback(() => {
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="demo-player"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black"
        >
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
          <button
            type="button"
            onClick={stop}
            aria-label={t("home.demo.close")}
            className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full"
            style={{ top: "calc(env(safe-area-inset-top) + 12px)", backgroundColor: "rgba(0,0,0,0.55)" }}
          >
            <X size={22} color="white" strokeWidth={2.2} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
