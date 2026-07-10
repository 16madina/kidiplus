// Full-screen gift animation layer for lives (viewers AND host see it).
//
// Each gift has its OWN choreography, escalating with price:
//   🌹 Rose (100)      — gentle petal float, ~2s. Modest.
//   💛 Cœur d'or (250) — two-beat golden heart pulse + orbit sparkles, ~2s.
//   💎 Diamant (500)   — drop from top, glint sweep, sparkle burst, ~2.5s.
//   👑 Couronne (1000) — descend, royal shine sweep, gold rain, ~3s.
//   🚀 Fusée (2500)    — flies diagonally with trail + subtle screen shake, ~3s.
//   🦁 Lion (5000)     — the premium moment: flash + roar + banner + confetti, ~4s.
//
// Queue: tier-1/2 up to 2 concurrent; tier-3 (rocket/lion) is exclusive —
// only one plays at a time. All choreographies use transform / opacity /
// filter; particle arrays are precomputed with useMemo for 60 fps.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { giftByKey, type GiftKey } from "@/lib/gifts";
import { EASE_IOS } from "@/lib/motion";
import type { GiftEvt } from "@/lib/live-room";

type QueueItem = GiftEvt & { animId: string };

const MAX_CONCURRENT_LOW = 2;

const DURATIONS: Record<GiftKey, number> = {
  rose: 2000,
  heart: 2000,
  diamond: 2500,
  crown: 3000,
  rocket: 3000,
  lion: 4000,
};

const isTier3 = (k: string) => k === "rocket" || k === "lion";

export function GiftAnimationsLayer({ trigger }: { trigger: GiftEvt | null }) {
  const [active, setActive] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!trigger) return;
    if (seenRef.current.has(trigger.id)) return;
    seenRef.current.add(trigger.id);
    if (seenRef.current.size > 200) {
      const arr = Array.from(seenRef.current);
      seenRef.current = new Set(arr.slice(arr.length - 100));
    }
    const item: QueueItem = { ...trigger, animId: `${trigger.id}-${Date.now()}` };
    setActive((prev) => {
      const t3Playing = prev.some((a) => isTier3(a.giftKey));
      if (isTier3(item.giftKey)) {
        if (t3Playing || prev.length > 0) {
          queueRef.current.push(item);
          return prev;
        }
        return [item];
      }
      // tier-1/2 — never overlap a tier-3
      if (t3Playing || prev.length >= MAX_CONCURRENT_LOW) {
        queueRef.current.push(item);
        return prev;
      }
      return [...prev, item];
    });
  }, [trigger]);

  const dropItem = (animId: string) => {
    setActive((prev) => {
      const next = prev.filter((a) => a.animId !== animId);
      // Drain the queue, respecting tier-3 exclusivity.
      while (queueRef.current.length > 0) {
        const peek = queueRef.current[0];
        const t3Playing = next.some((a) => isTier3(a.giftKey));
        if (isTier3(peek.giftKey)) {
          if (next.length > 0) break;
          next.push(queueRef.current.shift()!);
          break;
        }
        if (t3Playing || next.length >= MAX_CONCURRENT_LOW) break;
        next.push(queueRef.current.shift()!);
      }
      return next;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {active.map((item) => (
          <GiftAnim key={item.animId} item={item} onDone={() => dropItem(item.animId)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function GiftAnim({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const g = giftByKey(item.giftKey);
  const key = (g?.key ?? "rose") as GiftKey;
  const dur = DURATIONS[key];

  useEffect(() => {
    const t = window.setTimeout(onDone, dur);
    return () => clearTimeout(t);
  }, [dur, onDone]);

  switch (key) {
    case "rose":    return <RoseAnim name={item.senderName} dur={dur} />;
    case "heart":   return <HeartAnim name={item.senderName} dur={dur} />;
    case "diamond": return <DiamondAnim name={item.senderName} dur={dur} />;
    case "crown":   return <CrownAnim name={item.senderName} dur={dur} />;
    case "rocket":  return <RocketAnim name={item.senderName} dur={dur} />;
    case "lion":    return <LionAnim name={item.senderName} dur={dur} />;
    default:        return null;
  }
}

/* ---------- Rose (tier 1) — gentle petals ---------- */
function RoseAnim({ name, dur }: { name: string; dur: number }) {
  const petals = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        i,
        emoji: i % 2 === 0 ? "🌹" : "🌸",
        x: -60 + i * 30 + (Math.random() - 0.5) * 20,
        sway: 20 + Math.random() * 30,
        delay: i * 0.08 + Math.random() * 0.12,
        size: 34 + Math.random() * 10,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {petals.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x: p.x, y: 20, opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{
            x: [p.x, p.x + p.sway, p.x - p.sway * 0.6, p.x],
            y: [20, -140, -300, -460],
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1, 1, 0.85],
            rotate: [0, 20, -10, 8],
          }}
          transition={{
            duration: dur / 1000,
            delay: p.delay,
            ease: EASE_IOS,
            times: [0, 0.25, 0.65, 1],
          }}
          className="absolute left-1/2 bottom-24 -translate-x-1/2 leading-none drop-shadow-md"
          style={{ fontSize: p.size }}
        >
          {p.emoji}
        </motion.span>
      ))}
      <NameBanner name={name} emoji="🌹" bottom={110} />
    </motion.div>
  );
}

/* ---------- Cœur d'or (tier 1) — two-beat pulse ---------- */
function HeartAnim({ name, dur }: { name: string; dur: number }) {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = ((i * 60) * Math.PI) / 180;
        return { i, x: Math.cos(a) * 90, y: Math.sin(a) * 90 };
      }),
    [],
  );
  return (
    <motion.div className="absolute inset-0 flex items-end justify-center pb-40">
      <div className="relative">
        <motion.div
          className="absolute -inset-14 rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0.35, 0], scale: [0.6, 1.2, 1.15, 1.3] }}
          transition={{ duration: dur / 1000, ease: EASE_IOS }}
          style={{
            background:
              "radial-gradient(circle, oklch(0.85 0.16 85 / 0.55), transparent 70%)",
          }}
        />
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.3, 1, 1.2, 1, 0.9],
            opacity: [0, 1, 1, 1, 1, 0],
          }}
          transition={{
            duration: dur / 1000,
            ease: EASE_IOS,
            times: [0, 0.18, 0.35, 0.55, 0.8, 1],
          }}
          className="block text-[110px] leading-none drop-shadow-2xl"
          style={{ filter: "drop-shadow(0 0 20px oklch(0.85 0.18 85 / 0.7))" }}
        >
          💛
        </motion.span>
        {sparkles.map((s) => (
          <motion.span
            key={s.i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: s.x,
              y: s.y,
              opacity: [0, 1, 0],
              scale: [0.3, 1, 0.5],
              rotate: 180,
            }}
            transition={{ duration: 1.1, delay: 0.35, ease: EASE_IOS }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[20px]"
          >
            ✨
          </motion.span>
        ))}
      </div>
      <NameBanner name={name} emoji="💛" bottom={110} />
    </motion.div>
  );
}

/* ---------- Diamant (tier 2) — drop + glint + sparkle burst ---------- */
function DiamondAnim({ name, dur }: { name: string; dur: number }) {
  const burst = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60 * Math.PI) / 180;
        return { i, x: Math.cos(a) * 140, y: Math.sin(a) * 140 };
      }),
    [],
  );
  return (
    <motion.div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        {/* Halo */}
        <motion.div
          className="absolute -inset-20 rounded-full"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.5, 1.4, 1.6] }}
          transition={{ duration: dur / 1000, delay: 0.55, ease: EASE_IOS }}
          style={{
            background:
              "radial-gradient(circle, oklch(0.9 0.14 220 / 0.65), transparent 65%)",
          }}
        />
        {/* Diamond drops in */}
        <motion.span
          initial={{ y: -500, scale: 0.6, opacity: 0, rotate: -20 }}
          animate={{
            y: [-500, 20, -10, 0, 0, -20],
            scale: [0.6, 1.2, 1, 1.05, 1, 0.9],
            opacity: [0, 1, 1, 1, 1, 0],
            rotate: [-20, 10, -5, 0, 0, 0],
          }}
          transition={{
            duration: dur / 1000,
            ease: EASE_IOS,
            times: [0, 0.45, 0.55, 0.65, 0.85, 1],
          }}
          className="relative block text-[130px] leading-none drop-shadow-2xl"
        >
          💎
        </motion.span>
        {/* Horizontal glint sweep on landing */}
        <motion.div
          initial={{ x: -180, opacity: 0 }}
          animate={{ x: [180, 180, 180], opacity: [0, 1, 0] }}
          transition={{
            duration: 0.9,
            delay: 0.55,
            ease: "linear",
          }}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[140px] w-[240px] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
        >
          <motion.div
            initial={{ x: -220 }}
            animate={{ x: 220 }}
            transition={{ duration: 0.6, delay: 0.55, ease: "linear" }}
            className="absolute inset-y-0 w-16"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)",
              filter: "blur(2px)",
              transform: "skewX(-20deg)",
            }}
          />
        </motion.div>
        {/* Sparkle burst on landing */}
        {burst.map((s) => (
          <motion.span
            key={s.i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: s.x,
              y: s.y,
              opacity: [0, 1, 0],
              scale: [0.3, 1.1, 0.5],
            }}
            transition={{ duration: 1, delay: 0.7, ease: EASE_IOS }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[24px]"
          >
            ✨
          </motion.span>
        ))}
      </div>
      <NameBanner name={name} emoji="💎" bottom={110} />
    </motion.div>
  );
}

/* ---------- Couronne (tier 2) — descend + shine sweep + gold rain ---------- */
function CrownAnim({ name, dur }: { name: string; dur: number }) {
  const rain = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        i,
        x: -160 + Math.random() * 320,
        delay: 0.4 + Math.random() * 1.4,
        size: 12 + Math.random() * 14,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {/* Gold rain (full width) */}
      {rain.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x: p.x, y: -60, opacity: 0, rotate: 0 }}
          animate={{ y: 700, opacity: [0, 1, 1, 0], rotate: 540 }}
          transition={{ duration: 2.2, delay: p.delay, ease: "linear" }}
          className="absolute left-1/2 top-0 leading-none"
          style={{ fontSize: p.size, color: "oklch(0.85 0.18 85)" }}
        >
          ✨
        </motion.span>
      ))}
      {/* Crown descends and settles */}
      <motion.div
        initial={{ y: -350, opacity: 0, scale: 0.5, rotate: -10 }}
        animate={{
          y: [-350, 30, -10, 0, 0, -20],
          opacity: [0, 1, 1, 1, 1, 0],
          scale: [0.5, 1.15, 1, 1, 1, 0.9],
          rotate: [-10, 8, -4, 0, 0, 0],
        }}
        transition={{
          duration: dur / 1000,
          ease: EASE_IOS,
          times: [0, 0.28, 0.42, 0.55, 0.9, 1],
        }}
        className="absolute inset-x-0 top-[35%] flex flex-col items-center"
      >
        <div className="relative">
          <span className="block text-[150px] leading-none drop-shadow-2xl">👑</span>
          {/* Vertical royal shine sweep */}
          <motion.div
            initial={{ y: -200, opacity: 0 }}
            animate={{ y: [-200, 200], opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, delay: 0.65, ease: "linear" }}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[180px] w-[220px] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
          >
            <div
              className="absolute inset-x-0 h-10"
              style={{
                background:
                  "linear-gradient(180deg, transparent, oklch(0.98 0.06 85 / 0.9), transparent)",
                filter: "blur(2px)",
              }}
            />
          </motion.div>
        </div>
      </motion.div>
      <NameBanner name={name} emoji="👑" bottom={110} large />
    </motion.div>
  );
}

/* ---------- Fusée (tier 3) — diagonal flight + trail + subtle shake ---------- */
function RocketAnim({ name, dur }: { name: string; dur: number }) {
  const trail = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);
  return (
    <motion.div
      className="absolute inset-0"
      animate={{ x: [0, -4, 4, -3, 3, -2, 0], y: [0, 3, -3, 2, -2, 1, 0] }}
      transition={{ duration: 0.6, delay: 0.25, ease: "linear" }}
    >
      {/* Edge glow pulse */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0.15, 0] }}
        transition={{ duration: dur / 1000, ease: "linear" }}
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 55%, oklch(0.75 0.2 60 / 0.55) 100%)",
        }}
      />
      {/* Trail bursts along the diagonal path */}
      {trail.map((i) => {
        const t = i / (trail.length - 1);
        const left = `${-5 + t * 115}%`;
        const top = `${100 - t * 115}%`;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.1, 0.7] }}
            transition={{ duration: 1, delay: 0.1 + i * 0.06, ease: "linear" }}
            className="absolute text-[24px] leading-none"
            style={{ left, top }}
          >
            {i % 2 ? "💨" : "🔥"}
          </motion.span>
        );
      })}
      {/* Streak */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 0.7, 0], scaleX: [0, 1, 1] }}
        transition={{ duration: dur / 1000, ease: "linear" }}
        className="absolute left-0 top-1/2 h-[3px] w-full origin-left"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.85 0.18 60 / 0.9), transparent)",
          transform: "rotate(-40deg) translateY(-40px)",
        }}
      />
      {/* Rocket */}
      <motion.span
        initial={{ left: "-10%", top: "95%", scale: 0.5, opacity: 0 }}
        animate={{
          left: ["-10%", "45%", "115%"],
          top: ["95%", "45%", "-15%"],
          scale: [0.5, 1.4, 1],
          opacity: [0, 1, 1, 0.5],
        }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.5, 1] }}
        className="absolute text-[95px] leading-none drop-shadow-2xl"
        style={{ transform: "rotate(-40deg)" }}
      >
        🚀
      </motion.span>
      <NameBanner name={name} emoji="🚀" bottom={90} large />
    </motion.div>
  );
}

/* ---------- Lion (tier 3) — flash + roar + banner + confetti ---------- */
function LionAnim({ name, dur }: { name: string; dur: number }) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        i,
        x: -180 + Math.random() * 360,
        delay: 0.9 + Math.random() * 1.1,
        size: 10 + Math.random() * 10,
        rot: Math.random() * 360,
      })),
    [],
  );
  const stars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (i * 36 * Math.PI) / 180;
        return { i, x: Math.cos(a) * 200, y: Math.sin(a) * 200 };
      }),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {/* Radial gold flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.75, 0.2, 0] }}
        transition={{ duration: 0.5, ease: "linear" }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, oklch(0.9 0.18 85 / 0.85), transparent 70%)",
        }}
      />
      {/* Shake wrapper for the lion + stars */}
      <motion.div
        className="absolute inset-0"
        animate={{ x: [0, -7, 8, -5, 6, -3, 0], y: [0, 5, -6, 4, -5, 2, 0] }}
        transition={{ duration: 0.7, delay: 0.25, ease: "linear" }}
      >
        {stars.map((s) => (
          <motion.span
            key={s.i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: s.x,
              y: s.y,
              opacity: [0, 1, 0],
              scale: [0.3, 1.1, 0.5],
              rotate: 180,
            }}
            transition={{ duration: 1.3, delay: 0.35, ease: EASE_IOS }}
            className="absolute left-1/2 top-1/2 text-[28px]"
          >
            ⭐
          </motion.span>
        ))}
        <motion.span
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{
            scale: [0.3, 1.7, 1.4, 1.4, 1.4, 0.9],
            opacity: [0, 1, 1, 1, 1, 0],
          }}
          transition={{
            duration: dur / 1000,
            ease: EASE_IOS,
            times: [0, 0.15, 0.35, 0.6, 0.85, 1],
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[210px] leading-none drop-shadow-2xl"
        >
          🦁
        </motion.span>
      </motion.div>
      {/* Full-width banner */}
      <motion.div
        initial={{ x: "-110%" }}
        animate={{ x: ["-110%", "0%", "0%", "110%"] }}
        transition={{
          duration: 2.4,
          delay: 0.5,
          ease: EASE_IOS,
          times: [0, 0.25, 0.75, 1],
        }}
        className="absolute inset-x-0 top-1/3 -translate-y-1/2 flex h-16 items-center justify-center"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.7 0.22 60 / 0.9), oklch(0.88 0.2 85 / 0.95), oklch(0.7 0.22 60 / 0.9), transparent)",
          boxShadow: "0 0 60px oklch(0.85 0.2 85 / 0.6)",
        }}
      >
        <span
          className="text-[15px] font-black uppercase tracking-wide text-white"
          style={{ textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
        >
          🦁 {name} a envoyé un LION !
        </span>
      </motion.div>
      {/* Heavy gold confetti */}
      {confetti.map((c) => (
        <motion.span
          key={c.i}
          initial={{ x: c.x, y: -80, opacity: 0, rotate: 0 }}
          animate={{ y: 800, opacity: [0, 1, 1, 0], rotate: c.rot }}
          transition={{ duration: 2.2, delay: c.delay, ease: "linear" }}
          className="absolute left-1/2 top-0 leading-none"
          style={{ fontSize: c.size, color: "oklch(0.85 0.18 85)" }}
        >
          {c.i % 3 === 0 ? "⭐" : "✨"}
        </motion.span>
      ))}
    </motion.div>
  );
}

/* ---------- Shared name chip ---------- */
function NameBanner({
  name,
  emoji,
  bottom,
  large = false,
}: {
  name: string;
  emoji: string;
  bottom: number;
  large?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -6] }}
      transition={{ duration: 2, ease: EASE_IOS, times: [0, 0.15, 0.75, 1] }}
      className="absolute inset-x-0 flex justify-center"
      style={{ bottom }}
    >
      <div
        className={`flex items-center gap-1 rounded-full text-white ${large ? "px-4 py-1.5 text-[15px]" : "px-3 py-1 text-[13px]"} font-bold`}
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
    </motion.div>
  );
}
