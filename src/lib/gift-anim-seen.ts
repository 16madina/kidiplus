/**
 * Session-wide gift animation dedupe.
 *
 * GiftAnimationsLayer / GiftComboFeed remount when leaving & re-entering a live
 * (or when the shell remounts). Their local seenRefs reset, but `lastGift` in
 * useLiveRoom can still hold the last event — without a module-level set the
 * same gift would replay on screen.
 */
const seen = new Set<string>();
const MAX = 400;

/** Gifts older than this are treated as history, never animated on join.
 * Keep generous — device clocks are often minutes skewed vs the DB. */
export const GIFT_ANIM_MAX_AGE_MS = 5 * 60_000;

export function rememberGiftAnim(id: string): boolean {
  if (!id) return false;
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > MAX) {
    const arr = Array.from(seen);
    for (const k of arr.slice(0, arr.length - MAX / 2)) seen.delete(k);
  }
  return true;
}

export function isGiftAnimStale(ts: number | undefined, now = Date.now()): boolean {
  if (!ts || !Number.isFinite(ts)) return false;
  return now - ts > GIFT_ANIM_MAX_AGE_MS;
}

export function clearGiftAnimSeen(): void {
  seen.clear();
}
