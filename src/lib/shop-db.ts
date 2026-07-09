// Persistent seller shop catalog. Photos live in the private "shop-products" bucket.
// A shop product now supports up to 5 photos. `image_url` remains the cover
// (mirrors `images[0]`) for backward compatibility with existing consumers.
import { supabase } from "@/integrations/supabase/client";

export type ShopProduct = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  images: string[]; // storage paths in the "shop-products" bucket (cover is index 0)
  price: number;
  currency: string;
  stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const signedCache = new Map<string, { url: string; expiresAt: number }>();
const localPreviewCache = new Map<string, string>(); // storage path -> blob: URL
const SIGN_TTL_SEC = 60 * 60 * 22; // refresh before 24h expiry

export const MAX_SHOP_IMAGES = 5;
export const MIN_SHOP_IMAGES = 3;

export function seedShopImagePreview(path: string, blobUrl: string) {
  const prev = localPreviewCache.get(path);
  if (prev && prev !== blobUrl) {
    try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
  }
  localPreviewCache.set(path, blobUrl);
}

export async function resolveShopImage(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  const local = localPreviewCache.get(value);
  if (local) return local;
  const key = `shop-products::${value}`;
  const cached = signedCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const { data, error } = await supabase.storage
    .from("shop-products")
    .createSignedUrl(value, SIGN_TTL_SEC);
  if (error || !data?.signedUrl) {
    // eslint-disable-next-line no-console
    console.warn("[shop-db] signed url failed", value, error?.message);
    return null;
  }
  signedCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGN_TTL_SEC * 1000 });
  return data.signedUrl;
}

export async function resolveShopImages(paths: readonly (string | null | undefined)[]): Promise<string[]> {
  const out = await Promise.all(paths.map((p) => resolveShopImage(p)));
  return out.filter((v): v is string => !!v);
}

export async function uploadShopProductImage(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${rand}.${ext}`;
  const { error } = await supabase.storage.from("shop-products").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  try { seedShopImagePreview(path, URL.createObjectURL(file)); } catch { /* ignore */ }
  return path;
}

function normalizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function rowToProduct(row: Record<string, unknown>): ShopProduct {
  const images = normalizeImages(row.images);
  const image_url = (row.image_url as string | null) ?? images[0] ?? null;
  return {
    id: row.id as string,
    seller_id: row.seller_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    image_url,
    images: images.length > 0 ? images : (image_url ? [image_url] : []),
    price: Number(row.price),
    currency: row.currency as string,
    stock: Number(row.stock),
    active: row.active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listMyShopProducts(userId: string): Promise<ShopProduct[]> {
  const { data } = await supabase
    .from("shop_products")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => rowToProduct(r as Record<string, unknown>));
}

export async function listSellerActiveShopProducts(sellerId: string): Promise<ShopProduct[]> {
  const { data } = await supabase
    .from("shop_products")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => rowToProduct(r as Record<string, unknown>));
}

export type ShopProductWithSeller = ShopProduct & {
  seller_display_name: string;
  seller_handle: string;
  seller_avatar_url: string | null;
};

/** Real full-text-ish search over active shop products (by name), joined with seller profile. */
export async function searchActiveShopProducts(
  query: string,
  limit = 40,
): Promise<ShopProductWithSeller[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const q = `%${trimmed}%`;
  const { data, error } = await supabase
    .from("shop_products")
    .select(
      `*, seller:profiles!shop_products_seller_id_fkey(display_name, handle, avatar_url)`,
    )
    .eq("active", true)
    .ilike("name", q)
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => {
    const row = r as Record<string, unknown>;
    const p = rowToProduct(row);
    const s = (row.seller ?? {}) as { display_name?: string; handle?: string; avatar_url?: string | null };
    return {
      ...p,
      seller_display_name: s.display_name ?? "Vendeur",
      seller_handle: s.handle ?? "",
      seller_avatar_url: s.avatar_url ?? null,
    };
  });
}

export type ShopProductInput = {
  name: string;
  description?: string | null;
  imagePaths?: string[];
  price: number;
  currency: string;
  stock: number;
};

export async function createShopProduct(
  sellerId: string,
  input: ShopProductInput,
): Promise<ShopProduct> {
  const images = (input.imagePaths ?? []).slice(0, MAX_SHOP_IMAGES);
  const cover = images[0] ?? null;
  const { data, error } = await supabase
    .from("shop_products")
    .insert({
      seller_id: sellerId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      image_url: cover,
      images: images as unknown as never,
      price: input.price,
      currency: input.currency,
      stock: input.stock,
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return rowToProduct(data as Record<string, unknown>);
}

type ShopUpdate = {
  name?: string;
  description?: string | null;
  imagePaths?: string[];
  price?: number;
  stock?: number;
  active?: boolean;
};

export async function updateShopProduct(id: string, patch: ShopUpdate): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.price !== undefined) dbPatch.price = patch.price;
  if (patch.stock !== undefined) dbPatch.stock = patch.stock;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  if (patch.imagePaths !== undefined) {
    const images = patch.imagePaths.slice(0, MAX_SHOP_IMAGES);
    dbPatch.images = images;
    dbPatch.image_url = images[0] ?? null;
  }
  await supabase.from("shop_products").update(dbPatch as never).eq("id", id);
}

export async function archiveShopProduct(id: string): Promise<void> {
  await updateShopProduct(id, { active: false });
}

export async function reactivateShopProduct(id: string): Promise<void> {
  await updateShopProduct(id, { active: true });
}
