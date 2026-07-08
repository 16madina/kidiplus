// Delivery resolver for the checkout call sites (fixed-price + auction winner).
//
// One place that decides whether the buyer can pay at all — and with what
// delivery fee. If it returns `ok:false`, the caller must NOT create an
// order and should surface the reason (usually: pick / add an address).

import { fetchDefaultAddress } from "@/lib/addresses-db";
import { fetchDeliverySettings } from "@/lib/delivery-db";
import { resolveDeliveryFee, snapshotAddress, type DeliveryMode } from "@/lib/delivery";
import type { AddressRow } from "@/lib/addresses-db";

export type CheckoutDelivery = {
  deliveryFee: number;
  deliveryMode: DeliveryMode;
  deliveryZone: string | null;
  addressId: string;
  addressSnapshot: Record<string, unknown>;
};

export type ResolveResult =
  | { ok: true; delivery: CheckoutDelivery }
  | { ok: false; reason: "no_address" | "needs_zone" | "no_matching_zone" | "no_country_coverage" };

/** Resolve delivery for the current buyer + seller. Uses the buyer's default
 *  address unless one is passed explicitly. */
export async function resolveDeliveryForCheckout(args: {
  sellerId: string;
  buyerId: string;
  address?: AddressRow | null;
  explicitZoneName?: string | null;
}): Promise<ResolveResult> {
  const [settings, address] = await Promise.all([
    fetchDeliverySettings(args.sellerId),
    args.address !== undefined ? Promise.resolve(args.address) : fetchDefaultAddress(args.buyerId),
  ]);

  // Seller with no explicit settings → treat as flat 0 (free).
  const effective = settings ?? {
    seller_id: args.sellerId,
    mode: "flat" as const,
    flat_fee: 0,
    zones: [],
    updated_at: new Date().toISOString(),
  };

  if (!address) return { ok: false, reason: "no_address" };

  const res = resolveDeliveryFee(effective, address, args.explicitZoneName ?? null);
  if (res.kind === "no_country") return { ok: false, reason: "no_country_coverage" };
  if (res.kind === "needs_zone") return { ok: false, reason: "needs_zone" };
  if (res.kind === "unavailable") return { ok: false, reason: "no_matching_zone" };

  const zone = res.kind === "zone" ? res.zoneName : null;
  return {
    ok: true,
    delivery: {
      deliveryFee: res.fee,
      deliveryMode: effective.mode,
      deliveryZone: zone,
      addressId: address.id,
      addressSnapshot: snapshotAddress(address),
    },
  };
}
