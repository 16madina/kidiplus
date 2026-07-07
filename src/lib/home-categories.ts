import type { Category, LiveStream } from "@/lib/live-mock";

export type HomeCategory =
  | "Pour toi"
  | "Beauté"
  | "Sacs & accessoires"
  | "Parfums"
  | "Mode"
  | "Bijoux"
  | "Électronique";

export const HOME_CATEGORIES: HomeCategory[] = [
  "Pour toi",
  "Beauté",
  "Sacs & accessoires",
  "Parfums",
  "Mode",
  "Bijoux",
  "Électronique",
];

type Meta = {
  /** Underlying stream categories to include when this tile is active. */
  match: Array<Exclude<Category, "For You">> | "all";
  /** Product image displayed in the lower portion of the tile. */
  image?: string;
  /** Soft pastel-to-neutral gradient (top-left → bottom-right). */
  gradient: string;
};

export const HOME_CATEGORY_META: Record<HomeCategory, Meta> = {
  "Pour toi": {
    match: "all",
    gradient: "linear-gradient(135deg, #FFF4D6 0%, #FDE7C3 100%)",
  },
  "Beauté": {
    match: ["Beauty"],
    image:
      "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #FFE1EC 0%, #FFD4E0 100%)",
  },
  "Sacs & accessoires": {
    match: ["Fashion"],
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #E9E2D5 0%, #D9CFBE 100%)",
  },
  "Parfums": {
    match: ["Beauty"],
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #F5E6D3 0%, #EED2B6 100%)",
  },
  "Mode": {
    match: ["Fashion"],
    image:
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #E0E7FF 0%, #C9D4F5 100%)",
  },
  "Bijoux": {
    match: ["Jewelry"],
    image:
      "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #FFF1CC 0%, #F5DE9A 100%)",
  },
  "Électronique": {
    match: ["Electronics"],
    image:
      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=300&q=80&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #E4EEF5 0%, #CBDCEB 100%)",
  },
};

export type HomeFilter =
  | "Recommandés"
  | "Achat immédiat"
  | "Populaires"
  | "Nouveautés";

export const HOME_FILTERS: HomeFilter[] = [
  "Recommandés",
  "Achat immédiat",
  "Populaires",
  "Nouveautés",
];

export function applyHomeCategory(
  streams: LiveStream[],
  category: HomeCategory,
): LiveStream[] {
  const meta = HOME_CATEGORY_META[category];
  if (meta.match === "all") return streams;
  const set = new Set(meta.match);
  return streams.filter((s) => set.has(s.category));
}

export function applyHomeFilter(
  streams: LiveStream[],
  filter: HomeFilter,
): LiveStream[] {
  switch (filter) {
    case "Recommandés":
      return streams;
    case "Achat immédiat":
      return streams.filter((_, i) => i % 2 === 0);
    case "Populaires":
      return [...streams].sort((a, b) => b.viewers - a.viewers);
    case "Nouveautés":
      return [...streams].reverse();
  }
}
