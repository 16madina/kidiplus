// Seller delivery settings — CRUD (client-side, RLS-guarded).
//
// Sellers manage their own row. Any authenticated user can SELECT so the
// buyer can compute the delivery fee at checkout.

import { supabase } from "@/integrations/supabase/client";
import type { SellerDeliverySettings, DeliveryMode, DeliveryZone } from "@/lib/delivery";
import { DEFAULT_DELIVERY_SETTINGS } from "@/lib/delivery";

type AnySb = { from: (t: string) => any; channel: (n: string) => any; removeChannel: (c: any) => void };
const sb = supabase as unknown as AnySb;

function normalizeZones(z: unknown): DeliveryZone[] {
  if (!Array.isArray(z)) return [];
  return z
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      country: String((x as { country?: unknown }).country ?? "").trim().toUpperCase(),
      name: String((x as { name?: unknown }).name ?? "").trim(),
      fee: Number((x as { fee?: unknown }).fee ?? 0),
    }))
    .filter((x) => x.name.length > 0 && Number.isFinite(x.fee) && x.fee >= 0);
}

function coerce(row: any, sellerId: string): SellerDeliverySettings {
  return {
    seller_id: (row?.seller_id as string) ?? sellerId,
    mode: ((row?.mode as DeliveryMode) ?? DEFAULT_DELIVERY_SETTINGS.mode),
    flat_fee: Number(row?.flat_fee ?? 0),
    zones: normalizeZones(row?.zones),
    updated_at: (row?.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function fetchDeliverySettings(sellerId: string): Promise<SellerDeliverySettings | null> {
  const { data, error } = await sb
    .from("seller_delivery_settings")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return coerce(data, sellerId);
}

/** Guaranteed-non-null read: returns defaults if there's no row yet. */
export async function fetchDeliverySettingsOrDefault(sellerId: string): Promise<SellerDeliverySettings> {
  const s = await fetchDeliverySettings(sellerId);
  if (s) return s;
  return {
    seller_id: sellerId,
    ...DEFAULT_DELIVERY_SETTINGS,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertDeliverySettings(
  sellerId: string,
  patch: { mode: DeliveryMode; flat_fee?: number; zones?: DeliveryZone[] },
): Promise<{ ok: true; settings: SellerDeliverySettings } | { ok: false; error: string }> {
  const row = {
    seller_id: sellerId,
    mode: patch.mode,
    flat_fee: Number(patch.flat_fee ?? 0),
    zones: normalizeZones(patch.zones ?? []),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("seller_delivery_settings")
    .upsert(row, { onConflict: "seller_id" })
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, settings: coerce(data ?? row, sellerId) };
}
