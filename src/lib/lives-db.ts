// Real live-shopping data layer (Supabase).
// - CRUD for lives + live_products
// - Storage upload for cover + product images (private buckets, signed URLs on read)
// - Realtime subscription to the live feed
//
// Keep this file client-only; it uses the browser Supabase client.

import { supabase } from "@/integrations/supabase/client";
import type { LiveStream } from "@/lib/live-mock";

// -------------------------------------------------------------------------
// Storage
// -------------------------------------------------------------------------

/** In-memory cache: `${bucket}::${path}` -> signed URL + expiry. */
const signedCache = new Map<string, { url: string; expiresAt: number }>();

const SIGN_TTL_SEC = 60 * 60 * 24; // 24h

/**
 * Resolve a stored image reference to a displayable URL.
 * - Absolute http(s) URLs are returned as-is (external images / Unsplash).
 * - Bucket paths ("<uid>/xxx.jpg") get a fresh signed URL, cached in-memory.
 */
export async function resolveLiveImage(
  bucket: "live-covers" | "live-products",
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const key = `${bucket}::${value}`;
  const cached = signedCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(value, SIGN_TTL_SEC);
  if (error || !data) return null;
  signedCache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGN_TTL_SEC * 1000,
  });
  return data.signedUrl;
}

/**
 * Upload a File to a private bucket under the user's own folder.
 * Returns the storage object path (never a URL) — DB stores paths.
 */
export async function uploadLiveImage(
  bucket: "live-covers" | "live-products",
  file: File,
  userId: string,
): Promise<string> {
  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${rand}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

/** Convert a blob: URL back into a File so we can upload it. */
export async function blobUrlToFile(
  blobUrl: string,
  filename = "image.jpg",
): Promise<File> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

// -------------------------------------------------------------------------
// Create / update lives
// -------------------------------------------------------------------------

export type CreateLiveInput = {
  sellerId: string;
  title: string;
  category: string;
  coverPath: string | null; // storage path OR absolute URL
  roomName: string;
  products: Array<{
    name: string;
    imagePath: string | null; // storage path OR absolute URL
    mode: "auction" | "fixed";
    startPrice: number;
    price: number;
    stock: number;
    timerSeconds: number;
    position: number;
  }>;
};

export type CreatedLive = {
  liveId: string;
  productMap: Record<string, string>; // local-id -> db-id (by position index string)
};

/** Insert the live row + all products in one flow. Throws on RLS/insert failure. */
export async function createLiveInDb(
  input: CreateLiveInput,
): Promise<{ liveId: string; productIds: string[] }> {
  const { data: live, error } = await supabase
    .from("lives")
    .insert({
      seller_id: input.sellerId,
      title: input.title,
      category: input.category,
      cover_url: input.coverPath,
      room_name: input.roomName,
      status: "live",
    })
    .select("id")
    .single();
  if (error || !live) throw error ?? new Error("Failed to create live");

  const productIds: string[] = [];
  if (input.products.length > 0) {
    const rows = input.products.map((p) => ({
      live_id: live.id,
      name: p.name,
      image_url: p.imagePath,
      mode: p.mode,
      start_price: p.startPrice,
      price: p.price,
      stock: p.stock,
      timer_seconds: p.timerSeconds,
      status: "upcoming" as const,
      position: p.position,
    }));
    const { data: prods, error: pErr } = await supabase
      .from("live_products")
      .insert(rows)
      .select("id, position");
    if (pErr) throw pErr;
    // Preserve caller order via position.
    const byPos = new Map<number, string>();
    for (const r of prods ?? []) byPos.set(r.position, r.id);
    for (let i = 0; i < input.products.length; i++) {
      const id = byPos.get(input.products[i].position);
      if (id) productIds.push(id);
    }
  }
  return { liveId: live.id, productIds };
}

export async function endLiveInDb(liveId: string): Promise<void> {
  await supabase
    .from("lives")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", liveId);
}

export async function updateLiveViewerCount(
  liveId: string,
  count: number,
): Promise<void> {
  await supabase.from("lives").update({ viewer_count: count }).eq("id", liveId);
}

/** Any 'live' rows for this seller older than N seconds — used to recover crashed sessions. */
export async function findDanglingLives(
  sellerId: string,
  olderThanSec = 60,
): Promise<Array<{ id: string; title: string; started_at: string; room_name: string }>> {
  const cutoff = new Date(Date.now() - olderThanSec * 1000).toISOString();
  const { data } = await supabase
    .from("lives")
    .select("id, title, started_at, room_name")
    .eq("seller_id", sellerId)
    .eq("status", "live")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: false });
  return data ?? [];
}

// -------------------------------------------------------------------------
// Feed reads
// -------------------------------------------------------------------------

type LivesRow = {
  id: string;
  seller_id: string;
  title: string;
  category: string | null;
  cover_url: string | null;
  room_name: string;
  viewer_count: number;
  started_at: string;
  seller: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70";

/** Map a lives row + resolved cover URL into the shared LiveStream shape. */
async function rowToStream(row: LivesRow): Promise<LiveStream> {
  const cover =
    (await resolveLiveImage("live-covers", row.cover_url)) ?? FALLBACK_COVER;
  const sellerName =
    row.seller?.display_name?.trim() ||
    row.seller?.handle ||
    "Vendeur";
  const avatar =
    (row.seller?.avatar_url &&
      (await resolveLiveImage("live-covers", row.seller.avatar_url))) ||
    `https://i.pravatar.cc/80?u=${encodeURIComponent(row.seller_id)}`;
  const category = (row.category as LiveStream["category"]) ?? "Fashion";
  return {
    id: `db-${row.id}`,
    seller: sellerName,
    avatar,
    title: row.title,
    thumbnail: cover,
    viewers: Math.max(1, row.viewer_count || 1),
    category,
    roomName: row.room_name,
    liveId: row.id,
  };
}

export async function fetchActiveLives(limit = 60): Promise<LiveStream[]> {
  const { data, error } = await supabase
    .from("lives")
    .select(
      `
      id, seller_id, title, category, cover_url, room_name, viewer_count, started_at,
      seller:profiles!lives_seller_id_fkey(display_name, handle, avatar_url)
      `,
    )
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const streams = await Promise.all(
    (data as unknown as LivesRow[]).map(rowToStream),
  );
  return streams;
}

/**
 * Realtime subscription to the lives feed.
 * Fires `onChange` after any INSERT/UPDATE/DELETE — caller refetches.
 */
// -------------------------------------------------------------------------
// Products / bids / auctions
// -------------------------------------------------------------------------

export type LiveProductRow = {
  id: string;
  live_id: string;
  name: string;
  image_url: string | null;
  mode: "auction" | "fixed";
  start_price: number;
  price: number;
  stock: number;
  timer_seconds: number;
  status: "upcoming" | "active" | "sold" | "out";
  sold_to_identity: string | null;
  final_price: number | null;
  position: number;
};

export async function fetchLiveProducts(liveId: string): Promise<LiveProductRow[]> {
  const { data } = await supabase
    .from("live_products")
    .select("*")
    .eq("live_id", liveId)
    .order("position", { ascending: true });
  return (data ?? []) as LiveProductRow[];
}

/** Host starts an auction: mark row active + set fresh price=start_price. */
export async function startAuctionInDb(productId: string): Promise<void> {
  const { data: row } = await supabase
    .from("live_products")
    .select("start_price")
    .eq("id", productId)
    .maybeSingle();
  if (!row) return;
  await supabase
    .from("live_products")
    .update({ status: "active", price: row.start_price, final_price: null, sold_to_identity: null })
    .eq("id", productId);
}

export async function endAuctionInDb(
  productId: string,
  winnerIdentity: string | null,
  finalPrice: number,
): Promise<void> {
  await supabase
    .from("live_products")
    .update({
      status: "sold",
      sold_to_identity: winnerIdentity,
      final_price: finalPrice,
    })
    .eq("id", productId);
}

/** Set fixed-price row to active (opens buying). Idempotent. */
export async function activateFixedInDb(productId: string): Promise<void> {
  await supabase.from("live_products").update({ status: "active" }).eq("id", productId);
}

export async function stopFixedInDb(productId: string): Promise<void> {
  await supabase.from("live_products").update({ status: "upcoming" }).eq("id", productId);
}

/** Insert a bid AND bump the product price so realtime subscribers see it. */
export async function placeBidInDb(args: {
  liveId: string;
  productId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { error: bidErr } = await supabase.from("live_bids").insert({
    live_id: args.liveId,
    product_id: args.productId,
    bidder_id: args.bidderId,
    bidder_name: args.bidderName,
    amount: args.amount,
  });
  if (bidErr) return { ok: false, error: bidErr.message };
  // Race-tolerant: only bump price if new amount is higher.
  const { data: cur } = await supabase
    .from("live_products")
    .select("price")
    .eq("id", args.productId)
    .maybeSingle();
  if (cur && args.amount > cur.price) {
    await supabase
      .from("live_products")
      .update({ price: args.amount })
      .eq("id", args.productId);
  }
  return { ok: true };
}

export async function purchaseFixedPriceRpc(
  productId: string,
  buyerIdentity: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("purchase_fixed_price", {
    _product_id: productId,
    _buyer_identity: buyerIdentity,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// -------------------------------------------------------------------------
// Feed realtime
// -------------------------------------------------------------------------

export function subscribeToLivesFeed(onChange: () => void): () => void {
  const channel = supabase
    .channel("public:lives:feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lives" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
