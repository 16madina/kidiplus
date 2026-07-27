// Seller delivery settings — CRUD (client-side, RLS-guarded).
//
// Sellers manage their own row. Buyers read via get_seller_delivery_settings RPC.

import { supabase } from "@/integrations/supabase/client";
import type { SellerDeliverySettings, DeliveryMode, DeliveryZone } from "@/lib/delivery";
import { DEFAULT_DELIVERY_SETTINGS } from "@/lib/delivery";
import { normalizeCountryCode } from "@/lib/delivery-zones-data";

type AnySb = { from: (t: string) => any; channel: (n: string) => any; removeChannel: (c: any) => void };
const sb = supabase as unknown as AnySb;

function normalizeZones(z: unknown): DeliveryZone[] {
  if (!Array.isArray(z)) return [];
  return z
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const raw = String((x as { country?: unknown }).country ?? "").trim();
      const iso = normalizeCountryCode(raw) ?? raw.toUpperCase();
      return {
        country: iso,
        name: String((x as { name?: unknown }).name ?? "").trim(),
        fee: Number((x as { fee?: unknown }).fee ?? 0),
      };
    })
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
  // Direct table read is restricted to the owner/admin; use the RPC so buyers
  // can still fetch a seller's delivery config for checkout.
  const { data, error } = await (sb as any).rpc("get_seller_delivery_settings", {
    _seller_id: sellerId,
  });
  if (error) {
    console.warn("[delivery] get_seller_delivery_settings failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return coerce(row, sellerId);
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

async function upsertViaTable(
  sellerId: string,
  row: {
    seller_id: string;
    mode: DeliveryMode;
    flat_fee: number;
    zones: DeliveryZone[];
    updated_at: string;
  },
): Promise<{ ok: true; settings: SellerDeliverySettings } | { ok: false; error: string }> {
  // Prefer update-then-insert over upsert+.select — fewer RLS edge cases.
  const { data: updated, error: upErr } = await sb
    .from("seller_delivery_settings")
    .update({
      mode: row.mode,
      flat_fee: row.flat_fee,
      zones: row.zones,
      updated_at: row.updated_at,
    })
    .eq("seller_id", sellerId)
    .select("*")
    .maybeSingle();

  if (upErr) return { ok: false, error: upErr.message };
  if (updated) return { ok: true, settings: coerce(updated, sellerId) };

  const { data: inserted, error: inErr } = await sb
    .from("seller_delivery_settings")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (inErr) {
    // Concurrent first-save → retry update.
    if (inErr.code === "23505") {
      const { data: again, error: againErr } = await sb
        .from("seller_delivery_settings")
        .update({
          mode: row.mode,
          flat_fee: row.flat_fee,
          zones: row.zones,
          updated_at: row.updated_at,
        })
        .eq("seller_id", sellerId)
        .select("*")
        .maybeSingle();
      if (againErr) return { ok: false, error: againErr.message };
      if (again) return { ok: true, settings: coerce(again, sellerId) };
    }
    return { ok: false, error: inErr.message };
  }
  if (!inserted) return { ok: false, error: "Save returned no row" };
  return { ok: true, settings: coerce(inserted, sellerId) };
}

export async function upsertDeliverySettings(
  sellerId: string,
  patch: { mode: DeliveryMode; flat_fee?: number; zones?: DeliveryZone[] },
): Promise<{ ok: true; settings: SellerDeliverySettings } | { ok: false; error: string }> {
  const zones = normalizeZones(patch.zones ?? []);
  const flat_fee = Number(patch.flat_fee ?? 0);
  const mode = patch.mode;
  const updated_at = new Date().toISOString();

  // Prefer SECURITY DEFINER RPC (reliable under RLS) when migration is applied.
  const { data: rpcData, error: rpcErr } = await (sb as any).rpc("upsert_seller_delivery_settings", {
    _mode: mode,
    _flat_fee: flat_fee,
    _zones: zones,
  });

  if (!rpcErr && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row) {
      const saved = coerce(row, sellerId);
      // Confirm buyers can read what we just wrote.
      const verified = await fetchDeliverySettings(sellerId);
      if (verified) return { ok: true, settings: verified };
      return { ok: true, settings: saved };
    }
  }

  // Fallback if RPC missing (migration not applied yet) or RPC failed oddly.
  if (rpcErr && !/could not find|does not exist|PGRST202/i.test(rpcErr.message ?? "")) {
    // Real RPC error (auth, check constraint, …) — still try table path once.
    console.warn("[delivery] upsert RPC failed, trying table write", rpcErr.message);
  }

  const tableResult = await upsertViaTable(sellerId, {
    seller_id: sellerId,
    mode,
    flat_fee,
    zones,
    updated_at,
  });
  if (!tableResult.ok) {
    return {
      ok: false,
      error: tableResult.error || rpcErr?.message || "Save failed",
    };
  }

  const verified = await fetchDeliverySettings(sellerId);
  if (!verified) {
    return {
      ok: false,
      error: "Saved but could not re-read settings. Pull to refresh and try again.",
    };
  }
  // Ensure zones/mode actually stuck (guards against silent no-op writes).
  if (verified.mode !== mode) {
    return { ok: false, error: "Save did not persist. Please try again." };
  }
  if (mode === "zones" && verified.zones.length === 0 && zones.length > 0) {
    return { ok: false, error: "Zones were not saved. Please try again." };
  }
  return { ok: true, settings: verified };
}
