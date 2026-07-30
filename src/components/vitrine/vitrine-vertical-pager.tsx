import { useState } from "react";
import { motion, animate, useMotionValue } from "framer-motion";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

export function VitrineVerticalPager({
  count,
  index,
  onIndexChange,
  onPullReveal,
  onSwipeCategory,
  children,
}: {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  /** Pull down past threshold while on the first item → reveal stories chrome. */
  onPullReveal?: () => void;
  /** Strong horizontal swipe → change Vitrine category (left = next, right = prev). */
  onSwipeCategory?: (dir: "left" | "right") => void;
  children: (i: number) => React.ReactNode;
}) {
  const dragY = useMotionValue(0);
  const dragX = useMotionValue(0);
  const hasNext = index < count - 1;
  const hasPrev = index > 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <motion.div
        className="absolute inset-0"
        style={{
          touchAction: "none",
          x: dragX,
          y: dragY,
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        drag
        dragDirectionLock
        dragElastic={0.35}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragMomentum={false}
        onDrag={(_, info) => {
          const absX = Math.abs(info.offset.x);
          const absY = Math.abs(info.offset.y);
          if (absX > absY) {
            dragX.set(info.offset.x);
            dragY.set(0);
          } else {
            dragY.set(info.offset.y);
            dragX.set(0);
          }
        }}
        onDragEnd={(_, info) => {
          const absY = Math.abs(info.offset.y);
          const absX = Math.abs(info.offset.x);
          const h = typeof window !== "undefined" ? window.innerHeight : 800;
          const w = typeof window !== "undefined" ? window.innerWidth : 390;

          // Horizontal category change (Pour toi ↔ En direct ↔ Bientôt).
          const horizontal =
            absX > absY * 1.05 &&
            (absX > 64 || Math.abs(info.velocity.x) > 400);
          if (horizontal && onSwipeCategory) {
            const dir = info.offset.x < 0 ? "left" : "right";
            haptic.selection();
            void animate(dragX, dir === "left" ? -w * 0.35 : w * 0.35, {
              duration: 0.16,
              ease: EASE_IOS,
            }).then(() => {
              dragX.set(0);
              dragY.set(0);
              onSwipeCategory(dir);
            });
            return;
          }

          const strong = absY > 80 || Math.abs(info.velocity.y) > 450;
          const up = info.offset.y < 0;
          const down = info.offset.y > 0;

          // Pull down on first item → reveal stories (TikTok-style).
          if (down && strong && !hasPrev) {
            dragY.set(0);
            dragX.set(0);
            if (onPullReveal) {
              haptic.light();
              onPullReveal();
            } else {
              animate(dragY, 0, { duration: 0.2, ease: EASE_IOS });
            }
            return;
          }

          if (up && strong && hasNext) {
            haptic.selection();
            void animate(dragY, -h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              dragX.set(0);
              onIndexChange(index + 1);
            });
            return;
          }
          if (!up && strong && hasPrev) {
            haptic.selection();
            void animate(dragY, h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              dragX.set(0);
              onIndexChange(index - 1);
            });
            return;
          }
          animate(dragY, 0, { duration: 0.22, ease: EASE_IOS });
          animate(dragX, 0, { duration: 0.22, ease: EASE_IOS });
        }}
      >
        {children(index)}
      </motion.div>
    </div>
  );
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

function MediaSlide({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={url}
        className={className ?? "h-full w-full object-cover"}
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        style={{ pointerEvents: "none", touchAction: "none" }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={className ?? "h-full w-full object-cover"}
      draggable={false}
      style={{ pointerEvents: "none", touchAction: "none" }}
    />
  );
}

/** Horizontal photo/video carousel — only for multi-media posts; isolated from tab swipes. */
export function MediaCarousel({
  urls,
  className,
}: {
  urls: string[];
  className?: string;
}) {
  const [i, setI] = useState(0);
  if (urls.length === 0) {
    return <div className={className} style={{ background: "#1C2440" }} />;
  }
  if (urls.length === 1) {
    return <MediaSlide url={urls[0]!} className={className} />;
  }
  return (
    <div
      className="relative h-full w-full"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollSnapType: "x mandatory",
          touchAction: "pan-x",
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = el.clientWidth || 1;
          setI(Math.round(el.scrollLeft / w));
        }}
      >
        {urls.map((u) => (
          <div key={u} className="h-full w-full shrink-0 snap-center">
            <MediaSlide url={u} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-10 flex justify-center gap-1">
        {urls.map((_, idx) => (
          <span
            key={idx}
            className="h-1 w-1 rounded-full"
            style={{
              background: idx === i ? "#E8B93B" : "rgba(255,255,255,0.45)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
