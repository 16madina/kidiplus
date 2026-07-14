// SellerOrderDetailSheet — one-tap shipping details for the seller.
//
// Shows recipient, phone (tappable), full delivery address (formatted per
// country), delivery zone & fee, and a copy-to-clipboard button so the
// seller can paste the address into a courier app.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Copy,
  Phone,
  MessageCircle,
  MapPin,
  PackageCheck,
  UserRound,
} from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { CountryFlag } from "@/components/country-flag";
import { haptic } from "@/lib/haptics";
import { formatMoney } from "@/lib/money";
import type { OrderRow } from "@/lib/orders-db";
import { formatAddressLine, isCompactAddressCountry } from "@/lib/delivery";
import { countryName } from "@/lib/delivery-zones-data";

type AddressSnap = {
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  zone_or_commune?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  region?: string | null;
  details?: string | null;
  line?: string | null;
};

function asSnapshot(v: unknown): AddressSnap | null {
  if (!v || typeof v !== "object") return null;
  return v as AddressSnap;
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/[^0-9+]/g, "");
}

async function copy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
    haptic.success();
    toast.success(msg);
  } catch {
    toast.error("Copy failed");
  }
}

export function SellerOrderDetailSheet({
  order,
  onClose,
  onShip,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onShip?: (orderId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const snap = useMemo(() => asSnapshot(order?.address_snapshot), [order]);
  if (!order) return null;
  const compact = isCompactAddressCountry(snap?.country);
  const isPaid = order.status === "paid";
  const canShip = isPaid && order.fulfillment_status === "awaiting";
  const phoneDigits = digitsOnly(snap?.phone);
  const fullLine =
    snap?.line ||
    formatAddressLine({
      country: snap?.country ?? null,
      city: snap?.city ?? null,
      zone_or_commune: snap?.zone_or_commune ?? null,
      street_address: snap?.street_address ?? null,
      postal_code: snap?.postal_code ?? null,
      region: snap?.region ?? null,
    });

  const clipboardBlock = [
    snap?.full_name,
    snap?.phone,
    fullLine,
    snap?.details ? `↳ ${snap.details}` : null,
  ]
    .filter((s) => !!s && String(s).trim().length > 0)
    .join("\n");

  return (
    <BottomSheet open={!!order} onClose={onClose} heightPercent={80}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-2">
        <h2 className="text-[17px] font-bold">
          {t("sellerOrder.title", { defaultValue: "Détails de la commande" })}
        </h2>

        {/* Item summary */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border p-3">
          {order.item_image ? (
            <img src={order.item_image} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{order.item_name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatMoney(Number(order.amount), order.currency, i18n.language)}
              {" · "}
              {order.kind === "auction"
                ? t("pay.kind.auction")
                : t("pay.kind.fixed")}
            </p>
          </div>
        </div>

        {/* Shipping block */}
        {!isPaid ? (
          <p className="mt-4 rounded-xl bg-muted p-3 text-[12px] text-muted-foreground">
            {t("sellerOrder.awaitingPayment", {
              defaultValue: "Adresse visible dès que la commande est payée.",
            })}
          </p>
        ) : !snap ? (
          <p className="mt-4 rounded-xl bg-muted p-3 text-[12px] text-muted-foreground">
            {t("sellerOrder.noAddress", {
              defaultValue:
                "Cette commande n'a pas encore d'adresse enregistrée. Contacte l'acheteur.",
            })}
          </p>
        ) : (
          <section className="mt-4 rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin size={12} />
              {t("sellerOrder.shipTo", { defaultValue: "Livrer à" })}
            </div>

            {/* Recipient */}
            <div className="flex items-start gap-2">
              <UserRound size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{snap.full_name || "—"}</p>
              </div>
            </div>

            {/* Phone actions */}
            {snap.phone && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${phoneDigits}`}
                  className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[13px] font-semibold"
                >
                  <Phone size={13} /> {snap.phone}
                </a>
                <a
                  href={`https://wa.me/${phoneDigits.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] font-semibold text-white"
                  style={{ backgroundColor: "oklch(0.6 0.16 155)", borderColor: "transparent" }}
                >
                  <MessageCircle size={13} /> WhatsApp
                </a>
                <Press
                  onClick={() => copy(snap.phone!, t("sellerOrder.phoneCopied", { defaultValue: "Téléphone copié" }))}
                  className="!min-h-8 rounded-xl border border-border px-2.5 py-1.5 text-[12px] font-semibold"
                  aria-label={t("sellerOrder.copyPhone", { defaultValue: "Copier le téléphone" })}
                >
                  <Copy size={12} />
                </Press>
              </div>
            )}

            {/* Address block, per country style */}
            <div className="mt-3 space-y-0.5 text-[13px] leading-snug">
              {compact ? (
                <>
                  {snap.zone_or_commune && (
                    <p>
                      <span className="font-semibold">
                        {t("address.fields.zoneOrCommune")}:
                      </span>{" "}
                      {snap.zone_or_commune}
                    </p>
                  )}
                  {snap.city && (
                    <p>
                      <span className="font-semibold">{t("address.fields.city")}:</span> {snap.city}
                    </p>
                  )}
                  {snap.street_address && (
                    <p>
                      <span className="font-semibold">
                        {t("address.fields.streetAddress")}:
                      </span>{" "}
                      {snap.street_address}
                    </p>
                  )}
                  {snap.details && (
                    <p className="text-muted-foreground">↳ {snap.details}</p>
                  )}
                </>
              ) : (
                <>
                  {snap.street_address && <p>{snap.street_address}</p>}
                  <p>
                    {[snap.postal_code, snap.city].filter(Boolean).join(" ")}
                    {snap.region ? ` — ${snap.region}` : ""}
                  </p>
                  {snap.details && (
                    <p className="text-muted-foreground">↳ {snap.details}</p>
                  )}
                </>
              )}
              {snap.country && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <CountryFlag code={snap.country} className="h-3 w-4 rounded-sm" />
                  {countryName(snap.country, i18n.language)}
                </p>
              )}
            </div>

            {/* Delivery zone/fee */}
            {(order.delivery_fee > 0 || order.delivery_zone || order.delivery_mode) && (
              <p className="mt-2 rounded-xl bg-muted px-2.5 py-1.5 text-[12px]">
                {order.delivery_mode === "courier"
                  ? t("delivery.courierNote")
                  : (
                    <>
                      <span className="font-semibold">{t("delivery.fee")}:</span>{" "}
                      {formatMoney(Number(order.delivery_fee || 0), order.currency, i18n.language)}
                      {order.delivery_zone ? ` · ${order.delivery_zone}` : ""}
                    </>
                  )}
              </p>
            )}

            <Press
              onClick={() => copy(clipboardBlock, t("sellerOrder.copied", { defaultValue: "Adresse copiée" }))}
              className="!min-h-10 mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[13px] font-semibold"
            >
              <Copy size={13} /> {t("sellerOrder.copyAddress", { defaultValue: "Copier l'adresse" })}
            </Press>
          </section>
        )}

        {canShip && (
          <Press
            onClick={() => {
              onShip?.(order.id);
              onClose();
            }}
            className="!min-h-12 mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[15px] font-bold text-white"
            style={{ backgroundColor: "oklch(0.55 0.16 260)" }}
          >
            <PackageCheck size={16} /> {t("orders.shipCta")}
          </Press>
        )}
      </div>
    </BottomSheet>
  );
}
