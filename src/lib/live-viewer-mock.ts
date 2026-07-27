// Mock data + simulation helpers for the live viewer screen.

const FRENCH_USERS = [
  "julie_p", "kevin.94", "marion", "sofiane", "lea_style", "amine_ttv",
  "clemence", "thomas.b", "elodie", "yanis75", "camille_r", "nadir",
  "aurelie", "mehdi.k", "manon", "hugo_j", "sarah.m", "farah",
  "romain", "chloe_x", "ines.mrl", "adam_lyon", "victoire", "noa93",
  "louise", "raphael", "sabrina", "younes", "margaux", "bilel",
];

const USER_COLORS = [
  "oklch(0.75 0.16 30)",
  "oklch(0.78 0.14 200)",
  "oklch(0.8 0.16 140)",
  "oklch(0.78 0.16 60)",
  "oklch(0.75 0.18 320)",
  "oklch(0.8 0.14 260)",
  "oklch(0.78 0.16 100)",
  "oklch(0.75 0.18 10)",
];

const MESSAGES = [
  "je prends !", "taille 40 dispo ?", "trop belle 😍", "prix ?",
  "combien la livraison ?", "MDR", "je suis fan ❤️", "il reste en M ?",
  "envoie sur Paris ?", "authentique ?", "c'est neuf ?", "je surenchéris",
  "gooo", "🔥🔥🔥", "j'attends la suite", "tu prends PayPal ?",
  "tu fais des lots ?", "possible en 42 ?", "hâte de voir !", "top qualité",
  "chaud", "j'aime beaucoup", "pareil dispo en noir ?", "combien de temps ?",
  "je viens d'arriver 👋", "salut tout le monde", "wesh", "🥶", "propre",
  "montre encore stp", "il pèse combien ?", "matériau ?", "livré sous combien de jours ?",
];

const rand = (n: number) => Math.floor(Math.random() * n);

export type ChatSource = "kidi" | "youtube" | "facebook";

export type ChatMsg = {
  id: string;
  user: string;
  color: string;
  text: string;
  system?: boolean;
  /** Structured system lines — UI localizes (e.g. join). */
  systemKind?: "join";
  /** Profile UUID when the sender is signed in — needed for mute/block. */
  userId?: string;
  isModerator?: boolean;
  isHost?: boolean;
  /** Origin platform when the line was repatriated from social restream. */
  source?: ChatSource;
  /** Platform message id (YouTube / Facebook) for reply + dedupe. */
  externalId?: string;
  replyTo?: {
    user: string;
    userId?: string;
    text: string;
  };
};

let msgId = 0;
export function nextChatMessage(): ChatMsg {
  const u = FRENCH_USERS[rand(FRENCH_USERS.length)];
  return {
    id: `m-${++msgId}-${Date.now()}`,
    user: u,
    color: USER_COLORS[hash(u) % USER_COLORS.length],
    text: MESSAGES[rand(MESSAGES.length)],
  };
}

export function systemMessage(text: string): ChatMsg {
  return {
    id: `sys-${++msgId}-${Date.now()}`,
    user: "",
    color: "",
    text,
    system: true,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Products for the stream
export type Product = {
  id: string;
  name: string;
  image: string;
  mode: "auction" | "fixed";
  startBid: number;
  price: number; // current or fixed
  status: "upcoming" | "current" | "sold";
  winner?: string;
  /** Compact meta under the name (brand · color · size · condition). */
  metaLine?: string;
  description?: string | null;
  colors?: string[];
  sizes?: string[];
};

const PRODUCT_POOL: Omit<Product, "id" | "status">[] = [
  { name: "Nike Dunk Low Panda", image: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=70", mode: "auction", startBid: 80, price: 80 },
  { name: "Yeezy Boost 350 V2", image: "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&q=70", mode: "auction", startBid: 120, price: 120 },
  { name: "Jordan 4 Retro", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70", mode: "fixed", startBid: 0, price: 220 },
  { name: "New Balance 550", image: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&q=70", mode: "auction", startBid: 60, price: 60 },
  { name: "Sac Louis Vuitton vintage", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&q=70", mode: "fixed", startBid: 0, price: 480 },
  { name: "Chaîne argent 925", image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400&q=70", mode: "auction", startBid: 35, price: 35 },
  { name: "iPhone 13 reconditionné", image: "https://images.unsplash.com/photo-1592286927505-1def25115558?w=400&q=70", mode: "fixed", startBid: 0, price: 349 },
];

export function makeProducts(): Product[] {
  return PRODUCT_POOL.map((p, i) => ({
    ...p,
    id: `p-${i}`,
    status: i === 0 ? "current" : "upcoming",
  }));
}

export function randomBidder(): string {
  return FRENCH_USERS[rand(FRENCH_USERS.length)];
}

export function bidStep(): number {
  return 1 + rand(3);
}

// Legacy helper — kept as a thin shim that defaults to EUR.
// New code should call formatMoney(amount, currency, locale) directly.
import { formatMoney } from "@/lib/money";
export function formatEuro(n: number): string {
  return formatMoney(n, "EUR", "fr");
}
