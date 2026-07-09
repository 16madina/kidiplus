// Floating hearts overlay — chemin ultra-rapide :
//   - Aucun state React, aucun re-render (immunise contre le fps drop
//     quand des milliers de cœurs arrivent).
//   - Chaque cœur = un <div> ajouté directement au DOM avec une
//     animation CSS keyframe, retiré sur `animationend`.
//   - Coalescence via rAF + cap dur du nombre de cœurs simultanés.
import { useEffect, useRef } from "react";

const MAX_LIVE = 18;              // cœurs simultanément à l'écran
const MAX_SPAWNS_PER_FRAME = 2;   // évite le fork bomb visuel
const HEART_TTL_MS = 1500;

export function FloatingHearts({
  trigger,
}: {
  /** Increment this number to spawn a heart. */
  trigger: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(0);
  const liveCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTriggerRef = useRef(trigger);

  useEffect(() => {
    if (trigger === 0) return;
    const delta = Math.max(1, trigger - lastTriggerRef.current);
    lastTriggerRef.current = trigger;
    pendingRef.current = Math.min(pendingRef.current + delta, MAX_LIVE * 2);

    if (rafRef.current != null) return;
    const flush = () => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) {
        pendingRef.current = 0;
        return;
      }
      const room = Math.max(0, MAX_LIVE - liveCountRef.current);
      const spawn = Math.min(pendingRef.current, MAX_SPAWNS_PER_FRAME, room);
      if (spawn > 0) {
        pendingRef.current -= spawn;
        for (let i = 0; i < spawn; i++) spawnHeart(el);
      } else {
        // pas de place, on jette pour ne pas accumuler
        pendingRef.current = Math.min(pendingRef.current, MAX_LIVE);
      }
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

  function spawnHeart(root: HTMLDivElement) {
    const node = document.createElement("div");
    const size = 22 + Math.random() * 18;
    const drift = -30 + Math.random() * 60;
    const hue = 350 + Math.random() * 30;
    const startX = -20 - Math.random() * 40;
    node.className = "kidi-heart";
    node.style.setProperty("--start-x", `${startX}px`);
    node.style.setProperty("--drift", `${drift}px`);
    node.style.setProperty("--rise", `${-220 - Math.random() * 80}px`);
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 21s-7-4.35-9.5-9.5C.9 8 3 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 4.5 23.1 8 21.5 11.5 19 16.65 12 21 12 21z" fill="oklch(0.72 0.22 ${hue})" stroke="white" stroke-opacity="0.9" stroke-width="1"/></svg>`;
    liveCountRef.current += 1;
    const cleanup = () => {
      liveCountRef.current = Math.max(0, liveCountRef.current - 1);
      node.remove();
    };
    node.addEventListener("animationend", cleanup, { once: true });
    // Filet de sécurité si animationend est manqué (onglet inactif).
    setTimeout(() => {
      if (node.isConnected) cleanup();
    }, HEART_TTL_MS + 400);
    root.appendChild(node);
  }

  return (
    <>
      <style>{HEART_CSS}</style>
      <div
        ref={containerRef}
        className="pointer-events-none absolute bottom-24 right-4 z-40"
        style={{ height: 1, width: 1 }}
      />
    </>
  );
}

const HEART_CSS = `
.kidi-heart {
  position: absolute;
  right: 0;
  bottom: 0;
  will-change: transform, opacity;
  transform: translate3d(var(--start-x), 0, 0) scale(0.6);
  opacity: 0;
  animation: kidi-heart-rise 1.5s cubic-bezier(.32,.72,0,1) forwards;
}
@keyframes kidi-heart-rise {
  0%   { transform: translate3d(var(--start-x), 0, 0) scale(0.6); opacity: 0; }
  15%  { opacity: 1; transform: translate3d(calc(var(--start-x) + var(--drift) * 0.15), calc(var(--rise) * 0.15), 0) scale(1.1); }
  75%  { opacity: 1; transform: translate3d(calc(var(--start-x) + var(--drift) * 0.75), calc(var(--rise) * 0.75), 0) scale(1); }
  100% { opacity: 0; transform: translate3d(calc(var(--start-x) + var(--drift)), var(--rise), 0) scale(0.9); }
}
`;
