import { motion } from "framer-motion";
import { useEffect, useState } from "react";

// Burst of small colored particles rising and fading. Fires once per key change.
export function Confetti({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; hue: number; size: number; rot: number }[]
  >([]);

  useEffect(() => {
    if (trigger === 0) return;
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: trigger * 1000 + i,
      x: -140 + Math.random() * 280,
      y: -140 - Math.random() * 160,
      hue: Math.random() * 360,
      size: 6 + Math.random() * 8,
      rot: Math.random() * 360,
    }));
    setParticles(items);
    const t = setTimeout(() => setParticles([]), 1400);
    return () => clearTimeout(t);
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
      <div className="relative h-0 w-0">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
            animate={{
              x: p.x,
              y: p.y,
              opacity: [1, 1, 0],
              scale: [0.4, 1, 0.9],
              rotate: p.rot,
            }}
            transition={{ duration: 1.2, ease: [0.32, 0.72, 0, 1] }}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size * 0.4,
              background: `oklch(0.75 0.22 ${p.hue})`,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
