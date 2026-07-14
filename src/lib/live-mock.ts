export type Category =
  | "For You"
  | "Beauty"
  | "Sneakers"
  | "Fashion"
  | "Cards"
  | "Electronics"
  | "Jewelry"
  | "Bags"
  | "Perfumes"
  | "Watches"
  | "Games"
  | "Home"
  | "Bundles";

export const CATEGORIES: Category[] = [
  "For You",
  "Beauty",
  "Sneakers",
  "Fashion",
  "Cards",
  "Electronics",
  "Jewelry",
  "Bags",
  "Perfumes",
];

export type LiveStream = {
  id: string;
  seller: string;
  avatar: string;
  title: string;
  thumbnail: string;
  viewers: number;
  category: Exclude<Category, "For You">;
  /** LiveKit room name — when present, viewer subscribes to real video. */
  roomName?: string;
  /** DB id (public.lives.id) when this stream is real. */
  liveId?: string;
  /** Seller user id (profiles.id) — or `fictitious:…` for review/demo streams. */
  sellerId?: string;
  /** Live currency (defaults to EUR when unspecified). */
  currency?: "XOF" | "EUR" | "CAD";
  /** Client-only review/demo stream (no LiveKit / no DB row). */
  fictitious?: boolean;
  /** When true, the card renders as a scheduled (upcoming) live, not LIVE. */
  scheduled?: boolean;
  /** Minutes until the scheduled live starts (only when scheduled). */
  startsInMin?: number;
  /** Minutes remaining on a live in progress (optional realism timer). */
  endsInMin?: number;
};

export function isFictitiousSellerId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("fictitious:");
}

export function fictitiousSellerId(seller: string): string {
  const slug = seller
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `fictitious:${slug || "seller"}`;
}

// Unsplash source images per category (stable IDs, hot-linkable).
const IMG = {
  Beauty: [
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=70",
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=70",
    "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=70",
    "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=600&q=70",
    "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&q=70",
  ],
  Sneakers: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70",
    "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&q=70",
    "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=70",
    "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&q=70",
    "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&q=70",
  ],
  Fashion: [
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=70",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=70",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=70",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=70",
    "https://images.unsplash.com/photo-1485518882345-15568b007407?w=600&q=70",
  ],
  Cards: [
    "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=600&q=70",
    "https://images.unsplash.com/photo-1628960198207-3d1fed6f28d3?w=600&q=70",
    "https://images.unsplash.com/photo-1637419450536-378d5457abb8?w=600&q=70",
    "https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=600&q=70",
    "https://images.unsplash.com/photo-1606166187734-a4cb74079037?w=600&q=70",
    "https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=600&q=70",
  ],
  Electronics: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=70",
    "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=600&q=70",
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=70",
    "https://images.unsplash.com/photo-1512446816042-444d641267d4?w=600&q=70",
  ],
  Jewelry: [
    "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=70",
    "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=70",
    "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=70",
    "https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&q=70",
  ],
  Bags: [
    "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=70",
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&q=70",
    "https://images.unsplash.com/photo-1590874103328-eac38a67437a?w=600&q=70",
    "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=600&q=70",
  ],
  Perfumes: [
    "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=70",
    "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&q=70",
    "https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600&q=70",
    "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600&q=70",
  ],
  Watches: [
    "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=70",
  ],
  Games: [
    "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=600&q=70",
  ],
  Home: [
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=70",
  ],
  Bundles: [
    "https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=600&q=70",
  ],
} as const;

const AVATAR = (seed: string) =>
  `https://i.pravatar.cc/80?u=${encodeURIComponent(seed)}`;

type Seed = {
  seller: string;
  title: string;
  category: LiveStream["category"];
};

const SEEDS: Seed[] = [
  { seller: "Aïcha Beauty", title: "Nouveautés maquillage — prix cassés ce soir 💄", category: "Beauty" },
  { seller: "Kevin Sneaks", title: "Drop Jordan 4 + Yeezy taille 42-45", category: "Sneakers" },
  { seller: "Marie Vintage", title: "Friperie de luxe : Chanel, Dior, YSL", category: "Fashion" },
  { seller: "Studio Dee", title: "Pokémon vintage : booster japonais 1999", category: "Cards" },
  { seller: "Fatou Bijoux", title: "Or 18 carats — enchères à partir de 10€", category: "Jewelry" },
  { seller: "Tech Amir", title: "iPhone reconditionnés + AirPods garantis", category: "Electronics" },
  { seller: "Léa Glow", title: "Routine peau grasse — tout à -50%", category: "Beauty" },
  { seller: "Sneak Léo", title: "Nike Dunk Low : je vide le stock", category: "Sneakers" },
  { seller: "Chloé Chic", title: "Robes d'été — pièces uniques", category: "Fashion" },
  { seller: "Yassine Cards", title: "One Piece TCG — cartes rares OP07", category: "Cards" },
  { seller: "Nina Diamants", title: "Bagues solitaires — direct atelier", category: "Jewelry" },
  { seller: "Momo Gadgets", title: "Manettes PS5 & accessoires gaming", category: "Electronics" },
  { seller: "Sarah Skin", title: "Soins coréens : masques & sérums", category: "Beauty" },
  { seller: "Drip Malik", title: "New Balance 550 & 990 en direct", category: "Sneakers" },
  { seller: "Camille Paris", title: "Streetwear premium — Stüssy, Palace", category: "Fashion" },
  { seller: "Baptiste TCG", title: "Magic The Gathering — sealed boxes", category: "Cards" },
  { seller: "Inès Or", title: "Chaînes cubaines argent 925 massif", category: "Jewelry" },
  { seller: "Karim Console", title: "Rétro gaming : Game Boy & cartouches", category: "Electronics" },
  { seller: "Élodie Rouge", title: "Rouges à lèvres MAC & Charlotte Tilbury", category: "Beauty" },
  { seller: "Théo Kicks", title: "ASICS Gel Kayano — toutes tailles", category: "Sneakers" },
  { seller: "Sofia Mode", title: "Looks seconde main authentifiés", category: "Fashion" },
  { seller: "Lucas Poké", title: "Cartes Pokémon FR — session enchères", category: "Cards" },
  { seller: "Amélie Perles", title: "Colliers perles Tahiti — direct grossiste", category: "Jewelry" },
  { seller: "Rayan Audio", title: "Casques Bose & Sony — neufs scellés", category: "Electronics" },
  { seller: "Lina Bags", title: "Sacs Louis Vuitton & Hermès authentifiés", category: "Bags" },
  { seller: "Nora Accessoires", title: "Ceintures & pochettes cuir — live shopping", category: "Bags" },
  { seller: "Maya Sac", title: "Sacs à main tendance — lots du jour", category: "Bags" },
  { seller: "Parfum Zoé", title: "Niche & designer — décants et flacons", category: "Perfumes" },
  { seller: "Oud Maison", title: "Parfums orientaux — découvertes du soir", category: "Perfumes" },
  { seller: "Scent Lab", title: "Sélection été : frais & boisés", category: "Perfumes" },
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

// Deterministic, natural-looking viewer counts. We hand-pick a pool of
// realistic values (no perfectly-rounded "2k" figures) and index into it so
// the same seed always renders the same count between refreshes.
const VIEWER_POOL = [
  59, 81, 127, 174, 213, 246, 289, 312, 347, 388, 421, 476, 512, 573, 618,
  684, 731, 802, 869, 927, 1043, 1128, 1246, 1387, 1512, 1689, 1874, 2138,
  2413, 2687, 2873, 3124,
] as const;

function viewers(i: number): number {
  const noise = (i * 9301 + 49297) % 233280;
  return VIEWER_POOL[noise % VIEWER_POOL.length];
}

// Every Nth seed becomes a scheduled (upcoming) live so the feed shows a
// realistic mix of live-now + programmed sessions.
const SCHEDULE_MINUTES = [12, 27, 45, 63, 90, 120, 180, 240] as const;
const END_MINUTES = [8, 14, 22, 31, 47, 58] as const;

/** Seeded demo/sample lives for App Review and empty inventory. */
export function makeStreams(offset = 0, count = SEEDS.length): LiveStream[] {
  return Array.from({ length: count }, (_, k) => {
    const i = (offset + k) % SEEDS.length;
    const s = SEEDS[i];
    const gallery = IMG[s.category] ?? IMG.Fashion;
    const abs = offset + k;
    // ~28% of cards are scheduled — enough to feel active without dominating.
    const scheduled = abs % 7 === 2 || abs % 7 === 5;
    const startsInMin = scheduled
      ? SCHEDULE_MINUTES[abs % SCHEDULE_MINUTES.length]
      : undefined;
    // ~40% of live cards show a countdown; others stay open-ended.
    const endsInMin = !scheduled && abs % 5 !== 0
      ? END_MINUTES[abs % END_MINUTES.length]
      : undefined;
    return {
      id: `fictitious-stream-${abs}`,
      seller: s.seller,
      sellerId: fictitiousSellerId(s.seller),
      avatar: AVATAR(s.seller),
      title: s.title,
      thumbnail: pick(gallery, abs),
      viewers: viewers(abs + 1),
      category: s.category,
      fictitious: true,
      scheduled,
      startsInMin,
      endsInMin,
    };
  });
}

export function formatViewers(n: number): string {
  // Exact counts with a thin non-breaking space thousands separator so the
  // numbers read as real activity (347, 1 246, 2 873) rather than generated
  // "2k" placeholders.
  return n.toLocaleString("fr-FR").replace(/\u202F/g, "\u00A0");
}
