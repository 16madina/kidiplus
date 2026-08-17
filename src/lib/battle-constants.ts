/** Défi Plus — constants shared by the live challenge UI and backend. */

/** i18n key for the product name. Change `battle.brand` in FR/EN to rename everywhere. */
export const BATTLE_BRAND_I18N_KEY = "battle.brand";

export const BATTLE_DURATIONS_SEC = [600, 900, 1200, 1800] as const;
export const BATTLE_DEFAULT_DURATION_SEC = 900;
export const BATTLE_INVITE_TTL_SEC = 60;
export const BATTLE_COUNTDOWN_SEC = 5;
export const BATTLE_TURN_SEC = 120;
export const BATTLE_SUDDEN_DEATH_SEC = 30;
export const BATTLE_SUDDEN_DEATH_MAX_SEC = 600;
export const BATTLE_FORFEIT_GRACE_SEC = 30;

export type BattleDurationSec = (typeof BATTLE_DURATIONS_SEC)[number];

export const BATTLE_PROTO_DEMO_SEC = 90;
