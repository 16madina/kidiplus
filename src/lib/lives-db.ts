// Real live-shopping data layer (Supabase).
// - CRUD for lives + live_products
// - Storage upload for cover + product images (private buckets, signed URLs on read)
// - Realtime subscription to the live feed
//
// Keep this file client-only; it uses the browser Supabase client.

import { supabase } from "@/integrations/supabase/client";
import type { LiveStream } from "@/lib/live-mock";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import {
  normalizeCondition,
  parseStringArray,
  type ProductCondition,
} from "@/lib/live-product-options";
import {
  durableStorageRef,
  parseSupabaseStorageUrl,
  stripBucketPrefix,
  type StorageBucket,
} from "@/lib/storage-path";

// -------------------------------------------------------------------------
// Storage
// -------------------------------------------------------------------------

/** In-memory cache: `${bucket}::${size}::${path}` -> signed URL + expiry. */
const signedCache = new Map<string, { url: string; expiresAt: number }>();

const SIGN_TTL_SEC = 60 * 60 * 24; // 24h

/** Display presets — avoid shipping multi‑MB originals into feed/card grids. */
export type LiveImageSize = "thumb" | "card" | "detail" | "full";

const IMAGE_TRANSFORMS: Record<
  LiveImageSize,
  { width: number; height: number; resize: "cover"; quality: number } | null
> = {
  thumb: { width: 160, height: 160, resize: "cover", quality: 70 },
  card: { width: 480, height: 720, resize: "cover", quality: 75 },
  detail: { width: 960, height: 1280, resize: "cover", quality: 80 },
  full: null,
};

/**
 * Resolve a stored image reference to a displayable URL.
 * - Absolute http(s) URLs are returned as-is (external images / Unsplash).
 * - Bucket paths ("<uid>/xxx.jpg") get a fresh signed URL, cached in-memory.
 * - Optional size uses Supabase image transforms when enabled; falls back to
 *   the full signed object if transforms are unavailable.
 */
export async function resolveLiveImage(
  bucket: StorageBucket,
  value: string | null | undefined,
  size: LiveImageSize = "card",
): Promise<string | null> {
  if (!value) return null;
  if (/^(blob:|data:)/i.test(value)) return value;

  // Durably stored paths OR expired Supabase signed URLs → re-sign.
  // External http(s) (Unsplash, etc.) stay as-is.
  let objectPath = value;
  let objectBucket: StorageBucket = bucket;
  if (/^https?:\/\//i.test(value)) {
    const parsed = parseSupabaseStorageUrl(value);
    if (!parsed) return value;
    objectBucket = parsed.bucket;
    objectPath = parsed.path;
  }
  objectPath = stripBucketPrefix(objectPath, objectBucket);

  const looksAvatar = /(?:^|\/)avatar[-_]/i.test(objectPath);
  const tryBuckets: StorageBucket[] = looksAvatar
    ? ["avatars", "live-covers"]
    : objectBucket === "live-covers"
      ? ["live-covers", "live-products", "shop-products", "avatars", "demo-covers"]
      : objectBucket === "live-products"
        ? ["live-products", "shop-products", "live-covers"]
        : [objectBucket];

  for (const b of tryBuckets) {
    const signed = await signLiveObject(b, objectPath, size);
    if (signed) return signed;
  }
  console.warn("[live-image] signed URL failed", tryBuckets.join("|"), objectPath);
  return null;
}

async function signLiveObject(
  objectBucket: StorageBucket,
  objectPath: string,
  size: LiveImageSize,
): Promise<string | null> {
  const key = `${objectBucket}::${size}::${objectPath}`;
  const cached = signedCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const transform = IMAGE_TRANSFORMS[size];
  if (transform) {
    const { data, error } = await supabase.storage
      .from(objectBucket)
      .createSignedUrl(objectPath, SIGN_TTL_SEC, { transform });
    if (!error && data?.signedUrl) {
      signedCache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGN_TTL_SEC * 1000,
      });
      return data.signedUrl;
    }
  }

  const { data, error } = await supabase.storage
    .from(objectBucket)
    .createSignedUrl(objectPath, SIGN_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  signedCache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGN_TTL_SEC * 1000,
  });
  return data.signedUrl;
}

/**
 * Resolve a product image that may live in live-products OR shop-products.
 * Shop picks now persist durable shop paths; live uploads use live-products.
 */
export async function resolveProductDisplayImage(
  value: string | null | undefined,
  size: LiveImageSize = "card",
): Promise<string | null> {
  if (!value) return null;
  if (/^(blob:|data:)/i.test(value)) return value;

  if (/^https?:\/\//i.test(value)) {
    const parsed = parseSupabaseStorageUrl(value);
    if (!parsed) return value;
    if (parsed.bucket === "shop-products") {
      const { resolveShopImage } = await import("@/lib/shop-db");
      return resolveShopImage(value, size);
    }
    if (parsed.bucket === "avatars") {
      return resolveAvatarUrl(value);
    }
    if (
      parsed.bucket === "live-products" ||
      parsed.bucket === "live-covers" ||
      parsed.bucket === "demo-covers"
    ) {
      return resolveLiveImage(parsed.bucket, value, size);
    }
    return value;
  }

  const fromLive = await resolveLiveImage("live-products", value, size);
  if (fromLive) return fromLive;
  const { resolveShopImage } = await import("@/lib/shop-db");
  return resolveShopImage(value, size);
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
  /** Live currency — inherited from the seller's profile; a DB trigger enforces it. */
  currency?: string;
  /** Whether viewers can send virtual gifts during the live. */
  allowGifts?: boolean;
  /** camera = in-app WebRTC; rtmp = Restream/OBS via LiveKit Ingress. */
  broadcastMode?: "camera" | "rtmp";
  /** Optional short description shown to viewers (scheduled lives). */
  description?: string | null;
  /** Estimated duration in minutes (scheduled lives). */
  estimatedDurationMin?: number | null;
  /** Scheduled-live options — persisted so edit round-trips them. */
  allowBids?: boolean;
  allowBuyNow?: boolean;
  notifyFollowers?: boolean;

  products: Array<{
    name: string;
    imagePath: string | null; // storage path OR absolute URL
    mode: "auction" | "fixed";
    startPrice: number;
    price: number;
    stock: number;
    timerSeconds: number;
    position: number;
    shopProductId?: string | null;
    description?: string | null;
    brand?: string | null;
    condition?: ProductCondition | null;
    colors?: string[];
    sizes?: string[];
    extraImages?: string[];
    bidIncrement?: number | null;
  }>;
};

/** Shared optional columns written on live_products insert. */
function liveProductOptionColumns(p: {
  description?: string | null;
  brand?: string | null;
  condition?: ProductCondition | null;
  colors?: string[];
  sizes?: string[];
  extraImages?: string[];
  bidIncrement?: number | null;
}) {
  return {
    description: p.description?.trim() || null,
    brand: p.brand?.trim() || null,
    condition: p.condition ?? null,
    colors: parseStringArray(p.colors ?? []),
    sizes: parseStringArray(p.sizes ?? []),
    extra_images: parseStringArray(p.extraImages ?? []),
    bid_increment:
      typeof p.bidIncrement === "number" && Number.isFinite(p.bidIncrement) && p.bidIncrement > 0
        ? p.bidIncrement
        : null,
  };
}

/** Upload extra product image slots (paths or keep remote URLs). */
export async function uploadExtraLiveProductImages(args: {
  userId: string;
  productName: string;
  extraImages?: string[];
  extraImageFiles?: (File | null | undefined)[];
}): Promise<string[]> {
  const urls = args.extraImages ?? [];
  const files = args.extraImageFiles ?? [];
  const out: string[] = [];
  const n = Math.max(urls.length, files.length);
  for (let i = 0; i < n; i++) {
    const file = files[i] ?? null;
    const url = urls[i];
    if (file) {
      out.push(await uploadLiveImage("live-products", file, args.userId));
    } else if (url && /^blob:/i.test(url)) {
      const f = await blobUrlToFile(url, `${args.productName || "product"}-extra-${i}.jpg`);
      out.push(await uploadLiveImage("live-products", f, args.userId));
    } else if (url) {
      out.push(durableStorageRef(url) ?? url);
    }
  }
  return out;
}

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
      host_last_seen_at: new Date().toISOString(),
      broadcast_mode: input.broadcastMode ?? "camera",
      ingress_id: null,
      ...(input.currency ? { currency: input.currency } : {}),
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
      ...liveProductOptionColumns(p),
      ...(p.shopProductId ? { shop_product_id: p.shopProductId } : {}),
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

export async function endLiveInDb(
  liveId: string,
): Promise<{ ok: boolean; error?: string }> {
  const endedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("lives")
    .update({
      status: "ended",
      ended_at: endedAt,
      ingress_id: null,
    } as never)
    .eq("id", liveId)
    .eq("status", "live")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) return { ok: true };

  // Already ended (or never live) — treat as success only if row is ended.
  const { data: row } = await supabase
    .from("lives")
    .select("status")
    .eq("id", liveId)
    .maybeSingle();
  if (row?.status === "ended") return { ok: true };
  return { ok: false, error: "not_updated" };
}

/**
 * Refresh host presence for an *already open* live.
 * Never resurrect a live that was properly ended (Finish).
 */
export async function markLiveActiveInDb(liveId: string): Promise<void> {
  await supabase
    .from("lives")
    .update({
      ended_at: null,
      host_last_seen_at: new Date().toISOString(),
    } as never)
    .eq("id", liveId)
    .eq("status", "live");
}

/** Host heartbeat — keeps abandoned-live expiry from ending an active session. */
export async function touchLiveHostInDb(liveId: string): Promise<void> {
  const { error } = await supabase.rpc("touch_live_host", {
    _live_id: liveId,
  } as never);
  // Fallback if migration not applied yet: update column directly.
  if (error) {
    await supabase
      .from("lives")
      .update({ host_last_seen_at: new Date().toISOString() } as never)
      .eq("id", liveId)
      .eq("status", "live");
  }
}

export async function updateLiveViewerCount(
  liveId: string,
  count: number,
): Promise<void> {
  await supabase.from("lives").update({ viewer_count: count }).eq("id", liveId);
}

export type OpenLiveRow = {
  id: string;
  title: string;
  started_at: string;
  room_name: string;
  cover_url: string | null;
  category: string | null;
  currency: string | null;
  host_last_seen_at: string | null;
  broadcast_mode?: string | null;
  ingress_id?: string | null;
  allow_gifts?: boolean | null;
};

/** All currently-open lives for this seller (for reconnect banner). */
export async function findOpenLives(sellerId: string): Promise<OpenLiveRow[]> {
  const { data } = await supabase
    .from("lives")
    .select(
      "id, title, started_at, room_name, cover_url, category, currency, host_last_seen_at, broadcast_mode, ingress_id, allow_gifts",
    )
    .eq("seller_id", sellerId)
    .eq("status", "live")
    .order("started_at", { ascending: false });
  return ((data ?? []) as OpenLiveRow[]).filter((r) => r.started_at !== null);
}

/** End seller lives with no host heartbeat for `_maxAgeMinutes` (default 5). */
export async function expireAbandonedLivesInDb(
  sellerId: string,
  maxAgeMinutes = 5,
): Promise<number> {
  const { data, error } = await supabase.rpc("expire_abandoned_lives", {
    _seller_id: sellerId,
    _max_age_minutes: maxAgeMinutes,
  } as never);
  if (!error) {
    const r = (data ?? {}) as { expired?: number };
    return Number(r.expired ?? 0);
  }

  // Client-side fallback when RPC isn't deployed yet.
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
  const open = await findOpenLives(sellerId);
  const stale = open.filter((r) => {
    const last = r.host_last_seen_at || r.started_at;
    return last < cutoff;
  });
  await Promise.all(stale.map((r) => endLiveInDb(r.id)));
  return stale.length;
}

/** Warn hosts absent ~2 min via push (with remaining minutes before 5 min close). */
export async function notifyAbsentHostLivesInDb(
  warnAfterMinutes = 2,
  maxAgeMinutes = 5,
): Promise<number> {
  const { data, error } = await supabase.rpc("notify_absent_host_lives", {
    _warn_after_minutes: warnAfterMinutes,
    _max_age_minutes: maxAgeMinutes,
  } as never);
  if (error) return 0;
  const r = (data ?? {}) as { notified?: number };
  return Number(r.notified ?? 0);
}

/** @deprecated prefer findOpenLives — kept for older call sites. */
export async function findDanglingLives(
  sellerId: string,
  olderThanSec = 60,
): Promise<Array<{ id: string; title: string; started_at: string; room_name: string }>> {
  const cutoff = new Date(Date.now() - olderThanSec * 1000).toISOString();
  const open = await findOpenLives(sellerId);
  return open
    .filter((r) => r.started_at < cutoff)
    .map((r) => ({
      id: r.id,
      title: r.title,
      started_at: r.started_at,
      room_name: r.room_name,
    }));
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
  currency: string | null;
  seller: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

/** Last-resort card art when the live has no cover and the seller has no avatar. */
const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=70";

/** Map a lives row + resolved cover URL into the shared LiveStream shape. */
async function rowToStream(row: LivesRow): Promise<LiveStream> {
  const sellerName =
    row.seller?.display_name?.trim() ||
    row.seller?.handle ||
    "Vendeur";
  // Avatars live in the `avatars` bucket (not `live-covers`). Route through
  // resolveAvatarUrl so both absolute URLs and bucket paths work, matching
  // the resolution used on the profile screen and elsewhere.
  // Empty string when missing — UI shows seller initials (never a random face).
  const avatar = (await resolveAvatarUrl(row.seller?.avatar_url ?? null)) || "";

  // Thumbnail: live cover → seller photo → neutral marketplace fallback.
  // Never use a random product (e.g. sneaker) or pravatar as a stand-in.
  const coverFromLive = await resolveLiveImage("live-covers", row.cover_url, "card");
  const thumbnail = coverFromLive || avatar || FALLBACK_COVER;

  const category = (row.category as LiveStream["category"]) ?? "Fashion";
  const cur = (row.currency ?? "EUR").toUpperCase();
  return {
    id: `db-${row.id}`,
    seller: sellerName,
    avatar,
    title: row.title,
    thumbnail,
    viewers: Math.max(1, row.viewer_count || 1),
    category,
    roomName: row.room_name,
    liveId: row.id,
    sellerId: row.seller_id,
    currency: (cur === "XOF" || cur === "CAD" || cur === "EUR" ? cur : "EUR") as
      LiveStream["currency"],
    startedAt: row.started_at ?? undefined,
  };
}

export async function fetchActiveLives(limit = 60): Promise<LiveStream[]> {
  // Opportunistic cleanup: end lives whose host vanished for 5+ minutes
  // so the feed doesn't show ghost rooms. Also warn absent hosts (~2 min).
  void (async () => {
    try {
      await supabase.rpc("notify_absent_host_lives", {
        _warn_after_minutes: 2,
        _max_age_minutes: 5,
      } as never);
    } catch {
      /* ignore */
    }
    try {
      await supabase.rpc("expire_abandoned_lives", {
        _seller_id: null,
        _max_age_minutes: 5,
      } as never);
    } catch {
      /* ignore — migration may not be applied yet */
    }
  })();

  const { data, error } = await supabase
    .from("lives")
    .select(
      `
      id, seller_id, title, category, cover_url, room_name, viewer_count, started_at, currency,
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

/** Search currently-live streams by title, category, or seller display_name/handle. */
export async function searchActiveLives(query: string, limit = 40): Promise<LiveStream[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const q = `%${trimmed}%`;
  const { data, error } = await supabase
    .from("lives")
    .select(
      `id, seller_id, title, category, cover_url, room_name, viewer_count, started_at, currency,
       seller:profiles!lives_seller_id_fkey(display_name, handle, avatar_url)`,
    )
    .eq("status", "live")
    .or(`title.ilike.${q},category.ilike.${q}`)
    .limit(limit);
  if (error || !data) return [];
  const rows = data as unknown as LivesRow[];
  // Also allow matching by seller name/handle client-side (Supabase can't OR across joined table easily).
  const filtered = rows.filter((r) => {
    const t = trimmed.toLowerCase();
    return (
      r.title?.toLowerCase().includes(t) ||
      r.category?.toLowerCase().includes(t) ||
      r.seller?.display_name?.toLowerCase().includes(t) ||
      r.seller?.handle?.toLowerCase().includes(t)
    );
  });
  // Merge: server-filtered rows already include title/category; add name-matched via another query if empty.
  let base = filtered.length ? filtered : rows;
  if (!base.length) {
    const { data: d2 } = await supabase
      .from("lives")
      .select(
        `id, seller_id, title, category, cover_url, room_name, viewer_count, started_at, currency,
         seller:profiles!lives_seller_id_fkey(display_name, handle, avatar_url)`,
      )
      .eq("status", "live")
      .limit(limit);
    base = ((d2 ?? []) as unknown as LivesRow[]).filter((r) => {
      const t = trimmed.toLowerCase();
      return (
        r.seller?.display_name?.toLowerCase().includes(t) ||
        r.seller?.handle?.toLowerCase().includes(t)
      );
    });
  }
  return Promise.all(base.map(rowToStream));
}

/** Fetch a single live stream by id (used for push deep-links). */
export async function fetchLiveById(id: string): Promise<LiveStream | null> {
  const { data, error } = await supabase
    .from("lives")
    .select(
      `
      id, seller_id, title, category, cover_url, room_name, viewer_count, started_at, currency,
      seller:profiles!lives_seller_id_fkey(display_name, handle, avatar_url)
      `,
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToStream(data as unknown as LivesRow);
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
  status: "upcoming" | "active" | "sold" | "out" | "unsold";
  sold_to_identity: string | null;
  final_price: number | null;
  position: number;
  /** Absolute epoch timestamp (ISO) of the auction deadline. Set by the
   *  start_auction RPC so late joiners can rehydrate a synchronized timer. */
  auction_deadline_at: string | null;
  /** Incremented each time start_auction runs on this product row. */
  auction_round?: number;
  description?: string | null;
  brand?: string | null;
  condition?: ProductCondition | null;
  colors?: string[] | null;
  sizes?: string[] | null;
  extra_images?: string[] | null;
  bid_increment?: number | null;
};

/** Normalize JSON array / condition fields coming from PostgREST. */
export function normalizeLiveProductRow(row: LiveProductRow): LiveProductRow {
  return {
    ...row,
    description: row.description ?? null,
    brand: row.brand ?? null,
    condition: normalizeCondition(row.condition),
    colors: parseStringArray(row.colors),
    sizes: parseStringArray(row.sizes),
    extra_images: parseStringArray(row.extra_images),
    bid_increment:
      typeof row.bid_increment === "number" && Number.isFinite(row.bid_increment)
        ? row.bid_increment
        : null,
  };
}


export async function fetchLiveProducts(liveId: string): Promise<LiveProductRow[]> {
  const { data } = await supabase
    .from("live_products")
    .select("*")
    .eq("live_id", liveId)
    .order("position", { ascending: true });
  return ((data ?? []) as LiveProductRow[]).map(normalizeLiveProductRow);
}

/** Append a product mid-live (called from the host dock).
 *  Uploads the image if a File was picked, otherwise stores the URL as-is. */
export async function createLiveProductInDb(args: {
  liveId: string;
  userId: string;
  name: string;
  imageFile: File | null;
  imageUrl: string | null;
  mode: "auction" | "fixed";
  startPrice: number;
  price: number;
  stock: number;
  timerSeconds: number;
  shopProductId?: string | null;
  description?: string | null;
  brand?: string | null;
  condition?: ProductCondition | null;
  colors?: string[];
  sizes?: string[];
  extraImages?: string[];
  extraImageFiles?: (File | null)[];
  bidIncrement?: number | null;
}): Promise<{ ok: boolean; error?: string; id?: string; imagePath?: string | null }> {
  let imagePath: string | null = null;
  let extraImages: string[] = [];
  try {
    if (args.imageFile) {
      imagePath = await uploadLiveImage("live-products", args.imageFile, args.userId);
    } else if (args.imageUrl && /^blob:/i.test(args.imageUrl)) {
      const file = await blobUrlToFile(args.imageUrl, `${args.name || "product"}.jpg`);
      imagePath = await uploadLiveImage("live-products", file, args.userId);
    } else {
      imagePath = durableStorageRef(args.imageUrl);
    }
    extraImages = await uploadExtraLiveProductImages({
      userId: args.userId,
      productName: args.name,
      extraImages: args.extraImages,
      extraImageFiles: args.extraImageFiles,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const { data: maxRow } = await supabase
    .from("live_products")
    .select("position")
    .eq("live_id", args.liveId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;
  const { data, error } = await supabase
    .from("live_products")
    .insert({
      live_id: args.liveId,
      name: args.name,
      image_url: imagePath,
      mode: args.mode,
      start_price: args.startPrice,
      price: args.price,
      stock: args.stock,
      timer_seconds: args.timerSeconds,
      status: "upcoming",
      position,
      ...liveProductOptionColumns({ ...args, extraImages }),
      ...(args.shopProductId ? { shop_product_id: args.shopProductId } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, id: data.id, imagePath };
}

/** Host starts an auction. Delegates to the `start_auction` RPC which:
 *  - flips status to "active", resets price/final_price,
 *  - persists the absolute deadline (`auction_deadline_at`) on the row,
 *  - returns the deadline as epoch ms so the host broadcast, the host's own
 *    countdown, and any late-joining viewer read the SAME absolute value. */
export async function startAuctionInDb(
  productId: string,
): Promise<{ ok: boolean; deadlineMs?: number; timerSec?: number; auctionRound?: number; error?: string }> {
  const { data, error } = await supabase.rpc("start_auction", {
    _product_id: productId,
  } as never);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as {
    ok?: boolean;
    deadline_ms?: number;
    timer_sec?: number;
    auction_round?: number;
    error?: string;
  };
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    deadlineMs: Number(r.deadline_ms),
    timerSec: Number(r.timer_sec),
    ...(r.auction_round != null ? { auctionRound: Number(r.auction_round) } : {}),
  };
}


/**
 * Host-triggered auction finalize. Marks the product sold, creates the pending
 * order for the winner, and — when possible — auto-pays it from the winner's
 * wallet (matching currency + sufficient balance). Returns the created order
 * id and whether it was auto-paid.
 */
export async function finalizeAuctionInDb(args: {
  liveId: string;
  productId: string;
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: number;
}): Promise<{
  ok: boolean;
  orderId: string | null;
  autoPaid: boolean;
  unsold?: boolean;
  winnerId?: string | null;
  winnerName?: string | null;
  finalPrice?: number | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("finalize_auction_winner", {
    _live_id: args.liveId,
    _product_id: args.productId,
    _winner_id: args.winnerId,
    _winner_name: args.winnerName,
    _final_price: args.finalPrice,
  } as never);
  if (error) return { ok: false, orderId: null, autoPaid: false, error: error.message };
  const r = (data ?? {}) as {
    ok?: boolean;
    order_id?: string | null;
    auto_paid?: boolean;
    unsold?: boolean;
    winner_id?: string | null;
    winner_name?: string | null;
    final_price?: number | null;
    error?: string;
  };
  if (!r.ok) return { ok: false, orderId: null, autoPaid: false, error: r.error };
  return {
    ok: true,
    orderId: r.order_id ?? null,
    autoPaid: !!r.auto_paid,
    unsold: !!r.unsold,
    winnerId: r.winner_id ?? null,
    winnerName: r.winner_name ?? null,
    finalPrice: r.final_price ?? null,
  };
}

/** Opportunistic cleanup — cancels overdue unpaid auction orders. */
export async function expireOverdueOrders(): Promise<number> {
  const { data } = await supabase.rpc("expire_overdue_orders", {} as never);
  const r = (data ?? {}) as { expired?: number };
  return Number(r.expired ?? 0);
}

/** Set fixed-price row to active (opens buying). Idempotent. */
export async function activateFixedInDb(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("live_products")
    .update({ status: "active" })
    .eq("id", productId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function stopFixedInDb(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("live_products")
    .update({ status: "upcoming" })
    .eq("id", productId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Relaunch an unsold auction product: sends it back to the queue as
 *  'upcoming' at the end, so the host can retry the auction later. */
export async function relaunchUnsoldProductInDb(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("relaunch_unsold_product", {
    _product_id: productId,
  } as never);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

/** Insert a bid AND bump the product price so realtime subscribers see it.
 *  Pass `amount` to place a custom bid; omit to let the server use current + step. */
export async function placeBidInDb(args: {
  liveId: string;
  productId: string;
  bidderId: string;
  bidderName: string;
  amount?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  amount?: number;
  currentPrice?: number;
  minNext?: number;
  maxAmount?: number;
  extended?: boolean;
  deadlineMs?: number;
}> {
  const { data, error } = await supabase.rpc("place_live_bid", {
    _live_id: args.liveId,
    _product_id: args.productId,
    _bidder_name: args.bidderName,
    ...(args.amount !== undefined ? { _amount: args.amount } : {}),
  } as never);
  if (error) return { ok: false, error: error.message };
  const result = data as {
    ok?: boolean; error?: string; amount?: number;
    current_price?: number; min_next?: number; max_amount?: number;
    extended?: boolean; deadline?: string | null;
  } | null;
  if (!result?.ok) return {
    ok: false,
    error: result?.error ?? "bid_failed",
    currentPrice: result?.current_price !== undefined ? Number(result.current_price) : undefined,
    minNext: result?.min_next !== undefined ? Number(result.min_next) : undefined,
    maxAmount: result?.max_amount !== undefined ? Number(result.max_amount) : undefined,
  };
  return {
    ok: true,
    amount: Number(result.amount),
    extended: !!result.extended,
    deadlineMs: result.deadline ? new Date(result.deadline).getTime() : undefined,
  };
}

/** @deprecated Prefer createLiveOrder from orders-db — kept for legacy callers. */
export async function purchaseFixedPriceRpc(
  productId: string,
  _buyerIdentity?: string,
): Promise<{ ok: boolean; error?: string; orderId?: string }> {
  const { data, error } = await (supabase as unknown as {
    rpc: (n: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("purchase_fixed_price", {
    _product_id: productId,
    _buyer_identity: _buyerIdentity ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; error?: string; order_id?: string };
  if (!r.ok) return { ok: false, error: r.error ?? "purchase_failed" };
  return { ok: true, orderId: r.order_id };
}

// -------------------------------------------------------------------------
// Feed realtime
// -------------------------------------------------------------------------

/**
 * Subscribe to `lives` table changes for the home feed.
 * Android WebViews often drop the Realtime WebSocket without auto-recovery,
 * so we re-subscribe on error and emit on SUBSCRIBED for a catch-up refetch.
 */
export function subscribeToLivesFeed(onChange: () => void): () => void {
  let dead = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1_000;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    if (dead) return;
    if (debounceTimer != null) clearTimeout(debounceTimer);
    // Host heartbeats / viewer_count updates fire often — coalesce briefly.
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!dead) onChange();
    }, 400);
  };

  const channel = supabase
    .channel(`public:lives:feed:${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lives" },
      () => emit(),
    )
    .subscribe((status) => {
      if (dead) return;
      if (status === "SUBSCRIBED") {
        retryDelay = 1_000;
        // Resync after connect / reconnect — covers missed INSERTs while WS was down.
        emit();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        if (retryTimer != null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (dead) return;
          try {
            void channel.subscribe();
          } catch {
            /* channel already gone */
          }
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    });

  return () => {
    dead = true;
    if (retryTimer != null) clearTimeout(retryTimer);
    if (debounceTimer != null) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------------------
// Scheduled lives (Whatnot-style pre-announced lives)
// -------------------------------------------------------------------------

export type ScheduledLiveRow = {
  id: string;
  seller_id: string;
  title: string;
  category: string | null;
  cover_url: string | null;
  scheduled_at: string | null;
  currency: string | null;
  status: string;
  allow_gifts?: boolean | null;
  broadcast_mode?: string | null;
  description?: string | null;
  estimated_duration_min?: number | null;
  allow_bids?: boolean | null;
  allow_buy_now?: boolean | null;
  notify_followers?: boolean | null;
  products?: LiveProductRow[];
};


export type ScheduledLiveWithSeller = ScheduledLiveRow & {
  seller: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
  product_count: number;
};

/** Create a live in the 'scheduled' state — cover + products persisted now. */
export async function createScheduledLiveInDb(
  input: CreateLiveInput & { scheduledAt: string },
): Promise<{ liveId: string; productIds: string[] }> {
  const { data: live, error } = await supabase
    .from("lives")
    .insert({
      seller_id: input.sellerId,
      title: input.title,
      category: input.category,
      cover_url: input.coverPath,
      room_name: input.roomName,
      status: "scheduled",
      scheduled_at: input.scheduledAt,
      broadcast_mode: input.broadcastMode ?? "camera",
      ingress_id: null,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(typeof input.allowGifts === "boolean" ? { allow_gifts: input.allowGifts } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.estimatedDurationMin !== undefined
        ? { estimated_duration_min: input.estimatedDurationMin }
        : {}),
      ...(typeof input.allowBids === "boolean" ? { allow_bids: input.allowBids } : {}),
      ...(typeof input.allowBuyNow === "boolean" ? { allow_buy_now: input.allowBuyNow } : {}),
      ...(typeof input.notifyFollowers === "boolean"
        ? { notify_followers: input.notifyFollowers }
        : {}),
    } as never)
    .select("id")
    .single();
  if (error || !live) throw error ?? new Error("Failed to schedule live");


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
      ...liveProductOptionColumns(p),
      ...(p.shopProductId ? { shop_product_id: p.shopProductId } : {}),
    }));
    const { data: prods, error: pErr } = await supabase
      .from("live_products")
      .insert(rows)
      .select("id, position");
    if (pErr) throw pErr;
    const byPos = new Map<number, string>();
    for (const r of prods ?? []) byPos.set(r.position, r.id);
    for (let i = 0; i < input.products.length; i++) {
      const id = byPos.get(input.products[i].position);
      if (id) productIds.push(id);
    }
  }
  return { liveId: live.id, productIds };
}

/** Update the metadata of a scheduled live and replace its product list. */
export async function updateScheduledLiveInDb(
  liveId: string,
  patch: {
    title: string;
    category: string;
    coverPath: string | null;
    scheduledAt: string;
    allowGifts?: boolean;
    broadcastMode?: "camera" | "rtmp";
    description?: string | null;
    estimatedDurationMin?: number | null;
    allowBids?: boolean;
    allowBuyNow?: boolean;
    notifyFollowers?: boolean;
    products: CreateLiveInput["products"];
  },
): Promise<void> {
  const { error } = await supabase
    .from("lives")
    .update({
      title: patch.title,
      category: patch.category,
      cover_url: patch.coverPath,
      scheduled_at: patch.scheduledAt,
      ...(typeof patch.allowGifts === "boolean" ? { allow_gifts: patch.allowGifts } : {}),
      ...(patch.broadcastMode
        ? { broadcast_mode: patch.broadcastMode, ...(patch.broadcastMode === "camera" ? { ingress_id: null } : {}) }
        : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.estimatedDurationMin !== undefined
        ? { estimated_duration_min: patch.estimatedDurationMin }
        : {}),
      ...(typeof patch.allowBids === "boolean" ? { allow_bids: patch.allowBids } : {}),
      ...(typeof patch.allowBuyNow === "boolean" ? { allow_buy_now: patch.allowBuyNow } : {}),
      ...(typeof patch.notifyFollowers === "boolean"
        ? { notify_followers: patch.notifyFollowers }
        : {}),
    } as never)
    .eq("id", liveId)
    .eq("status", "scheduled");
  if (error) throw error;

  // Insert new products first, then delete old ones — never leave an empty list
  // if the insert fails (previous delete-then-insert could wipe products).
  const { data: existing } = await supabase
    .from("live_products")
    .select("id")
    .eq("live_id", liveId);
  const oldIds = (existing ?? []).map((r) => r.id as string);

  if (patch.products.length > 0) {
    const rows = patch.products.map((p) => ({
      live_id: liveId,
      name: p.name,
      image_url: p.imagePath,
      mode: p.mode,
      start_price: p.startPrice,
      price: p.price,
      stock: p.stock,
      timer_seconds: p.timerSeconds,
      status: "upcoming" as const,
      position: p.position,
      ...liveProductOptionColumns(p),
      ...(p.shopProductId ? { shop_product_id: p.shopProductId } : {}),
    }));
    const { error: pErr } = await supabase.from("live_products").insert(rows);
    if (pErr) throw pErr;
  }

  if (oldIds.length > 0) {
    const { error: delErr } = await supabase
      .from("live_products")
      .delete()
      .in("id", oldIds);
    if (delErr) throw delErr;
  }
}

/** Cancel = delete (products cascade). */
export async function cancelScheduledLiveInDb(liveId: string): Promise<void> {
  const { error } = await supabase
    .from("lives")
    .delete()
    .eq("id", liveId)
    .eq("status", "scheduled");
  if (error) throw error;
}

/** Start window: 15 min before → 60 min after the scheduled slot. */
export const SCHEDULED_START_EARLY_MS = 15 * 60_000;
export const SCHEDULED_START_LATE_MS = 60 * 60_000;

export type ScheduledStartWindow = "upcoming" | "ready" | "expired" | "none";

export function scheduledStartWindow(
  scheduledAt: string | null | undefined,
  nowMs: number = Date.now(),
): ScheduledStartWindow {
  if (!scheduledAt) return "none";
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t)) return "none";
  if (nowMs < t - SCHEDULED_START_EARLY_MS) return "upcoming";
  if (nowMs <= t + SCHEDULED_START_LATE_MS) return "ready";
  return "expired";
}

/** Flip a scheduled live to 'live' and return the row so the caller can broadcast. */
export async function startScheduledLiveInDb(liveId: string): Promise<{
  ok: boolean;
  roomName?: string;
  productIds?: string[];
  error?: string;
}> {
  const { data: existing, error: fetchErr } = await supabase
    .from("lives")
    .select("id, room_name, scheduled_at, status")
    .eq("id", liveId)
    .eq("status", "scheduled")
    .maybeSingle();
  if (fetchErr || !existing) return { ok: false, error: fetchErr?.message ?? "not_found" };

  const window = scheduledStartWindow(existing.scheduled_at);
  if (window === "upcoming") return { ok: false, error: "too_early" };
  if (window === "expired") return { ok: false, error: "expired" };

  const { data, error } = await supabase
    .from("lives")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("status", "scheduled")
    .select("id, room_name")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "start_failed" };
  const { data: prods } = await supabase
    .from("live_products")
    .select("id")
    .eq("live_id", liveId)
    .order("position", { ascending: true });
  return {
    ok: true,
    roomName: data.room_name,
    productIds: (prods ?? []).map((p) => p.id),
  };
}

/** Seller's own scheduled lives, newest first. */
export async function fetchMyScheduledLives(sellerId: string): Promise<ScheduledLiveRow[]> {
  const { data } = await supabase
    .from("lives")
    .select("id, seller_id, title, category, cover_url, scheduled_at, currency, status")
    .eq("seller_id", sellerId)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });
  return (data ?? []) as ScheduledLiveRow[];
}

/** Fetch a single scheduled live with its products (used by edit flow). */
export async function fetchScheduledLiveWithProducts(
  liveId: string,
): Promise<(ScheduledLiveRow & { products: LiveProductRow[] }) | null> {
  const { data } = await supabase
    .from("lives")
    .select(
      "id, seller_id, title, category, cover_url, scheduled_at, currency, status, allow_gifts, broadcast_mode, description, estimated_duration_min, allow_bids, allow_buy_now, notify_followers",
    )
    .eq("id", liveId)
    .maybeSingle();
  if (!data) return null;
  const prods = await fetchLiveProducts(liveId);
  return { ...(data as unknown as ScheduledLiveRow), products: prods };
}

/** Public feed: upcoming scheduled lives visible to buyers. */
export async function fetchUpcomingScheduledLives(
  limit = 20,
): Promise<ScheduledLiveWithSeller[]> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("lives")
    .select(
      `
      id, seller_id, title, category, cover_url, scheduled_at, currency, status,
      seller:profiles!lives_seller_id_fkey(display_name, handle, avatar_url),
      live_products(count)
      `,
    )
    .eq("status", "scheduled")
    .gt("scheduled_at", cutoff)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (!data) return [];
  const rows = data as unknown as Array<
    ScheduledLiveRow & {
      seller: ScheduledLiveWithSeller["seller"];
      live_products: Array<{ count: number }>;
    }
  >;
  const resolved = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      cover_url: (await resolveLiveImage("live-covers", r.cover_url, "card")),
      product_count: r.live_products?.[0]?.count ?? 0,
    })),
  );
  return resolved;
}

/** Opportunistic cleanup: delete scheduled lives past the start grace window. */
export async function cancelStaleScheduledLives(): Promise<void> {
  const cutoff = new Date(Date.now() - SCHEDULED_START_LATE_MS).toISOString();
  await supabase
    .from("lives")
    .delete()
    .eq("status", "scheduled")
    .lt("scheduled_at", cutoff);
}


// -------------------------------------------------------------------------
// Seller-scoped feed (used by seller profile screen)
// -------------------------------------------------------------------------
export type SellerLiveEntry = {
  id: string;
  title: string;
  status: "live" | "scheduled" | "ended";
  cover_url: string | null;
  started_at: string | null;
  scheduled_at: string | null;
  ended_at: string | null;
  viewer_count: number;
  room_name: string;
  category: string | null;
  currency: string | null;
  replay_url: string | null;
  replay_status: string | null;
  replay_expires_at: string | null;
};

export async function fetchSellerLives(
  sellerId: string,
  limit = 30,
): Promise<SellerLiveEntry[]> {
  const { data } = await supabase
    .from("lives")
    .select(
      "id, title, status, cover_url, started_at, scheduled_at, ended_at, viewer_count, room_name, category, currency, replay_url, replay_status, replay_expires_at",
    )
    .eq("seller_id", sellerId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  const rows = (data as SellerLiveEntry[] | null) ?? [];
  const resolved = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      cover_url: (await resolveLiveImage("live-covers", r.cover_url, "card")),
    })),
  );
  // Sort: live first, then scheduled (upcoming), then ended.
  const rank = (s: string) => (s === "live" ? 0 : s === "scheduled" ? 1 : 2);
  resolved.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    if (a.status === "scheduled" && b.status === "scheduled") {
      return (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
    }
    return (b.started_at ?? b.scheduled_at ?? "").localeCompare(a.started_at ?? a.scheduled_at ?? "");
  });
  return resolved;
}
