// Pre-launch live crowd simulation (comments + viewer count + fake bids).
//
// Host generates activity; everyone else just sees the existing realtime
// events. No fake Stripe/PayPal charges — simulated bidders never hit RPCs.
//
// Turn OFF for production:
//   1. Set VITE_PRELAUNCH_LIVE_SIM=0, or
//   2. Wait until after PRELAUNCH_SIM_UNTIL (auto-expires Monday 24 Aug 2026).
// Force ON after that date: VITE_PRELAUNCH_LIVE_SIM=1

/** Inclusive end of the filming window (Monday 24 Aug 2026, America/New_York). */
export const PRELAUNCH_SIM_UNTIL = new Date("2026-08-25T03:59:59.000Z");

const SIM_PREFIX = "sim:";

export function isPrelaunchLiveSimEnabled(): boolean {
  const env = String(import.meta.env.VITE_PRELAUNCH_LIVE_SIM ?? "").trim();
  if (env === "0" || env.toLowerCase() === "false") return false;
  if (env === "1" || env.toLowerCase() === "true") return true;
  return Date.now() <= PRELAUNCH_SIM_UNTIL.getTime();
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

export function nextSimViewerCount(prev: number, dir: 1 | -1): { count: number; dir: 1 | -1 } {
  let nextDir: 1 | -1 = dir;
  if (Math.random() < 0.14) nextDir = dir === 1 ? -1 : 1;
  let count = prev + nextDir * (1 + rand(8));
  if (count >= 160) {
    count = 160 - rand(4);
    nextDir = -1;
  }
  if (count <= 50) {
    count = 50 + rand(5);
    nextDir = 1;
  }
  return { count, dir: nextDir };
}

export function initialSimViewerCount(): number {
  return 50 + rand(41); // 50–90
}
