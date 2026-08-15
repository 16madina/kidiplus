// Virtual gift catalog for live shopping. MUST stay in sync with the
// server-side `_gift_price(_key, _currency)` SQL function — clients only
// send `gift_key`; prices are resolved server-side.
//
// Tier drives the animation size:
//   1 = light float-up (Rose, Cœur d'or)
//   2 = center pop + glow + small confetti (Diamant, Couronne)
//   3 = full-width banner sweep + big animation + gold glow (Fusée, Lion)
import { normalizeCurrency, type Currency } from "@/lib/money";

export type GiftKey =
  | "rose"
  | "heart"
  | "diamond"
  | "crown"
  | "rocket"
  | "lion"
  | "kidi";

export type GiftDef = {
  key: GiftKey;
  emoji: string;
  /** Optional branded artwork shown instead of the emoji in the gift tray. */
  imageSrc?: string;
  /** i18n key under `gifts.name.<key>` */
  nameKey: string;
  tier: 1 | 2 | 3;
  prices: Record<Currency, number>;
};

export const GIFT_CATALOG: GiftDef[] = [
  {
    key: "rose",
    emoji: "🌹",
    nameKey: "gifts.name.rose",
    tier: 1,
    prices: { XOF: 100, EUR: 0.5, CAD: 1, USD: 0.5, GBP: 0.5 },
  },
  {
    key: "heart",
    emoji: "💛",
    nameKey: "gifts.name.heart",
    tier: 1,
    prices: { XOF: 250, EUR: 1, CAD: 1.5, USD: 1, GBP: 1 },
  },
  {
    key: "diamond",
    emoji: "💎",
    nameKey: "gifts.name.diamond",
    tier: 2,
    prices: { XOF: 500, EUR: 2, CAD: 3, USD: 2, GBP: 2 },
  },
  {
    key: "crown",
    emoji: "👑",
    nameKey: "gifts.name.crown",
    tier: 2,
    prices: { XOF: 1000, EUR: 4, CAD: 6, USD: 4, GBP: 4 },
  },
  {
    key: "rocket",
    emoji: "🚀",
    nameKey: "gifts.name.rocket",
    tier: 3,
    prices: { XOF: 2500, EUR: 8, CAD: 12, USD: 8, GBP: 8 },
  },
  {
    key: "lion",
    emoji: "🦁",
    nameKey: "gifts.name.lion",
    tier: 3,
    prices: { XOF: 5000, EUR: 15, CAD: 22, USD: 15, GBP: 15 },
  },
  {
    key: "kidi",
    emoji: "🎁",
    imageSrc: "/kidi-plus-logo.png",
    nameKey: "gifts.name.kidi",
    tier: 3,
    prices: { XOF: 5000, EUR: 10, CAD: 15, USD: 10, GBP: 10 },
  },
];

export function giftByKey(key: string): GiftDef | null {
  return GIFT_CATALOG.find((g) => g.key === key) ?? null;
}

export function giftPrice(key: GiftKey, currency: string | null | undefined): number {
  const cur = normalizeCurrency(currency);
  const g = giftByKey(key);
  return g?.prices[cur] ?? 0;
}
