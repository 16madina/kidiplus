// Virtual gift catalog for live shopping. MUST stay in sync with the
// server-side `_gift_price(_key, _currency)` SQL function — clients only
// send `gift_key`; prices are resolved server-side.
//
// Tier drives the animation size:
//   1 = light float-up (Rose, Cœur d'or)
//   2 = center pop + glow + small confetti (Diamant, Couronne)
//   3 = full-width banner sweep + big animation + gold glow (Fusée, Lion)
import { normalizeCurrency, type Currency } from "@/lib/money";

export type GiftKey = "rose" | "heart" | "diamond" | "crown" | "rocket" | "lion";

export type GiftDef = {
  key: GiftKey;
  emoji: string;
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
    prices: { XOF: 100, EUR: 0.5, CAD: 1 },
  },
  {
    key: "heart",
    emoji: "💛",
    nameKey: "gifts.name.heart",
    tier: 1,
    prices: { XOF: 250, EUR: 1, CAD: 1.5 },
  },
  {
    key: "diamond",
    emoji: "💎",
    nameKey: "gifts.name.diamond",
    tier: 2,
    prices: { XOF: 500, EUR: 2, CAD: 3 },
  },
  {
    key: "crown",
    emoji: "👑",
    nameKey: "gifts.name.crown",
    tier: 2,
    prices: { XOF: 1000, EUR: 4, CAD: 6 },
  },
  {
    key: "rocket",
    emoji: "🚀",
    nameKey: "gifts.name.rocket",
    tier: 3,
    prices: { XOF: 2500, EUR: 8, CAD: 12 },
  },
  {
    key: "lion",
    emoji: "🦁",
    nameKey: "gifts.name.lion",
    tier: 3,
    prices: { XOF: 5000, EUR: 15, CAD: 22 },
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
