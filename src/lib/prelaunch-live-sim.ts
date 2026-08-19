// Pre-launch live crowd simulation (comments + viewer count + fake bids).
//
// Config lives in admin → tab « Simu » (`app_config.prelaunch_live_sim` JSON).
// Hosts poll it; no per-live controls. Reviewers never see the admin panel.
//
// Emergency build override (optional):
//   VITE_PRELAUNCH_LIVE_SIM=0 → force off
//   VITE_PRELAUNCH_LIVE_SIM=1 → force on (settings still from remote / defaults)

import { supabase } from "@/integrations/supabase/client";

export const PRELAUNCH_LIVE_SIM_CONFIG_KEY = "prelaunch_live_sim";

export type PrelaunchLiveSimConfig = {
  enabled: boolean;
  /** Fake viewer count floor. */
  viewersMin: number;
  /** Fake viewer count ceiling. */
  viewersMax: number;
  /** Seconds between comments (min). */
  commentEverySecMin: number;
  /** Seconds between comments (max). */
  commentEverySecMax: number;
  /** Inject fake auction bids. */
  fakeBids: boolean;
  /** Seconds between fake bids (min). */
  bidEverySecMin: number;
  /** Seconds between fake bids (max). */
  bidEverySecMax: number;
  /** Chance (0–100) that a comment tick also sends a heart. */
  heartChancePct: number;
};

export const DEFAULT_PRELAUNCH_LIVE_SIM: PrelaunchLiveSimConfig = {
  enabled: false,
  viewersMin: 50,
  viewersMax: 160,
  commentEverySecMin: 1,
  commentEverySecMax: 3,
  fakeBids: true,
  bidEverySecMin: 1,
  bidEverySecMax: 3,
  heartChancePct: 18,
};

const SIM_PREFIX = "sim:";

type Listener = (cfg: PrelaunchLiveSimConfig) => void;

let remoteCache: PrelaunchLiveSimConfig | null = null;
const listeners = new Set<Listener>();

function envOverride(): boolean | null {
  const env = String(import.meta.env.VITE_PRELAUNCH_LIVE_SIM ?? "").trim();
  if (env === "0" || env.toLowerCase() === "false") return false;
  if (env === "1" || env.toLowerCase() === "true") return true;
  return null;
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function clampBool(n: unknown, fallback: boolean): boolean {
  if (typeof n === "boolean") return n;
  if (n === 1 || n === "1" || n === "true" || n === "on") return true;
  if (n === 0 || n === "0" || n === "false" || n === "off") return false;
  return fallback;
}

/** Normalize any stored payload (legacy "0"/"1" or partial JSON). */
export function parsePrelaunchLiveSimConfig(raw: string | null | undefined): PrelaunchLiveSimConfig {
  const d = DEFAULT_PRELAUNCH_LIVE_SIM;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ...d };

  // Legacy flat flag
  if (trimmed === "0" || trimmed.toLowerCase() === "false" || trimmed === "off") {
    return { ...d, enabled: false };
  }
  if (trimmed === "1" || trimmed.toLowerCase() === "true" || trimmed === "on") {
    return { ...d, enabled: true };
  }

  try {
    const j = JSON.parse(trimmed) as Partial<PrelaunchLiveSimConfig>;
    let viewersMin = clampInt(j.viewersMin, 1, 5000, d.viewersMin);
    let viewersMax = clampInt(j.viewersMax, 1, 5000, d.viewersMax);
    if (viewersMax < viewersMin) {
      const t = viewersMin;
      viewersMin = viewersMax;
      viewersMax = t;
    }
    let commentEverySecMin = clampInt(j.commentEverySecMin, 1, 120, d.commentEverySecMin);
    let commentEverySecMax = clampInt(j.commentEverySecMax, 1, 120, d.commentEverySecMax);
    if (commentEverySecMax < commentEverySecMin) {
      const t = commentEverySecMin;
      commentEverySecMin = commentEverySecMax;
      commentEverySecMax = t;
    }
    let bidEverySecMin = clampInt(j.bidEverySecMin, 1, 120, d.bidEverySecMin);
    let bidEverySecMax = clampInt(j.bidEverySecMax, 1, 120, d.bidEverySecMax);
    if (bidEverySecMax < bidEverySecMin) {
      const t = bidEverySecMin;
      bidEverySecMin = bidEverySecMax;
      bidEverySecMax = t;
    }
    return {
      enabled: clampBool(j.enabled, d.enabled),
      viewersMin,
      viewersMax,
      commentEverySecMin,
      commentEverySecMax,
      fakeBids: clampBool(j.fakeBids, d.fakeBids),
      bidEverySecMin,
      bidEverySecMax,
      heartChancePct: clampInt(j.heartChancePct, 0, 100, d.heartChancePct),
    };
  } catch {
    return { ...d };
  }
}

function withEnvOverride(cfg: PrelaunchLiveSimConfig): PrelaunchLiveSimConfig {
  const forced = envOverride();
  if (forced === null) return cfg;
  return { ...cfg, enabled: forced };
}

function notify(cfg: PrelaunchLiveSimConfig) {
  remoteCache = cfg;
  listeners.forEach((cb) => {
    try {
      cb(cfg);
    } catch {
      /* ignore */
    }
  });
}

export function getCachedPrelaunchLiveSimConfig(): PrelaunchLiveSimConfig {
  return withEnvOverride(remoteCache ?? { ...DEFAULT_PRELAUNCH_LIVE_SIM });
}

/** Sync read — uses env override, then last fetched remote value (default off). */
export function isPrelaunchLiveSimEnabled(): boolean {
  return getCachedPrelaunchLiveSimConfig().enabled;
}

async function fetchStoredPrelaunchLiveSimConfig(): Promise<PrelaunchLiveSimConfig> {
  // Prefer SECURITY DEFINER RPC (works even if table RLS is tight).
  try {
    const { data, error } = await supabase.rpc("get_prelaunch_live_sim");
    if (!error && data != null) {
      return parsePrelaunchLiveSimConfig(typeof data === "string" ? data : String(data));
    }
  } catch {
    /* fall through */
  }
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", PRELAUNCH_LIVE_SIM_CONFIG_KEY)
      .maybeSingle();
    if (error) throw error;
    return parsePrelaunchLiveSimConfig(data?.value);
  } catch {
    return { ...DEFAULT_PRELAUNCH_LIVE_SIM, enabled: false };
  }
}

export async function fetchPrelaunchLiveSimConfig(): Promise<PrelaunchLiveSimConfig> {
  const stored = await fetchStoredPrelaunchLiveSimConfig();
  const cfg = withEnvOverride(stored);
  notify(cfg);
  return cfg;
}

/** Admin read: stored values without env override (so the panel shows the real DB flag). */
export async function fetchPrelaunchLiveSimConfigForAdmin(): Promise<PrelaunchLiveSimConfig> {
  try {
    const { data, error } = await supabase.rpc("admin_get_prelaunch_live_sim");
    if (!error && data != null) {
      const stored = parsePrelaunchLiveSimConfig(typeof data === "string" ? data : String(data));
      notify(withEnvOverride(stored));
      return stored;
    }
  } catch {
    /* fall through to table / public RPC */
  }
  const stored = await fetchStoredPrelaunchLiveSimConfig();
  notify(withEnvOverride(stored));
  return stored;
}

/** @deprecated Prefer fetchPrelaunchLiveSimConfig */
export async function fetchPrelaunchLiveSimEnabled(): Promise<boolean> {
  return (await fetchPrelaunchLiveSimConfig()).enabled;
}

/** Admin-only write of full config. Verifies the value round-trips from the DB. */
export async function savePrelaunchLiveSimConfig(
  input: PrelaunchLiveSimConfig,
): Promise<PrelaunchLiveSimConfig> {
  const toStore = parsePrelaunchLiveSimConfig(JSON.stringify(input));
  const payload = JSON.stringify(toStore);

  let savedRaw: string | null = null;

  const rpc = await supabase.rpc("admin_set_prelaunch_live_sim", { _value: payload });
  if (!rpc.error && rpc.data != null) {
    savedRaw = typeof rpc.data === "string" ? rpc.data : String(rpc.data);
  } else {
    // Fallback: direct upsert (works if admin write RLS is in place).
    const up = await supabase.from("app_config").upsert(
      {
        key: PRELAUNCH_LIVE_SIM_CONFIG_KEY,
        value: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (up.error) {
      throw new Error(
        rpc.error?.message ||
          up.error.message ||
          "Échec d’enregistrement (migration Simu manquante ?)",
      );
    }
    const verify = await supabase
      .from("app_config")
      .select("value")
      .eq("key", PRELAUNCH_LIVE_SIM_CONFIG_KEY)
      .maybeSingle();
    if (verify.error) throw new Error(verify.error.message);
    savedRaw = verify.data?.value ?? null;
  }

  if (savedRaw == null) {
    throw new Error("La base n’a pas renvoyé la config enregistrée.");
  }

  const confirmed = parsePrelaunchLiveSimConfig(savedRaw);
  notify(withEnvOverride(confirmed));
  return confirmed;
}

export function subscribePrelaunchLiveSim(listener: Listener): () => void {
  listeners.add(listener);
  if (remoteCache !== null) listener(getCachedPrelaunchLiveSimConfig());
  return () => {
    listeners.delete(listener);
  };
}

export function isSimBidderId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SIM_PREFIX);
}

export function simBidderId(name: string): string {
  return `${SIM_PREFIX}${name}`;
}

/** Stable portrait for a fake bidder (winner reveal + chat feel). */
export function simAvatarUrl(name: string): string {
  const seed = encodeURIComponent(name.replace(/^sim:/, "") || "kidi");
  return `https://i.pravatar.cc/150?u=${seed}`;
}

const NAMES = [
  "aicha_ci", "koffi.95", "mariam", "julien_paris", "fatou", "yanis75",
  "lea_style", "moussa.k", "ines.mrl", "adama", "chloe_x", "ibrahim",
  "sarah.m", "nana_abj", "thomas.b", "aminata", "hugo_j", "seydou",
  "camille_r", "awa.d", "sofiane", "keira", "mehdi.k", "yasmine",
  "romain", "diarra", "elodie", "bakary", "manon", "lamine",
  "victoire", "ousmane", "louise", "nadia_sn", "raphael", "binta",
  "farah", "cheikh", "margaux", "youssouf", "sabrina", "awa_live",
  "noa93", "khadija", "bilel", "zoe.lyon", "ismael", "myriam",
];

const CHAT = [
  "trop belle 😍", "je prends !", "prix ?", "gooo", "🔥🔥🔥",
  "taille 40 dispo ?", "il reste en M ?", "authentique ?", "c'est neuf ?",
  "envoie sur Paris ?", "combien la livraison ?", "je suis fan ❤️",
  "hâte de voir !", "top qualité", "montre encore stp", "propre",
  "chaud", "j'aime beaucoup", "tu fais des lots ?", "possible en 42 ?",
  "je viens d'arriver 👋", "salut tout le monde", "wesh", "MDR",
  "livré sous combien de jours ?", "tu prends PayPal ?", "j'attends la suite",
  "elle est canon", "last one ?", "je valide", "Abidjan aussi ?",
  "Cocody on est là", "force 💪", "c'est cadeau ou quoi 😂", "encore une !",
  "le live est chaud ce soir", "qui mène ?", "allez on surenchérit",
  "c'est quelle marque ?", "tu as d'autres couleurs ?", "stock limité ?",
  "tu livres en France ?", "et en Côte d'Ivoire ?", "frais de port ?",
  "ça fait quelle taille réel ?", "neuf ou recond ?", "tu peux zoomer ?",
  "il reste combien ?", "prochaine pièce c'est quoi ?", "tu démarres à combien ?",
];

const BID_CHAT = [
  "je surenchéris", "prend ça", "+1", "go enchère", "c'est à moi",
  "personne bouge 😤", "encore", "je relance", "allez 🔥", "moi je prends",
  "dernière chance les gens", "trop beau pour passer", "j'enchéris",
];

const COLORS = [
  "oklch(0.75 0.16 30)",
  "oklch(0.78 0.14 200)",
  "oklch(0.8 0.16 140)",
  "oklch(0.78 0.16 60)",
  "oklch(0.75 0.18 320)",
  "oklch(0.8 0.14 260)",
  "oklch(0.78 0.16 100)",
  "oklch(0.75 0.18 10)",
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: readonly T[]): T => arr[rand(arr.length)]!;

function randBetweenSec(minSec: number, maxSec: number): number {
  const a = Math.min(minSec, maxSec);
  const b = Math.max(minSec, maxSec);
  return (a + Math.random() * (b - a)) * 1000;
}

export function simColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length]!;
}

export function randomSimName(): string {
  return pick(NAMES);
}

export function randomSimChat(auctionHot: boolean): { name: string; text: string; join: boolean } {
  if (Math.random() < 0.14) {
    const name = randomSimName();
    return { name, text: name, join: true };
  }
  const name = randomSimName();
  const pool = auctionHot && Math.random() < 0.55 ? BID_CHAT : CHAT;
  return { name, text: pick(pool), join: false };
}

export function nextSimViewerCount(
  prev: number,
  dir: 1 | -1,
  viewersMin: number,
  viewersMax: number,
): { count: number; dir: 1 | -1 } {
  const lo = Math.min(viewersMin, viewersMax);
  const hi = Math.max(viewersMin, viewersMax);
  let nextDir: 1 | -1 = dir;
  if (Math.random() < 0.14) nextDir = dir === 1 ? -1 : 1;
  const step = 1 + rand(Math.max(1, Math.ceil((hi - lo) / 20)));
  let count = prev + nextDir * step;
  if (count >= hi) {
    count = hi - rand(Math.min(4, Math.max(1, hi - lo)));
    nextDir = -1;
  }
  if (count <= lo) {
    count = lo + rand(Math.min(5, Math.max(1, hi - lo)));
    nextDir = 1;
  }
  return { count, dir: nextDir };
}

export function initialSimViewerCount(viewersMin: number, viewersMax: number): number {
  const lo = Math.min(viewersMin, viewersMax);
  const hi = Math.max(viewersMin, viewersMax);
  const span = Math.max(0, hi - lo);
  // Start in the lower third of the range for a natural ramp.
  const startHi = lo + Math.max(0, Math.floor(span / 3));
  return lo + rand(Math.max(1, startHi - lo + 1));
}

export function nextCommentDelayMs(cfg: PrelaunchLiveSimConfig): number {
  return randBetweenSec(cfg.commentEverySecMin, cfg.commentEverySecMax);
}

export function nextBidDelayMs(cfg: PrelaunchLiveSimConfig): number {
  return randBetweenSec(cfg.bidEverySecMin, cfg.bidEverySecMax);
}

export function nextViewerTickMs(): number {
  return 1600 + Math.random() * 2400;
}
