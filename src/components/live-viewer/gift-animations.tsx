// Full-screen gift animation layer for lives (viewers AND host see it).
//
// Queue behavior: max 2 concurrent animations. Additional gifts wait in a
// FIFO queue. Tier drives visuals + duration; only transform/opacity are
// animated (GPU-friendly). Rendered above chat, below sheets/toasts.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { giftByKey } from "@/lib/gifts";
import { EASE_IOS } from "@/lib/motion";
import type { GiftEvt } from "@/lib/live-room";

type QueueItem = GiftEvt & { animId: string };

const MAX_CONCURRENT = 2;
const DURATIONS: Record<1 | 2 | 3, number> = { 1: 2000, 2: 2500, 3: 3200 };

export function GiftAnimationsLayer({ trigger }: { trigger: GiftEvt | null }) {
  const [active, setActive] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  // Ingest incoming trigger — dedupe by evt id.
  useEffect(() => {
    if (!trigger) return;
    if (seenRef.current.has(trigger.id)) return;
    seenRef.current.add(trigger.id);
    // Cap the seen set so it can't grow unbounded across a long live.
    if (seenRef.current.size > 200) {
      const arr = Array.from(seenRef.current);
      seenRef.current = new Set(arr.slice(arr.length - 100));
    }
    const item: QueueItem = { ...trigger, animId: `${trigger.id}-${Date.now()}` };
    setActive((prev) => {
      if (prev.length < MAX_CONCURRENT) return [...prev, item];
      queueRef.current.push(item);
      return prev;
    });
  }, [trigger]);

  const dropItem = (animId: string) => {
    setActive((prev) => {
      const next = prev.filter((a) => a.animId !== animId);
      if (queueRef.current.length && next.length < MAX_CONCURRENT) {
        const nextItem = queueRef.current.shift()!;
        return [...next, nextItem];
      }
      return next;
    });
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
      aria-hidden
    >
      <AnimatePresence>
        {active.map((item, i) => (
          <GiftAnim
            key={item.animId}
            item={item}
            index={i}
            onDone={() => dropItem(item.animId)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function GiftAnim({
  item,
  index,
  onDone,
}: {
  item: QueueItem;
  index: number;
  onDone: () => void;
}) {
  const g = giftByKey(item.giftKey);
  const tier = (g?.tier ?? 1) as 1 | 2 | 3;
  const emoji = g?.emoji ?? "🎁";
  const dur = DURATIONS[tier];

  useEffect(() => {
    const t = window.setTimeout(onDone, dur);
    return () => clearTimeout(t);
  }, [dur, onDone]);

  if (tier === 1) {
    // Float up from bottom-center with a name chip.
    return (
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.7 }}
        animate={{ opacity: [0, 1, 1, 0], y: [40, -220, -320, -400], scale: [0.7, 1.15, 1, 0.9] }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.15, 0.7, 1] }}
        className="absolute inset-x-0 bottom-40 flex flex-col items-center"
        style={{ left: index === 1 ? "20%" : undefined, right: index === 1 ? undefined : undefined }}
      >
        <span className="text-[76px] leading-none drop-shadow-2xl">{emoji}</span>
        <NameChip name={item.senderName} emoji={emoji} />
      </motion.div>
    );
  }

  if (tier === 2) {
    // Bigger center pop + gold glow ring.
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.1, 0.9] }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.2, 0.75, 1] }}
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <div className="relative flex flex-col items-center">
          <motion.div
            className="absolute -inset-16 rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.3, 0] }}
            transition={{ duration: dur / 1000, ease: "linear" }}
            style={{
              background:
                "radial-gradient(circle, oklch(0.85 0.18 85 / 0.5), transparent 70%)",
            }}
          />
          <span className="text-[130px] leading-none drop-shadow-2xl">{emoji}</span>
          <NameChip name={item.senderName} emoji={emoji} large />
        </div>
      </motion.div>
    );
  }

  // Tier 3: full-width banner sweep + huge animation.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0"
    >
      {/* Sweep banner */}
      <motion.div
        initial={{ x: "-110%" }}
        animate={{ x: ["-110%", "0%", "0%", "110%"] }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.2, 0.75, 1] }}
        className="absolute inset-x-0 top-1/3 h-24 -translate-y-1/2 flex items-center"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.7 0.22 60 / 0.85), oklch(0.85 0.2 85 / 0.9), oklch(0.7 0.22 60 / 0.85), transparent)",
          boxShadow: "0 0 60px oklch(0.85 0.2 85 / 0.6)",
        }}
      >
        <div className="mx-auto flex items-center gap-3 px-6">
          <span className="text-white text-[15px] font-black uppercase tracking-wide"
            style={{ textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}
          >
            {item.senderName}
          </span>
        </div>
      </motion.div>
      {/* Big emoji burst */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
        animate={{
          scale: [0.3, 1.4, 1.2, 1.2, 0.9],
          opacity: [0, 1, 1, 1, 0],
          rotate: [-8, 8, -4, 4, 0],
          y: [40, -20, -40, -60, -140],
        }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.18, 0.4, 0.75, 1] }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="text-[180px] leading-none drop-shadow-2xl">{emoji}</span>
      </motion.div>
    </motion.div>
  );
}

function NameChip({ name, emoji, large = false }: { name: string; emoji: string; large?: boolean }) {
  return (
    <div
      className={`mt-2 flex items-center gap-1 rounded-full text-white ${large ? "px-4 py-1.5 text-[15px]" : "px-3 py-1 text-[13px]"} font-bold`}
      style={{
        backgroundColor: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
      }}
    >
      <span>{name}</span>
      <span>{emoji}</span>
    </div>
  );
}
