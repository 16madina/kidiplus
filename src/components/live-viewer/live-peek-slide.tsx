import { motion, type MotionValue } from "framer-motion";
import type { LiveStream } from "@/lib/live-mock";

/**
 * Adjacent live poster glued to the current slide's dragY.
 * Positioned off-screen (top:100% next / top:-100% prev) so the strip
 * moves TikTok-style instead of revealing black void while swiping.
 */
export function LivePeekSlide({
  stream,
  position,
  dragY,
}: {
  stream: LiveStream;
  position: "next" | "prev";
  dragY: MotionValue<number>;
}) {
  const baseTop = position === "next" ? "100%" : "-100%";
  const cover = stream.thumbnail.includes("w=600")
    ? stream.thumbnail.replace("w=600", "w=1200")
    : stream.thumbnail;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-full overflow-hidden bg-black"
      style={{ top: baseTop, y: dragY }}
    >
      <img
        src={cover}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-x-0 top-0 pt-safe">
        <div className="flex items-center gap-2 px-3 pt-3">
          {stream.avatar ? (
            <img
              src={stream.avatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white/90"
              draggable={false}
            />
          ) : (
            <span
              className="grid h-10 w-10 place-items-center rounded-full text-[16px] font-black ring-2 ring-white/90"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {(stream.seller.trim()[0] || "?").toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p
              className="truncate text-[14px] font-bold text-white"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              {stream.seller}
            </p>
            <p
              className="truncate text-[11px] text-white/80"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              {stream.title}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Decode neighbour covers/avatars so the next swipe paints instantly. */
export function prefetchLivePeek(streams: Array<LiveStream | null | undefined>) {
  const targets = streams.filter(Boolean) as LiveStream[];
  for (const s of targets) {
    const cover = new Image();
    cover.decoding = "async";
    cover.src = s.thumbnail.includes("w=600")
      ? s.thumbnail.replace("w=600", "w=1200")
      : s.thumbnail;
    void cover.decode?.().catch(() => {});
    if (s.avatar) {
      const av = new Image();
      av.decoding = "async";
      av.src = s.avatar;
      void av.decode?.().catch(() => {});
    }
  }
}
