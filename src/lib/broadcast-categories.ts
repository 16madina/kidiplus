// Broadcast setup category picker — single source of truth.
//
// The value stored in `broadcast.category` (and in the `lives.category`
// column) is the STABLE KEY (English, machine-friendly). The visible label
// is always resolved via i18n through `BROADCAST_CATEGORY_LABEL_KEY`.
//
// Keep this list aligned with the home feed / discovery filters so a live
// created in setup surfaces under a matching home category.

export const BROADCAST_CATEGORY_KEYS = [
  "Beauty",
  "Fashion",
  "Bags",
  "Perfumes",
  "Jewelry",
  "Watches",
  "Electronics",
  "Games",
  "Sneakers",
  "Home",
  "Bundles",
] as const;

export type BroadcastCategoryKey = (typeof BROADCAST_CATEGORY_KEYS)[number];

export const BROADCAST_CATEGORY_LABEL_KEY: Record<BroadcastCategoryKey, string> = {
  Beauty: "categories.beauty",
  Fashion: "categories.fashion",
  Bags: "categories.bagsAccessories",
  Perfumes: "categories.perfumes",
  Jewelry: "categories.jewelry",
  Watches: "categories.watches",
  Electronics: "categories.electronics",
  Games: "categories.games",
  Sneakers: "categories.sneakers",
  Home: "categories.home",
  Bundles: "categories.bundles",
};

/** Fallback French labels — used if i18n key is missing (defensive). */
export const BROADCAST_CATEGORY_FR_FALLBACK: Record<BroadcastCategoryKey, string> = {
  Beauty: "Beauté",
  Fashion: "Mode",
  Bags: "Sacs & accessoires",
  Perfumes: "Parfums",
  Jewelry: "Bijoux",
  Watches: "Montres",
  Electronics: "Électronique",
  Games: "Jeux vidéo",
  Sneakers: "Sneakers",
  Home: "Maison",
  Bundles: "Déstockage & lots",
};
