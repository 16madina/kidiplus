import { makeStreams, type LiveStream } from "./live-mock";

export type SellerProduct = {
  id: string;
  name: string;
  price: number;
  image: string;
};

export type ScheduledLive = {
  id: string;
  title: string;
  date: Date;
  cover: string;
  past?: boolean;
};

export type Review = {
  id: string;
  user: string;
  avatar: string;
  stars: number;
  daysAgo: number;
  text: string;
};

export type SellerInfo = {
  name: string;
  avatar: string;
  verified: boolean;
  followers: number;
  sales: number;
  rating: number;
  reviewCount: number;
  bio: string;
  liveStream?: LiveStream;
  products: SellerProduct[];
  scheduled: ScheduledLive[];
  reviews: Review[];
  ratingBreakdown: [number, number, number, number, number]; // 5..1
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const BIOS: Record<string, string> = {
  Beauty: "Sélection beauté & skincare — envois soignés depuis Paris 💄",
  Sneakers: "Sneakers authentiques uniquement. Lives tous les soirs 🔥",
  Fashion: "Pièces uniques chinées avec amour. Livraison 48h partout en France.",
  Cards: "Collectionneur depuis 15 ans — cartes gradées & sealed only.",
  Electronics: "Tech reconditionnée testée à 100%. Garantie 6 mois.",
  Jewelry: "Bijoux argent 925 & or 18k — direct atelier ✨",
};

const PRODUCT_IMG_BY_CAT: Record<string, string[]> = {
  Beauty: [
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=70",
    "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=70",
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&q=70",
    "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=400&q=70",
    "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&q=70",
    "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&q=70",
  ],
  Sneakers: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70",
    "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=70",
    "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&q=70",
    "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&q=70",
    "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&q=70",
    "https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=400&q=70",
  ],
  Fashion: [
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&q=70",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=70",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=70",
    "https://images.unsplash.com/photo-1485518882345-15568b007407?w=400&q=70",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=70",
    "https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=400&q=70",
  ],
  Cards: [
    "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=400&q=70",
    "https://images.unsplash.com/photo-1628960198207-3d1fed6f28d3?w=400&q=70",
    "https://images.unsplash.com/photo-1637419450536-378d5457abb8?w=400&q=70",
    "https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=400&q=70",
  ],
  Electronics: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=70",
    "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=400&q=70",
    "https://images.unsplash.com/photo-1512446816042-444d641267d4?w=400&q=70",
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&q=70",
  ],
  Jewelry: [
    "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400&q=70",
    "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=400&q=70",
    "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&q=70",
    "https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=400&q=70",
  ],
};

const PRODUCT_NAMES_BY_CAT: Record<string, string[]> = {
  Beauty: ["Palette teint mat", "Sérum vitamine C", "Rouge à lèvres velours", "Masque hydratant", "Fond de teint fluide", "Mascara volumateur"],
  Sneakers: ["Air Max 90 OG", "Jordan 1 High", "Dunk Low Panda", "Yeezy 350 V2", "NB 550 White Green", "ASICS Gel Lyte III"],
  Fashion: ["Robe midi soie", "Blouson cuir vintage", "Sac cabas cuir", "Jean droit taille haute", "Trench beige", "Chemise en lin"],
  Cards: ["Booster Pokémon 1999", "OP07 Booster Box", "MTG Modern Horizons 3", "Carte Charizard PSA 9"],
  Electronics: ["iPhone 13 128Go", "AirPods Pro 2", "Manette PS5 blanche", "MacBook Air M1"],
  Jewelry: ["Chaîne cubaine 60cm", "Bague solitaire or 18k", "Bracelet perles Tahiti", "Boucles créoles argent"],
};

const REVIEW_TEXTS = [
  "Envoi ultra rapide et produit conforme, je recommande à 100% !",
  "Vendeur au top, très pro pendant le live. Merci beaucoup 🙌",
  "Colis reçu en 48h, super bien emballé. Que du bonheur !",
  "Petit souci d'emballage mais la vendeuse a été très réactive.",
  "Exactement comme sur la photo, je repasserai commande sans hésiter.",
  "Live génial, ambiance sympa et bonnes affaires. À refaire !",
  "Rien à redire, produit nickel et communication au top.",
  "Un peu déçu par la taille, mais qualité correcte pour le prix.",
  "Achat parfait, merci pour la petite attention dans le colis 💌",
  "Vendeuse adorable, produits authentiques comme promis.",
];

const REVIEW_USERS = [
  "julie_p", "kevin.94", "marion", "sofiane", "lea_style", "amine_ttv",
  "clemence", "thomas.b", "elodie", "yanis75", "camille_r", "nadir",
  "aurelie", "mehdi.k", "manon", "hugo_j", "sarah.m", "farah",
];

const SCHEDULED_TITLES = [
  "Nouvelle collection — soirée exclusive",
  "Déstockage massif — tout doit partir",
  "Session enchères VIP",
  "Nouveautés de la semaine",
  "Best of + surprises abonnés",
  "Live spécial abonnés 10k 🎉",
];

const ALL_STREAMS = makeStreams(0, 24);

export function getSellerInfo(sellerName: string): SellerInfo {
  const liveStream = ALL_STREAMS.find((s) => s.seller === sellerName);
  const anySeed = liveStream ?? ALL_STREAMS[hash(sellerName) % ALL_STREAMS.length];
  const cat = (liveStream?.category ?? anySeed.category) as string;
  const h = hash(sellerName);

  const followers = 800 + (h % 45000);
  const sales = 120 + (h % 4200);
  const rating = Math.round((4.2 + ((h % 80) / 100)) * 10) / 10; // 4.2 - 4.9
  const reviewCount = 40 + (h % 480);
  const verified = (h % 3) !== 0;

  const imgs = PRODUCT_IMG_BY_CAT[cat] ?? PRODUCT_IMG_BY_CAT.Fashion;
  const names = PRODUCT_NAMES_BY_CAT[cat] ?? PRODUCT_NAMES_BY_CAT.Fashion;
  const products: SellerProduct[] = Array.from({ length: 8 }, (_, i) => ({
    id: `${sellerName}-p-${i}`,
    name: names[i % names.length],
    image: imgs[i % imgs.length],
    price: 20 + ((h + i * 37) % 380),
  }));

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const scheduled: ScheduledLive[] = Array.from({ length: 6 }, (_, i) => {
    const past = i >= 3;
    const offset = past ? -((i - 2) * 3 * day) : (i + 1) * 2 * day;
    return {
      id: `${sellerName}-sch-${i}`,
      title: SCHEDULED_TITLES[i % SCHEDULED_TITLES.length],
      date: new Date(now + offset),
      cover: imgs[i % imgs.length],
      past,
    };
  });

  const reviews: Review[] = Array.from({ length: 12 }, (_, i) => {
    const uh = (h + i * 91) % 100;
    const stars = uh > 85 ? 3 : uh > 70 ? 4 : 5;
    return {
      id: `${sellerName}-r-${i}`,
      user: REVIEW_USERS[(h + i) % REVIEW_USERS.length],
      avatar: `https://i.pravatar.cc/80?u=${encodeURIComponent(REVIEW_USERS[(h + i) % REVIEW_USERS.length])}`,
      stars,
      daysAgo: 1 + ((h + i * 7) % 90),
      text: REVIEW_TEXTS[(h + i) % REVIEW_TEXTS.length],
    };
  });

  // Rating breakdown percentages (5..1)
  const ratingBreakdown: [number, number, number, number, number] = [
    62 + (h % 20),
    18 + (h % 10),
    8 + (h % 6),
    3 + (h % 4),
    1 + (h % 3),
  ];
  const total = ratingBreakdown.reduce((a, b) => a + b, 0);
  const norm = ratingBreakdown.map((v) => Math.round((v / total) * 100)) as [number, number, number, number, number];

  return {
    name: sellerName,
    avatar: anySeed.avatar,
    verified,
    followers,
    sales,
    rating,
    reviewCount,
    bio: BIOS[cat] ?? "Vendeuse passionnée sur Shoplive.",
    liveStream,
    products,
    scheduled,
    reviews,
    ratingBreakdown: norm,
  };
}

export function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "")}k`;
  return String(n);
}

export function formatDate(d: Date): string {
  const days = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}
