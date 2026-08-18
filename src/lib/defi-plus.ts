/** Défi Plus intro — drawn motion, not pasted storyboard stills. */

import { BATTLE_COUNTDOWN_SEC } from "@/lib/battle-constants";

export const DEFI_PLUS_COUNT_FROM = 10;
export const DEFI_PLUS_HIT_S = 10;
/** Same window as the live battle intro (`startedAt` → match clock). */
export const DEFI_PLUS_DURATION_MS = BATTLE_COUNTDOWN_SEC * 1000;

/** Seconds on the clock when each visual beat happens. */
export const PHASE = {
  /** 10–8: DÉFI and + meet in the middle */
  enterEnd: 2.2,
  /** 8–7: threads braid */
  braidEnd: 4,
  /** 6: threads become the DÉFI + circle */
  medalReady: 5,
  /** 5–1: heartbeats, one per second */
  beatStart: 5,
} as const;

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function range(t: number, a: number, b: number) {
  if (b === a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

export function easeOutCubic(u: number) {
  return 1 - (1 - u) ** 3;
}

export function easeInCubic(u: number) {
  return u * u * u;
}

export function easeInOutCubic(u: number) {
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

export function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

/** Continuous ease — no hard stop between phases. */
export function smootherstep(u: number) {
  const x = clamp01(u);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Ease in, then constant speed — never parks before the end. */
export function cruise(u: number) {
  const x = clamp01(u);
  if (x < 0.12) return easeInCubic(x / 0.12) * 0.12;
  return x;
}

/** Double beat: boom… boom — 1 second cycle. */
export function heartbeat(t: number) {
  const u = t - Math.floor(t);
  if (u < 0.13) return Math.sin((u / 0.13) * Math.PI);
  if (u > 0.18 && u < 0.32) return 0.58 * Math.sin(((u - 0.18) / 0.14) * Math.PI);
  return 0;
}

export function defiPlusRemaining(elapsedMs: number): number {
  return Math.max(0, DEFI_PLUS_COUNT_FROM - Math.floor(elapsedMs / 1000));
}

/** Wall-clock elapsed so host, guest seller, and viewers share one countdown. */
export function defiPlusElapsedMs(startsAt: number, now = Date.now()) {
  return Math.max(0, now - startsAt);
}

export function isDefiPlusIntroActive(startsAt: number | null | undefined, now = Date.now()) {
  if (startsAt == null || !Number.isFinite(startsAt)) return false;
  return defiPlusElapsedMs(startsAt, now) < DEFI_PLUS_DURATION_MS;
}
