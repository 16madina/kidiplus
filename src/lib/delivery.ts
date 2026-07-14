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

/** Legacy currency-based compact heuristic (kept for back-compat).
 *  Prefer `isCompactAddressCountry` which decides per address. */
export function isCompactAddressCurrency(currency: string | null | undefined): boolean {
  return normalizeCurrency(currency) === "XOF";
}

/** African / XOF-zone countries use the compact "commune + repère" form.
 *  Anything else uses full postal address (street + postal code + city). */
const COMPACT_COUNTRIES = new Set([
  // West/Central Africa (XOF/XAF and neighbours)
  "CI","SN","BJ","ML","BF","TG","NE","GN","GW","CV","MR","LR","SL",
  "CM","GA","CG","CD","CF","TD","GQ",
  // Rest of Africa — same style (no reliable postal codes end-to-end)
  "MA","DZ","TN","LY","EG","SD","SS","ET","ER","DJ","SO",
  "KE","UG","RW","BI","TZ","MW","ZM","ZW","MZ","MG","MU","SC","KM","AO",
  "NG","GH","ZA","BW","NA","LS","SZ","YT","RE",
]);

export function isCompactAddressCountry(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toUpperCase();
  if (!c) return false;
  return COMPACT_COUNTRIES.has(c);
}

/** Address form field spec — per selected COUNTRY (not user currency). */
export type AddressFieldKey =
  | "label"
  | "full_name"
  | "phone"
  | "country"
  | "city"
  | "zone_or_commune"
  | "street_address"
  | "postal_code"
  | "region"
  | "details";

export function addressFieldsForCountry(country: string | null | undefined): {
  required: AddressFieldKey[];
  optional: AddressFieldKey[];
} {
  if (isCompactAddressCountry(country)) {
    return {
      required: ["full_name", "phone", "country", "city", "zone_or_commune"],
      optional: ["label", "street_address", "details"],
    };
  }
  return {
    required: ["full_name", "phone", "country", "street_address", "city", "postal_code"],
    optional: ["label", "region", "details"],
  };
}

/** @deprecated — use `addressFieldsForCountry`. Kept for back-compat. */
export function addressFieldsFor(currency: string | null | undefined) {
  return addressFieldsForCountry(
    isCompactAddressCurrency(currency) ? "CI" : "FR",
  );
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
  postal_code?: string | null;
  region?: string | null;
  details?: string | null;
};

/** Normalized single-line preview used in order summaries + snapshots.
 *  Formatting adapts to the address country. */
export function formatAddressLine(a: AddressLike | null | undefined): string {
  if (!a) return "";
  const compact = isCompactAddressCountry(a.country);
  const parts = compact
    ? [a.street_address, a.zone_or_commune, a.city, a.country]
    : [a.street_address, [a.postal_code, a.city].filter(Boolean).join(" "), a.region, a.country];
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

export type DeliveryResolution =
  | { kind: "flat" | "courier"; fee: number; zoneName: null }
  | { kind: "zone"; fee: number; zoneName: string }
  | { kind: "needs_zone"; fee: 0; zoneName: null }
  | { kind: "no_country"; fee: 0; zoneName: null }
  | { kind: "unavailable"; fee: 0; zoneName: null };

const normText = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normCountry = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Zones filtered to the buyer's country. Zones with an empty/legacy country
 *  are treated as matching (backwards compatible). */
export function zonesForCountry(
  zones: DeliveryZone[],
  country: string | null | undefined,
): DeliveryZone[] {
  const c = normCountry(country);
  if (!c) return zones;
  return zones.filter((z) => {
    const zc = normCountry(z.country);
    return !zc || zc === c;
  });
}

/**
 * Given the seller's settings + the buyer's chosen address (may be null),
 * return the delivery fee to charge — or the reason a zone must be picked.
 *
 * - "flat"    → flat_fee.
 * - "courier" → 0 in-app; buyer pays the courier cash on delivery.
 * - "zones"   → filter zones to the buyer country first, then match by name.
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

  const inCountry = zonesForCountry(zones, address?.country);
  if (inCountry.length === 0) return { kind: "no_country", fee: 0, zoneName: null };

  const wanted = normText(explicitZoneName ?? address?.zone_or_commune ?? "");
  if (!wanted) return { kind: "needs_zone", fee: 0, zoneName: null };

  const matches = inCountry.filter((z) => normText(z.name) === wanted);
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
