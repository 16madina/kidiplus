// Delivery-based eligibility gate for bidding & buying.
//
// Currency NEVER blocks — this is the single decision helper: given a
// seller's delivery settings + country and a buyer's default-address
// country, can the buyer bid/buy in this live?
//
// A missing buyer address never blocks — the payment sheet already prompts
// for one at checkout time.

import type { SellerDeliverySettings } from "@/lib/delivery";
import { zonesForCountry } from "@/lib/delivery";

export type EligibilityInput = {
  settings: SellerDeliverySettings | null;
  sellerCountry?: string | null;
  buyerCountry?: string | null;
};

export type EligibilityResult = {
  eligible: boolean;
  reason?: "no_country_coverage" | "courier_country_mismatch";
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function canDeliver({
  settings,
  sellerCountry,
  buyerCountry,
}: EligibilityInput): EligibilityResult {
  // No settings on the seller → treat as flat/0 (delivers everywhere).
  if (!settings || settings.mode === "flat") return { eligible: true };

  const buyer = norm(buyerCountry);

  if (settings.mode === "courier") {
    // Address prompt happens at checkout when no default is set.
    if (!buyer) return { eligible: true };
    const seller = norm(sellerCountry);
    if (!seller) return { eligible: true }; // seller country unknown → don't gate
    return buyer === seller
      ? { eligible: true }
      : { eligible: false, reason: "courier_country_mismatch" };
  }

  // zones
  const zones = Array.isArray(settings.zones) ? settings.zones : [];
  if (zones.length === 0) return { eligible: true }; // seller hasn't configured yet
  if (!buyer) return { eligible: true }; // ask at checkout
  const inCountry = zonesForCountry(zones, buyer);
  return inCountry.length > 0
    ? { eligible: true }
    : { eligible: false, reason: "no_country_coverage" };
}
