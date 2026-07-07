// Mock data for the Search "browse" default state.
// Each item exposes a `nameKey` (i18n key) — the display component reads it
// through t(nameKey). `name` is kept as a French fallback / free-text search
// term when tapping routes into the search results.

export type Trend = {
  id: string;
  name: string;
  nameKey: string;
  viewers: number;
  image: string;
};

export const TRENDS: Trend[] = [
  {
    id: "t1",
    name: "Bijoux en or",
    nameKey: "search.trends.goldJewelry",
    viewers: 1100,
    image:
      "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t2",
    name: "Sacs de luxe",
    nameKey: "search.trends.luxuryBags",
    viewers: 1200,
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t3",
    name: "Parfums",
    nameKey: "search.trends.perfumes",
    viewers: 890,
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t4",
    name: "Maillots",
    nameKey: "search.trends.swimwear",
    viewers: 143,
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t5",
    name: "Montres",
    nameKey: "search.trends.watches",
    viewers: 25,
    image:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t6",
    name: "Sneakers",
    nameKey: "search.trends.sneakers",
    viewers: 2100,
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t7",
    name: "Cartes Pokémon",
    nameKey: "search.trends.pokemonCards",
    viewers: 640,
    image:
      "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t8",
    name: "Manettes gaming",
    nameKey: "search.trends.gamingControllers",
    viewers: 320,
    image:
      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=200&q=80&auto=format&fit=crop",
  },
];

export type BrowseCategory = {
  id: string;
  name: string;
  nameKey: string;
  viewers: number;
  image: string;
  /** Query term routed to the search results when the card is tapped. */
  query: string;
};

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: "beaute",
    name: "Beauté",
    nameKey: "search.cats.beauty",
    viewers: 14200,
    query: "Beauty",
    image:
      "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "mode-femme",
    name: "Mode femme",
    nameKey: "search.cats.womenFashion",
    viewers: 8600,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "mode-homme",
    name: "Mode homme",
    nameKey: "search.cats.menFashion",
    viewers: 5200,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "sacs",
    name: "Sacs & accessoires",
    nameKey: "search.cats.bagsAccessories",
    viewers: 6100,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "parfums",
    name: "Parfums",
    nameKey: "search.cats.perfumes",
    viewers: 3400,
    query: "Beauty",
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "bijoux",
    name: "Bijoux",
    nameKey: "search.cats.jewelry",
    viewers: 4800,
    query: "Jewelry",
    image:
      "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "montres",
    name: "Montres",
    nameKey: "search.cats.watches",
    viewers: 2200,
    query: "Jewelry",
    image:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "electronique",
    name: "Électronique",
    nameKey: "search.cats.electronics",
    viewers: 7400,
    query: "Electronics",
    image:
      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "jeux-video",
    name: "Jeux vidéo",
    nameKey: "search.cats.gaming",
    viewers: 3900,
    query: "Electronics",
    image:
      "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "sneakers",
    name: "Sneakers",
    nameKey: "search.cats.sneakers",
    viewers: 11500,
    query: "Sneakers",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "maison",
    name: "Maison",
    nameKey: "search.cats.home",
    viewers: 1600,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "destockage",
    name: "Déstockage & lots",
    nameKey: "search.cats.destock",
    viewers: 980,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=300&q=80&auto=format&fit=crop",
  },
];

/**
 * Locale-aware viewer count. Kept named `formatViewersFr` for backwards
 * compatibility; delegates to the shared locale formatter.
 * @deprecated import { formatCount } from "@/i18n/format" and pass lang explicitly.
 */
export function formatViewersFr(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    const s = v.toFixed(1).replace(".", ",");
    return `${s.endsWith(",0") ? s.slice(0, -2) : s} k`;
  }
  return String(n);
}
