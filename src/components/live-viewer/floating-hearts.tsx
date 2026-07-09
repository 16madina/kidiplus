// Floating hearts overlay — under heavy load (500 viewers all tapping at
// once) we must not create hundreds of DOM nodes. We:
//   1. Coalesce incoming heart events during a rAF window (max 3 spawns
//      per frame) so a burst becomes a natural cluster instead of a fork
//      bomb.
//   2. Hard-cap the number of concurrently rendered hearts at MAX_HEARTS.
//      Older hearts are dropped from the head of the list first.
//   3. Animation uses transform + opacity only (GPU-cheap).
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type Heart = { id: number; x: number; size: number; drift: number; hue: number };

let hid = 0;
const MAX_HEARTS = 15;
const MAX_SPAWNS_PER_FRAME = 3;
const HEART_TTL_MS = 1600;

function makeHeart(): Heart {
  return {
    id: ++hid,
    x: -20 - Math.random() * 40,
    size: 22 + Math.random() * 18,
    drift: -30 + Math.random() * 60,
    hue: 350 + Math.random() * 30,
  };
}

export function FloatingHearts({
  trigger,
}: {
  /** Increment this number to spawn a heart. */
  trigger: number;
}) {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const pendingRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTriggerRef = useRef(trigger);

  useEffect(() => {
    if (trigger === 0) return;
    // Compute delta (viewers may burst-increment via server broadcast).
    const delta = Math.max(1, trigger - lastTriggerRef.current);
    lastTriggerRef.current = trigger;
    pendingRef.current = Math.min(pendingRef.current + delta, MAX_HEARTS * 2);

    if (rafRef.current != null) return;
    const flush = () => {
      rafRef.current = null;
      const spawn = Math.min(pendingRef.current, MAX_SPAWNS_PER_FRAME);
      if (spawn <= 0) return;
      pendingRef.current -= spawn;
      const born: Heart[] = [];
      for (let i = 0; i < spawn; i++) born.push(makeHeart());
      setHearts((prev) => {
        const next = [...prev, ...born];
        return next.length > MAX_HEARTS ? next.slice(next.length - MAX_HEARTS) : next;
      });
      // TTL cleanup for this batch.
      const ids = born.map((h) => h.id);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => !ids.includes(h.id)));
      }, HEART_TTL_MS);
      if (pendingRef.current > 0) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };
    rafRef.current = requestAnimationFrame(flush);
  }, [trigger]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute bottom-24 right-4 z-40"
      style={{ height: 1, width: 1 }}
    >
      <AnimatePresence>
        {hearts.map((h) => (
          <HeartParticle key={h.id} h={h} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function HeartParticle({ h }: { h: Heart }) {
  const path = useMemo(
    () => (
      <svg viewBox="0 0 24 24" width={h.size} height={h.size} aria-hidden>
        <path
          d="M12 21s-7-4.35-9.5-9.5C.9 8 3 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 4.5 23.1 8 21.5 11.5 19 16.65 12 21 12 21z"
          fill={`oklch(0.72 0.22 ${h.hue})`}
          stroke="white"
          strokeOpacity="0.9"
          strokeWidth="1"
        />
      </svg>
    ),
    [h.size, h.hue],
  );
  return (
    <motion.div
      initial={{ x: h.x, y: 0, opacity: 0, scale: 0.6 }}
      animate={{
        x: h.x + h.drift,
        y: -220 - Math.random() * 80,
        opacity: [0, 1, 1, 0],
        scale: [0.6, 1.1, 1, 0.9],
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.32, 0.72, 0, 1] }}
      style={{ position: "absolute", right: 0, bottom: 0, willChange: "transform, opacity" }}
    >
      {path}
    </motion.div>
  );
}
