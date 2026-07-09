// Persistent seller shop catalog. Photos live in the private "shop-products" bucket.
import { supabase } from "@/integrations/supabase/client";

export type ShopProduct = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  currency: string;
  stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const signedCache = new Map<string, { url: string; expiresAt: number }>();
const localPreviewCache = new Map<string, string>(); // path -> blob: URL (session-only)
const SIGN_TTL_SEC = 60 * 60 * 22; // 22h — refresh before 24h expiry

// Seed a local blob preview so the UI can show it instantly right after upload.
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
  // Seed a local blob preview so subsequent listings show the image instantly.
  try { seedShopImagePreview(path, URL.createObjectURL(file)); } catch { /* ignore */ }
  return path;
}

export async function listMyShopProducts(userId: string): Promise<ShopProduct[]> {
  const { data } = await supabase
    .from("shop_products")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  return (data as ShopProduct[] | null) ?? [];
}

export async function listSellerActiveShopProducts(sellerId: string): Promise<ShopProduct[]> {
  const { data } = await supabase
    .from("shop_products")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data as ShopProduct[] | null) ?? [];
}

export type ShopProductInput = {
  name: string;
  description?: string | null;
  imagePath?: string | null;
  price: number;
  currency: string;
  stock: number;
};

export async function createShopProduct(
  sellerId: string,
  input: ShopProductInput,
): Promise<ShopProduct> {
  const { data, error } = await supabase
    .from("shop_products")
    .insert({
      seller_id: sellerId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      image_url: input.imagePath ?? null,
      price: input.price,
      currency: input.currency,
      stock: input.stock,
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data as ShopProduct;
}

export async function updateShopProduct(
  id: string,
  patch: Partial<Pick<ShopProduct, "name" | "description" | "image_url" | "price" | "stock" | "active">>,
): Promise<void> {
  await supabase.from("shop_products").update(patch).eq("id", id);
}

export async function archiveShopProduct(id: string): Promise<void> {
  await updateShopProduct(id, { active: false });
}

export async function reactivateShopProduct(id: string): Promise<void> {
  await updateShopProduct(id, { active: true });
}
