// Full-screen gift animation layer for lives (viewers AND host see it).
//
// Each gift has its OWN signature animation — no generic tier fallbacks:
//   🌹 Rose    → petal shower bursting from bottom-center across the screen
//   💛 Cœur    → cluster of hearts floating up with tiny sparkles
//   💎 Diamant → prismatic sparkle rays + spinning diamond in center
//   👑 Couronne → descends from the top with light rays + gold particles
//   🚀 Fusée   → flies diagonally with a smoke/fire trail across the screen
//   🦁 Lion    → roar: shake + shockwave rings + stars radiating out
//
// Queue behavior: max 2 concurrent animations. Additional gifts wait in a
// FIFO queue. Only transform/opacity are animated (GPU-friendly). Rendered
// above chat, below sheets/toasts.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { giftByKey } from "@/lib/gifts";
import { EASE_IOS } from "@/lib/motion";
import type { GiftEvt } from "@/lib/live-room";

type QueueItem = GiftEvt & { animId: string };

const MAX_CONCURRENT = 2;
const DURATIONS: Record<string, number> = {
  rose: 2600,
  heart: 2400,
  diamond: 2800,
  crown: 3000,
  rocket: 2400,
  lion: 3400,
};

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
  const key = g?.key ?? "rose";
  const dur = DURATIONS[key] ?? 2500;

  useEffect(() => {
    const t = window.setTimeout(onDone, dur);
    return () => clearTimeout(t);
  }, [dur, onDone]);

  switch (key) {
    case "rose":
      return <RoseAnim name={item.senderName} dur={dur} />;
    case "heart":
      return <HeartAnim name={item.senderName} dur={dur} />;
    case "diamond":
      return <DiamondAnim name={item.senderName} dur={dur} />;
    case "crown":
      return <CrownAnim name={item.senderName} dur={dur} />;
    case "rocket":
      return <RocketAnim name={item.senderName} dur={dur} />;
    case "lion":
      return <LionAnim name={item.senderName} dur={dur} />;
    default:
      return null;
  }
}

/* ---------- Rose: petal shower ---------- */
function RoseAnim({ name, dur }: { name: string; dur: number }) {
  const petals = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        i,
        emoji: i % 3 === 0 ? "🌹" : "🌸",
        x: -140 + Math.random() * 280,
        y: -220 - Math.random() * 260,
        rot: -180 + Math.random() * 360,
        delay: Math.random() * 0.35,
        size: 30 + Math.random() * 28,
      })),
    [],
  );
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {petals.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x: 0, y: 40, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: [0, p.x * 0.4, p.x],
            y: [40, p.y * 0.5, p.y],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 0.8],
            rotate: [0, p.rot * 0.5, p.rot],
          }}
          transition={{
            duration: dur / 1000,
            ease: EASE_IOS,
            delay: p.delay,
            times: [0, 0.2, 0.75, 1],
          }}
          className="absolute left-1/2 bottom-24 -translate-x-1/2 leading-none drop-shadow-lg"
          style={{ fontSize: p.size }}
        >
          {p.emoji}
        </motion.span>
      ))}
      <NameBanner name={name} emoji="🌹" bottom={110} />
    </motion.div>
  );
}

/* ---------- Heart: cluster of floating hearts ---------- */
function HeartAnim({ name, dur }: { name: string; dur: number }) {
  const hearts = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        i,
        emoji: i % 2 ? "💛" : "💗",
        x: -60 + Math.random() * 120,
        delay: Math.random() * 0.5,
        size: 32 + Math.random() * 24,
        drift: -30 + Math.random() * 60,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {hearts.map((h) => (
        <motion.span
          key={h.i}
          initial={{ x: h.x, y: 40, opacity: 0, scale: 0.5 }}
          animate={{
            x: [h.x, h.x + h.drift, h.x + h.drift * 1.4],
            y: [40, -260, -440],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.1, 1, 0.7],
          }}
          transition={{
            duration: dur / 1000,
            delay: h.delay,
            ease: EASE_IOS,
            times: [0, 0.2, 0.7, 1],
          }}
          className="absolute left-1/2 bottom-24 -translate-x-1/2 leading-none drop-shadow-md"
          style={{ fontSize: h.size }}
        >
          {h.emoji}
        </motion.span>
      ))}
      <NameBanner name={name} emoji="💛" bottom={110} />
    </motion.div>
  );
}

/* ---------- Diamond: prismatic rays + spinning gem ---------- */
function DiamondAnim({ name, dur }: { name: string; dur: number }) {
  const rays = useMemo(() => Array.from({ length: 12 }, (_, i) => (i * 360) / 12), []);
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: dur / 1000, ease: "linear", times: [0, 0.15, 0.75, 1] }}
    >
      <div className="relative">
        {/* Rotating prismatic rays */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ rotate: 0, scale: 0.4 }}
          animate={{ rotate: 360, scale: [0.4, 1.2, 1.1] }}
          transition={{ duration: dur / 1000, ease: "linear" }}
        >
          {rays.map((deg) => (
            <div
              key={deg}
              className="absolute left-0 top-0 h-[260px] w-[6px] -translate-x-1/2 rounded-full"
              style={{
                transform: `rotate(${deg}deg) translateY(-130px)`,
                background:
                  "linear-gradient(to top, transparent, oklch(0.9 0.15 220 / 0.9), transparent)",
                filter: "blur(1px)",
              }}
            />
          ))}
        </motion.div>
        {/* Radial halo */}
        <motion.div
          className="absolute -inset-24 rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0.4, 0], scale: [0.5, 1.2, 1.1, 1.4] }}
          transition={{ duration: dur / 1000, ease: EASE_IOS }}
          style={{
            background:
              "radial-gradient(circle, oklch(0.85 0.14 220 / 0.6), transparent 65%)",
          }}
        />
        {/* Spinning diamond */}
        <motion.span
          initial={{ scale: 0.3, rotate: -30 }}
          animate={{ scale: [0.3, 1.5, 1.2, 1.2, 0.9], rotate: [-30, 15, -10, 8, 0] }}
          transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.2, 0.45, 0.75, 1] }}
          className="relative block text-[140px] leading-none drop-shadow-2xl"
        >
          💎
        </motion.span>
        {/* Small sparkles */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i * 60) * (Math.PI / 180);
          return (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
              animate={{
                x: Math.cos(a) * 140,
                y: Math.sin(a) * 140,
                opacity: [0, 1, 0],
                scale: [0.3, 1, 0.4],
              }}
              transition={{ duration: dur / 1000, delay: 0.15 + i * 0.05, ease: EASE_IOS }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[26px]"
            >
              ✨
            </motion.span>
          );
        })}
      </div>
      <NameBanner name={name} emoji="💎" bottom={110} />
    </motion.div>
  );
}

/* ---------- Crown: descends from top with rays + gold particles ---------- */
function CrownAnim({ name, dur }: { name: string; dur: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        i,
        x: -140 + Math.random() * 280,
        delay: 0.3 + Math.random() * 0.5,
        size: 14 + Math.random() * 12,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {/* Golden light rays from top */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[60%]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.4, 0] }}
        transition={{ duration: dur / 1000, ease: "linear" }}
        style={{
          background:
            "conic-gradient(from 200deg at 50% -20%, transparent 0deg, oklch(0.9 0.16 85 / 0.55) 20deg, transparent 40deg, transparent 320deg, oklch(0.9 0.16 85 / 0.55) 340deg, transparent 360deg)",
        }}
      />
      {/* Falling gold particles */}
      {particles.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x: p.x, y: -40, opacity: 0 }}
          animate={{ y: 600, opacity: [0, 1, 1, 0], rotate: 720 }}
          transition={{ duration: dur / 1000, delay: p.delay, ease: "linear" }}
          className="absolute left-1/2 top-0 leading-none"
          style={{ fontSize: p.size }}
        >
          ✨
        </motion.span>
      ))}
      {/* Crown itself */}
      <motion.div
        initial={{ y: -300, opacity: 0, scale: 0.5, rotate: -12 }}
        animate={{
          y: [-300, 20, -10, 0, 0, -40],
          opacity: [0, 1, 1, 1, 1, 0],
          scale: [0.5, 1.2, 1, 1, 1, 0.9],
          rotate: [-12, 8, -4, 0, 0, 0],
        }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.25, 0.4, 0.5, 0.85, 1] }}
        className="absolute inset-x-0 top-1/3 flex flex-col items-center"
      >
        <span className="text-[150px] leading-none drop-shadow-2xl">👑</span>
      </motion.div>
      <NameBanner name={name} emoji="👑" bottom={110} large />
    </motion.div>
  );
}

/* ---------- Rocket: diagonal flight with trail ---------- */
function RocketAnim({ name, dur }: { name: string; dur: number }) {
  const trail = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);
  return (
    <motion.div className="absolute inset-0">
      {/* Trail bursts */}
      {trail.map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 0.9, 0],
            scale: [0.4, 1.1, 0.6],
            left: `${10 + i * 8}%`,
            top: `${85 - i * 8}%`,
          }}
          transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: "linear" }}
          className="absolute text-[26px] leading-none"
        >
          {i % 2 ? "💨" : "🔥"}
        </motion.span>
      ))}
      {/* Rocket */}
      <motion.span
        initial={{ left: "-10%", top: "95%", rotate: -45, scale: 0.6, opacity: 0 }}
        animate={{
          left: ["-10%", "40%", "110%"],
          top: ["95%", "45%", "-10%"],
          rotate: -45,
          scale: [0.6, 1.3, 1],
          opacity: [0, 1, 1, 0.6],
        }}
        transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.55, 1] }}
        className="absolute text-[90px] leading-none drop-shadow-2xl"
      >
        🚀
      </motion.span>
      {/* Sonic streak line */}
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
      <NameBanner name={name} emoji="🚀" bottom={90} large />
    </motion.div>
  );
}

/* ---------- Lion: roar with shockwave rings + stars ---------- */
function LionAnim({ name, dur }: { name: string; dur: number }) {
  const rings = [0, 0.35, 0.7];
  const stars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        i,
        angle: (i * 36 * Math.PI) / 180,
        dist: 180 + Math.random() * 80,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0">
      {/* Camera shake wrapper */}
      <motion.div
        className="absolute inset-0"
        animate={{ x: [0, -6, 8, -4, 6, -2, 0], y: [0, 4, -6, 3, -5, 2, 0] }}
        transition={{ duration: 0.9, ease: "linear", delay: 0.2 }}
      >
        {/* Red/orange background flash */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.45, 0.2, 0] }}
          transition={{ duration: dur / 1000, ease: "linear" }}
          style={{
            background:
              "radial-gradient(circle at 50% 50%, oklch(0.7 0.22 40 / 0.7), transparent 70%)",
          }}
        />
        {/* Shockwave rings */}
        {rings.map((delay, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0.2, 2.4, 3.2] }}
            transition={{ duration: 1.4, delay, ease: EASE_IOS }}
            className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ border: "6px solid oklch(0.85 0.18 60 / 0.9)" }}
          />
        ))}
        {/* Stars radiating out */}
        {stars.map((s) => (
          <motion.span
            key={s.i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: Math.cos(s.angle) * s.dist,
              y: Math.sin(s.angle) * s.dist,
              opacity: [0, 1, 0],
              scale: [0.3, 1.1, 0.5],
              rotate: 180,
            }}
            transition={{ duration: 1.3, delay: 0.35, ease: EASE_IOS }}
            className="absolute left-1/2 top-1/2 text-[26px]"
          >
            ⭐
          </motion.span>
        ))}
        {/* Lion */}
        <motion.span
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{
            scale: [0.3, 1.6, 1.35, 1.35, 0.9],
            opacity: [0, 1, 1, 1, 0],
          }}
          transition={{ duration: dur / 1000, ease: EASE_IOS, times: [0, 0.18, 0.4, 0.8, 1] }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[200px] leading-none drop-shadow-2xl"
        >
          🦁
        </motion.span>
      </motion.div>
      <NameBanner name={name} emoji="🦁" bottom={90} large />
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
