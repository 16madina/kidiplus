// Delivery-based eligibility gate for bidding & buying.
//
// Currency NEVER blocks — this is the single decision helper: given a
// seller's delivery settings + country and a buyer's default-address
// country, can the buyer bid/buy in this live?
//
// A missing buyer address ALWAYS blocks. Otherwise one viewer with no
// address can bid while another is stopped at checkout ("add an address"),
// and country coverage cannot be evaluated fairly.

import type { SellerDeliverySettings } from "@/lib/delivery";
import { zonesForCountry } from "@/lib/delivery";
import { normalizeCountryCode } from "@/lib/delivery-zones-data";

export type EligibilityInput = {
  settings: SellerDeliverySettings | null;
  sellerCountry?: string | null;
  buyerCountry?: string | null;
};

export type EligibilityResult = {
  eligible: boolean;
  reason?: "no_address" | "no_country_coverage" | "courier_country_mismatch";
};

const norm = (s: string | null | undefined) => normalizeCountryCode(s) ?? (s ?? "").trim().toUpperCase();

export function canDeliver({
  settings,
  sellerCountry,
  buyerCountry,
}: EligibilityInput): EligibilityResult {
  const buyer = norm(buyerCountry);
  // Same rule for everyone — never let "no address" skip the gate while
  // an addressed buyer in another country is blocked.
  if (!buyer) return { eligible: false, reason: "no_address" };

  // No settings on the seller → treat as flat/0 (delivers everywhere).
  if (!settings || settings.mode === "flat") return { eligible: true };

  if (settings.mode === "courier") {
    const seller = norm(sellerCountry);
    if (!seller) return { eligible: true }; // seller country unknown → don't gate
    return buyer === seller
      ? { eligible: true }
      : { eligible: false, reason: "courier_country_mismatch" };
  }

  // zones
  const zones = Array.isArray(settings.zones) ? settings.zones : [];
  if (zones.length === 0) return { eligible: true }; // seller hasn't configured yet
  const inCountry = zonesForCountry(zones, buyer);
  return inCountry.length > 0
    ? { eligible: true }
    : { eligible: false, reason: "no_country_coverage" };
}
