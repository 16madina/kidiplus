/**
 * Out-of-band heart ticks so FloatingHearts can animate without forcing the
 * whole live viewer / host screen to re-render on every like.
 */

let tick = 0;
const listeners = new Set<() => void>();

export function bumpHeart(count = 1): void {
  const n = Math.max(1, Math.floor(count));
  tick += n;
  listeners.forEach((l) => l());
}

export function getHeartTick(): number {
  return tick;
}

export function subscribeHeartTick(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
