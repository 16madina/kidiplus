import { useState } from "react";
import { motion, animate, useMotionValue } from "framer-motion";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

export function VitrineVerticalPager({
  count,
  index,
  onIndexChange,
  children,
}: {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  children: (i: number) => React.ReactNode;
}) {
  const dragY = useMotionValue(0);
  const hasNext = index < count - 1;
  const hasPrev = index > 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Content lives inside the drag layer so CTAs/rail receive taps;
          interactive controls call stopPropagation to avoid accidental swipes. */}
      <motion.div
        className="absolute inset-0"
        style={{
          touchAction: "none",
          y: dragY,
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        drag="y"
        dragElastic={{ top: hasNext ? 0.45 : 0.1, bottom: hasPrev ? 0.45 : 0.1 }}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragMomentum={false}
        onDrag={(_, info) => dragY.set(info.offset.y)}
        onDragEnd={(_, info) => {
          const strong =
            Math.abs(info.offset.y) > 80 || Math.abs(info.velocity.y) > 450;
          const up = info.offset.y < 0;
          const h = typeof window !== "undefined" ? window.innerHeight : 800;
          if (up && strong && hasNext) {
            haptic.selection();
            void animate(dragY, -h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              onIndexChange(index + 1);
            });
            return;
          }
          if (!up && strong && hasPrev) {
            haptic.selection();
            void animate(dragY, h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              onIndexChange(index - 1);
            });
            return;
          }
          animate(dragY, 0, { duration: 0.22, ease: EASE_IOS });
        }}
      >
        {children(index)}
      </motion.div>
    </div>
  );
}

/** Horizontal photo carousel — stops propagation so SwipeableTabs don't switch. */
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
    return (
      <img
        src={urls[0]}
        alt=""
        className={className ?? "h-full w-full object-cover"}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="relative h-full w-full"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = el.clientWidth || 1;
          setI(Math.round(el.scrollLeft / w));
        }}
      >
        {urls.map((u) => (
          <img
            key={u}
            src={u}
            alt=""
            className="h-full w-full shrink-0 snap-center object-cover"
            draggable={false}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-24 left-0 right-0 z-10 flex justify-center gap-1">
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
