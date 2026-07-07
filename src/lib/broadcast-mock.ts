// Mock helpers for the broadcaster (Go Live) experience.
// LiveKit will replace real-time streams; simulation stays for demos.

const FR_USERS = [
  "julie_p", "kevin.94", "marion", "sofiane", "lea_style", "amine_ttv",
  "clemence", "thomas.b", "elodie", "yanis75", "camille_r", "nadir",
  "aurelie", "mehdi.k", "manon", "hugo_j", "sarah.m", "farah",
  "romain", "chloe_x", "ines.mrl", "adam_lyon", "victoire", "noa93",
];

const rand = (n: number) => Math.floor(Math.random() * n);
export const pickBidder = () => FR_USERS[rand(FR_USERS.length)];
export const bidStep = () => 1 + rand(3);
import { formatMoney } from "@/lib/money";
export const formatEuro = (n: number, currency: string = "EUR", locale: string = "fr") =>
  formatMoney(n, currency, locale);

// Default cover thumbnails offered in the setup screen.
export const COVER_POOL = [
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=70",
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=70",
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=70",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=70",
  "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=600&q=70",
];

// Neutral product image placeholders when the seller doesn't pick one.
export const PRODUCT_IMG_POOL = [
  "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=70",
  "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&q=70",
  "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&q=70",
  "https://images.unsplash.com/photo-1592286927505-1def25115558?w=400&q=70",
  "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=400&q=70",
];

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
