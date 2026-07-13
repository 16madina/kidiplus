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
  "Kids",
  "Toys",
  "Sports",
  "Books",
  "Music",
  "Art",
  "Collectibles",
  "Vintage",
  "Streetwear",
  "Luxury",
  "Pets",
  "Food",
  "Wellness",
  "Handmade",
  "Cars",
  "Other",
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
  Kids: "categories.kids",
  Toys: "categories.toys",
  Sports: "categories.sports",
  Books: "categories.books",
  Music: "categories.music",
  Art: "categories.art",
  Collectibles: "categories.collectibles",
  Vintage: "categories.vintage",
  Streetwear: "categories.streetwear",
  Luxury: "categories.luxury",
  Pets: "categories.pets",
  Food: "categories.food",
  Wellness: "categories.wellness",
  Handmade: "categories.handmade",
  Cars: "categories.cars",
  Other: "categories.other",
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
  Kids: "Enfants & bébé",
  Toys: "Jouets",
  Sports: "Sport & fitness",
  Books: "Livres & BD",
  Music: "Musique & instruments",
  Art: "Art & design",
  Collectibles: "Objets de collection",
  Vintage: "Vintage & seconde main",
  Streetwear: "Streetwear",
  Luxury: "Luxe",
  Pets: "Animaux",
  Food: "Épicerie & gourmandises",
  Wellness: "Bien-être & santé",
  Handmade: "Fait main",
  Cars: "Auto & moto",
  Other: "Autre",
};
