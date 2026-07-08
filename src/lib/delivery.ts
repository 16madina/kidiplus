// Delivery — types + currency-aware helpers.
//
// This module is imported by both seller settings, buyer checkout, and
// order snapshotting. It has NO Supabase calls (see delivery-db.ts).

import { normalizeCurrency, type Currency } from "@/lib/money";

export type DeliveryMode = "zones" | "flat" | "courier";

export type DeliveryZone = {
  country: string; // ISO-2 upper (e.g. "CI", "FR"). Empty allowed for legacy rows.
  name: string;
  fee: number;
};

export type SellerDeliverySettings = {
  seller_id: string;
  mode: DeliveryMode;
  flat_fee: number;
  zones: DeliveryZone[];
  updated_at: string;
};

export const DEFAULT_DELIVERY_SETTINGS: Omit<SellerDeliverySettings, "seller_id" | "updated_at"> = {
  mode: "flat",
  flat_fee: 0,
  zones: [],
};

/** True when the market uses a "quartier + repère" style address
 *  (XOF countries in this app: CI, SN, BJ, ML, BF, TG, NE, GN…).
 *  We key it on currency to match the seller's economic context, since the
 *  seller sets fees in their currency. Buyers of a XOF live get the compact
 *  form; buyers of an EUR/CAD live get the full postal form. */
export function isCompactAddressCurrency(currency: string | null | undefined): boolean {
  return normalizeCurrency(currency) === "XOF";
}

/** Address form field spec — per market. */
export type AddressFieldKey =
  | "label"
  | "full_name"
  | "phone"
  | "country"
  | "city"
  | "zone_or_commune"
  | "street_address"
  | "details";

export function addressFieldsFor(currency: string | null | undefined): {
  required: AddressFieldKey[];
  optional: AddressFieldKey[];
} {
  if (isCompactAddressCurrency(currency)) {
    return {
      required: ["full_name", "phone", "city", "zone_or_commune"],
      optional: ["label", "country", "details"],
    };
  }
  return {
    required: ["full_name", "phone", "country", "city", "street_address"],
    optional: ["label", "zone_or_commune", "details"],
  };
}

export type AddressLike = {
  id?: string;
  label?: string | null;
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  zone_or_commune?: string | null;
  street_address?: string | null;
  details?: string | null;
};

/** Normalized single-line preview used in order summaries + snapshots. */
export function formatAddressLine(a: AddressLike | null | undefined): string {
  if (!a) return "";
  const parts = [
    a.street_address,
    a.zone_or_commune,
    a.city,
    a.country,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.join(", ");
}

export type DeliveryResolution =
  | { kind: "flat" | "courier"; fee: number; zoneName: null }
  | { kind: "zone"; fee: number; zoneName: string }
  | { kind: "needs_zone"; fee: 0; zoneName: null }
  | { kind: "unavailable"; fee: 0; zoneName: null };

/**
 * Given the seller's settings + the buyer's chosen address (may be null),
 * return the delivery fee to charge — or the reason a zone must be picked.
 *
 * - "flat"    → flat_fee.
 * - "courier" → 0 in-app; buyer pays the courier cash on delivery.
 * - "zones"   → try to match address.zone_or_commune to a zone name
 *               (case + accent-insensitive). If ambiguous or missing → needs_zone.
 */
export function resolveDeliveryFee(
  settings: SellerDeliverySettings | null,
  address: AddressLike | null,
  explicitZoneName?: string | null,
): DeliveryResolution {
  if (!settings) return { kind: "flat", fee: 0, zoneName: null };
  if (settings.mode === "flat") return { kind: "flat", fee: Number(settings.flat_fee) || 0, zoneName: null };
  if (settings.mode === "courier") return { kind: "courier", fee: 0, zoneName: null };

  // zones
  const zones = Array.isArray(settings.zones) ? settings.zones : [];
  if (zones.length === 0) return { kind: "needs_zone", fee: 0, zoneName: null };

  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const wanted = norm(explicitZoneName ?? address?.zone_or_commune ?? "");
  if (!wanted) return { kind: "needs_zone", fee: 0, zoneName: null };

  const matches = zones.filter((z) => norm(z.name) === wanted);
  if (matches.length === 1) {
    return { kind: "zone", fee: Number(matches[0].fee) || 0, zoneName: matches[0].name };
  }
  return { kind: "needs_zone", fee: 0, zoneName: null };
}

/** Snapshot the address at purchase time — orders keep this even if the
 *  buyer later edits/deletes the address entry. */
export function snapshotAddress(a: AddressLike & { id?: string }): Record<string, unknown> {
  return {
    id: a.id ?? null,
    label: a.label ?? null,
    full_name: a.full_name ?? null,
    phone: a.phone ?? null,
    country: a.country ?? null,
    city: a.city ?? null,
    zone_or_commune: a.zone_or_commune ?? null,
    street_address: a.street_address ?? null,
    details: a.details ?? null,
    line: formatAddressLine(a),
  };
}

export type { Currency };
