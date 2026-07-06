import { makeStreams } from "./live-mock";

export type NotifKind = "live" | "shipped" | "outbid" | "sold" | "follow" | "reminder";

export type Notification = {
  id: string;
  kind: NotifKind;
  avatar: string;
  title: string;
  body?: string;
  minutesAgo: number;
  unread: boolean;
};

const STREAMS = makeStreams(0, 24);

function relative(mins: number): string {
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export function formatRelative(mins: number): string {
  return relative(mins);
}

export function initialNotifications(): Notification[] {
  const s = STREAMS;
  return [
    { id: "n1", kind: "live", avatar: s[0].avatar, title: `${s[0].seller} a lancé un live`, body: s[0].title, minutesAgo: 2, unread: true },
    { id: "n2", kind: "outbid", avatar: `https://i.pravatar.cc/80?u=kevin.94`, title: "kevin.94 t'a surenchéri sur Nike Dunk Low", body: "Nouvelle enchère : 92 €", minutesAgo: 8, unread: true },
    { id: "n3", kind: "shipped", avatar: s[3].avatar, title: "Ta commande a été expédiée", body: `Suivi Colissimo · ${s[3].seller}`, minutesAgo: 42, unread: true },
    { id: "n4", kind: "reminder", avatar: s[4].avatar, title: `Rappel : ${s[4].seller} est en direct dans 15 min`, minutesAgo: 55, unread: false },
    { id: "n5", kind: "follow", avatar: `https://i.pravatar.cc/80?u=sofiane`, title: "sofiane a commencé à te suivre", minutesAgo: 120, unread: false },
    { id: "n6", kind: "sold", avatar: s[1].avatar, title: "Vendu ! Yeezy Boost 350 V2", body: "Enchère remportée à 148 €", minutesAgo: 180, unread: false },
    { id: "n7", kind: "live", avatar: s[7].avatar, title: `${s[7].seller} a lancé un live`, body: s[7].title, minutesAgo: 320, unread: false },
    { id: "n8", kind: "shipped", avatar: s[2].avatar, title: "Colis livré", body: `${s[2].seller} · dépôt en boîte`, minutesAgo: 1440, unread: false },
    { id: "n9", kind: "follow", avatar: `https://i.pravatar.cc/80?u=marion`, title: "marion et 3 autres te suivent", minutesAgo: 2880, unread: false },
  ];
}

export type OrderStatus = "paid" | "shipped" | "delivered";

export type Order = {
  id: string;
  code: string;
  product: string;
  image: string;
  seller: string;
  price: number;
  date: Date;
  status: OrderStatus;
  address: {
    name: string;
    line1: string;
    zip: string;
    city: string;
    country: string;
  };
};

const NOW = Date.now();
const D = 24 * 60 * 60 * 1000;

export function initialOrders(): Order[] {
  return [
    {
      id: "o1",
      code: "SHL-4821",
      product: "Jordan 4 Retro",
      image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70",
      seller: "Kevin Sneaks",
      price: 220,
      date: new Date(NOW - 6 * 60 * 60 * 1000),
      status: "paid",
      address: { name: "Madina D.", line1: "12 rue de la Roquette", zip: "75011", city: "Paris", country: "France" },
    },
    {
      id: "o2",
      code: "SHL-4796",
      product: "Sac Louis Vuitton vintage",
      image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&q=70",
      seller: "Marie Vintage",
      price: 480,
      date: new Date(NOW - 2 * D),
      status: "shipped",
      address: { name: "Madina D.", line1: "12 rue de la Roquette", zip: "75011", city: "Paris", country: "France" },
    },
    {
      id: "o3",
      code: "SHL-4712",
      product: "Chaîne argent 925",
      image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400&q=70",
      seller: "Fatou Bijoux",
      price: 68,
      date: new Date(NOW - 6 * D),
      status: "delivered",
      address: { name: "Madina D.", line1: "12 rue de la Roquette", zip: "75011", city: "Paris", country: "France" },
    },
    {
      id: "o4",
      code: "SHL-4680",
      product: "AirPods Pro 2",
      image: "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=400&q=70",
      seller: "Tech Amir",
      price: 189,
      date: new Date(NOW - 12 * D),
      status: "delivered",
      address: { name: "Madina D.", line1: "12 rue de la Roquette", zip: "75011", city: "Paris", country: "France" },
    },
  ];
}

export function orderStatusMeta(s: OrderStatus): { label: string; color: string; bg: string } {
  if (s === "paid") return { label: "Payé", color: "oklch(0.98 0 0)", bg: "oklch(0.55 0.18 250)" };
  if (s === "shipped") return { label: "Expédié", color: "oklch(0.98 0 0)", bg: "oklch(0.7 0.17 55)" };
  return { label: "Livré", color: "oklch(0.98 0 0)", bg: "oklch(0.6 0.17 155)" };
}

export function orderDateShort(d: Date): string {
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
