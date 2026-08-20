/** Baobab d'or — grows for 3s, then the leaves fall asleep. */

export const BAOBAB_GROW_S = 3;
/** Leaves droop, detach, land, and rest. */
export const BAOBAB_SLEEP_S = 3.6;
export const BAOBAB_FADE_S = 0.7;
export const BAOBAB_DURATION_MS = Math.round((BAOBAB_GROW_S + BAOBAB_SLEEP_S + BAOBAB_FADE_S) * 1000);

export const BAOBAB_PHASE = {
  sproutEnd: 0.45,
  trunkEnd: 1.35,
  branchEnd: 2.25,
  growEnd: BAOBAB_GROW_S,
  sleepEnd: BAOBAB_GROW_S + BAOBAB_SLEEP_S,
} as const;
