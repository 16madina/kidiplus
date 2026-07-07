// Mock data for the Search "browse" default state.
// - Trending topics (Tendances du jour): horizontal 2-row scroll
// - Category grid (Catégories): 2-column floating-product cards

export type Trend = {
  id: string;
  name: string;
  viewers: number;
  image: string;
};

export const TRENDS: Trend[] = [
  {
    id: "t1",
    name: "Bijoux en or",
    viewers: 1100,
    image:
      "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t2",
    name: "Sacs de luxe",
    viewers: 1200,
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t3",
    name: "Parfums",
    viewers: 890,
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t4",
    name: "Maillots",
    viewers: 143,
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t5",
    name: "Montres",
    viewers: 25,
    image:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t6",
    name: "Sneakers",
    viewers: 2100,
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t7",
    name: "Cartes Pokémon",
    viewers: 640,
    image:
      "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=200&q=80&auto=format&fit=crop",
  },
  {
    id: "t8",
    name: "Manettes gaming",
    viewers: 320,
    image:
      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=200&q=80&auto=format&fit=crop",
  },
];

export type BrowseCategory = {
  id: string;
  name: string;
  viewers: number;
  image: string;
  /** Query term routed to the search results when the card is tapped. */
  query: string;
};

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: "beaute",
    name: "Beauté",
    viewers: 14200,
    query: "Beauty",
    image:
      "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "mode-femme",
    name: "Mode femme",
    viewers: 8600,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "mode-homme",
    name: "Mode homme",
    viewers: 5200,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "sacs",
    name: "Sacs & accessoires",
    viewers: 6100,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "parfums",
    name: "Parfums",
    viewers: 3400,
    query: "Beauty",
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "bijoux",
    name: "Bijoux",
    viewers: 4800,
    query: "Jewelry",
    image:
      "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "montres",
    name: "Montres",
    viewers: 2200,
    query: "Jewelry",
    image:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "electronique",
    name: "Électronique",
    viewers: 7400,
    query: "Electronics",
    image:
      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "jeux-video",
    name: "Jeux vidéo",
    viewers: 3900,
    query: "Electronics",
    image:
      "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "sneakers",
    name: "Sneakers",
    viewers: 11500,
    query: "Sneakers",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "maison",
    name: "Maison",
    viewers: 1600,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "destockage",
    name: "Déstockage & lots",
    viewers: 980,
    query: "Fashion",
    image:
      "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=300&q=80&auto=format&fit=crop",
  },
];

/**
 * French number formatting for viewer counts.
 *  - 1100  -> "1,1 k"
 *  - 14200 -> "14,2 k"
 *  - 890   -> "890"
 * Uses a comma as the decimal separator (French convention) and drops
 * trailing ",0".
 */
export function formatViewersFr(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    const s = v.toFixed(1).replace(".", ",");
    return `${s.endsWith(",0") ? s.slice(0, -2) : s} k`;
  }
  return String(n);
}
