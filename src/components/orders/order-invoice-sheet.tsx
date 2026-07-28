// OrderInvoiceSheet — a beautiful shareable receipt for an order.
//
// Rendered as a paper-like ticket: brand header, invoice number, PAID stamp,
// buyer/seller identities, delivery address, notched divider and totals.
// Always light ("paper") even in dark mode, like a real receipt.
// Share → PNG (WhatsApp) · PDF download · copy text.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Share2, Copy, BadgeCheck, Clock3, FileDown, Loader2 } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { CountryFlag } from "@/components/country-flag";
import { OrderItemImage } from "@/components/orders/order-item-image";
import { haptic } from "@/lib/haptics";
import { formatMoney } from "@/lib/money";
import { countryName } from "@/lib/delivery-zones-data";
import { fetchProfilesByIds, type OrderRow } from "@/lib/orders-db";
import { downloadTicketPdf, shareTicketImage } from "@/lib/invoice-export";

type Party = { display_name: string; handle: string };

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
};

function asSnapshot(v: unknown): AddressSnap | null {
  if (!v || typeof v !== "object") return null;
  return v as AddressSnap;
}

function invoiceNumber(order: OrderRow): string {
  const d = new Date(order.created_at);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `KD-${ymd}-${order.id.slice(0, 6).toUpperCase()}`;
}

function longDate(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(lang, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderInvoiceSheet({
  order,
  open,
  onClose,
  zIndex = 96,
}: {
  order: OrderRow | null;
  open: boolean;
  onClose: () => void;
  /** Above the seller detail sheet (90). */
  zIndex?: number;
}) {
  const { t, i18n } = useTranslation();
  const [parties, setParties] = useState<Record<string, Party>>({});
  const [busy, setBusy] = useState<"image" | "pdf" | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !order) return;
    let alive = true;
    void fetchProfilesByIds([order.buyer_id, order.seller_id]).then((m) => {
      if (alive) setParties(m);
    });
    return () => {
      alive = false;
    };
  }, [open, order]);

  const snap = useMemo(() => asSnapshot(order?.address_snapshot), [order]);
  if (!order) return null;

  const lang = i18n.language;
  const fmt = (n: number) => formatMoney(n, order.currency, lang);
  const seller = parties[order.seller_id];
  const buyer = parties[order.buyer_id];
  const buyerName = snap?.full_name || buyer?.display_name || "—";
  const isPaid = order.status === "paid";
  const number = invoiceNumber(order);
  const createdAt = longDate(order.created_at, lang);
  const paidAt = longDate(order.paid_at, lang);
  const isCourier = order.delivery_mode === "courier";

  const addressLines = snap
    ? [
        snap.street_address,
        snap.zone_or_commune,
        [snap.postal_code, snap.city].filter(Boolean).join(" "),
        snap.region,
      ].filter((p): p is string => !!p && String(p).trim().length > 0)
    : [];

  const payMethodLabel =
    order.payment_method === "wallet"
      ? t("invoice.payWallet", { defaultValue: "Wallet KiDi+" })
      : order.payment_method === "paypal"
        ? t("invoice.payPaypal", { defaultValue: "PayPal" })
        : t("invoice.payCard", { defaultValue: "Carte bancaire" });

  const shareText = [
    `KiDi+ — ${t("invoice.title", { defaultValue: "Facture" })} ${number}`,
    order.item_name,
    `${t("pay.item")}: ${fmt(Number(order.amount))}`,
    isCourier
      ? `${t("delivery.fee")}: ${t("delivery.courierShort", { defaultValue: "au livreur" })}`
      : Number(order.delivery_fee) > 0
        ? `${t("delivery.fee")}${order.delivery_zone ? ` (${order.delivery_zone})` : ""}: ${fmt(Number(order.delivery_fee))}`
        : null,
    `${t("pay.total")}: ${fmt(Number(order.total))}`,
    isPaid && paidAt ? `${t("invoice.paidOn", { defaultValue: "Payée le" })} ${paidAt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const shareImage = async () => {
    if (!ticketRef.current || busy) return;
    haptic.selection();
    setBusy("image");
    try {
      const result = await shareTicketImage({
        node: ticketRef.current,
        filename: `${number}.png`,
        title: `KiDi+ ${number}`,
        text: shareText,
      });
      if (result === "cancelled") {
        /* user closed the share sheet */
      }
    } catch {
      toast.error(t("invoice.exportFailed", { defaultValue: "Export impossible" }));
    }
    setBusy(null);
  };

  const savePdf = async () => {
    if (!ticketRef.current || busy) return;
    haptic.selection();
    setBusy("pdf");
    try {
      const result = await downloadTicketPdf({
        node: ticketRef.current,
        filename: `${number}.pdf`,
        title: `KiDi+ ${number}`,
      });
      if (result === "saved") {
        toast.success(t("invoice.pdfSaved", { defaultValue: "PDF enregistré" }));
      }
    } catch {
      toast.error(t("invoice.exportFailed", { defaultValue: "Export impossible" }));
    }
    setBusy(null);
  };

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("invoice.title", { defaultValue: "Facture" })}
      zIndex={zIndex}
    >
      <div className="px-4 pb-6 pt-3">
        {/* Capture root — cream padding so notches look intentional in the PNG/PDF */}
        <div
          ref={ticketRef}
          className="rounded-3xl p-3"
          style={{ backgroundColor: "#F5F2EA" }}
        >
          {/* Paper ticket */}
          <div
            className="relative overflow-hidden rounded-3xl"
            style={{
              backgroundColor: "#FDFCF9",
              color: "#10162B",
              boxShadow: "0 12px 40px rgba(16,22,43,0.18)",
            }}
          >
            {/* Brand header */}
            <div
              className="relative px-5 pb-5 pt-6"
              style={{
                background: "linear-gradient(135deg, #10162B 0%, #1B2440 55%, #2A3558 100%)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-white/95 px-3 py-2">
                  <Logo size={26} />
                </div>
                <div
                  className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[11px] font-black uppercase tracking-widest"
                  style={{
                    transform: "rotate(3deg)",
                    borderColor: isPaid ? "#34d399" : "#fbbf24",
                    color: isPaid ? "#34d399" : "#fbbf24",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  {isPaid ? <BadgeCheck size={13} /> : <Clock3 size={13} />}
                  {isPaid
                    ? t("invoice.stampPaid", { defaultValue: "Payée" })
                    : t("invoice.stampPending", { defaultValue: "En attente" })}
                </div>
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
                {t("invoice.title", { defaultValue: "Facture" })}
              </p>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <p className="text-[18px] font-black tracking-tight text-white tabular-nums">
                  {number}
                </p>
                <p className="text-[11.5px] text-white/70">{createdAt}</p>
              </div>
            </div>

            {/* Item */}
            <div className="flex items-center gap-3 px-5 pt-4">
              <OrderItemImage
                src={order.item_image}
                className="h-16 w-16 shrink-0 rounded-2xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold leading-snug">{order.item_name}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "#6b7280" }}>
                  {order.kind === "auction"
                    ? t("pay.kind.auction", { defaultValue: "Enchère remportée" })
                    : t("pay.kind.fixed", { defaultValue: "Achat immédiat" })}
                </p>
              </div>
            </div>

            {/* Parties */}
            <div className="mt-4 grid grid-cols-2 gap-3 px-5">
              <div className="rounded-2xl p-3" style={{ backgroundColor: "#F4F2EC" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: "#9ca3af" }}
                >
                  {t("invoice.seller", { defaultValue: "Vendeur" })}
                </p>
                <p className="mt-1 truncate text-[13px] font-bold">{seller?.display_name ?? "—"}</p>
                {seller?.handle && (
                  <p className="truncate text-[11.5px]" style={{ color: "#6b7280" }}>
                    @{seller.handle}
                  </p>
                )}
              </div>
              <div className="rounded-2xl p-3" style={{ backgroundColor: "#F4F2EC" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: "#9ca3af" }}
                >
                  {t("invoice.buyer", { defaultValue: "Acheteur" })}
                </p>
                <p className="mt-1 truncate text-[13px] font-bold">{buyerName}</p>
                {buyer?.handle && (
                  <p className="truncate text-[11.5px]" style={{ color: "#6b7280" }}>
                    @{buyer.handle}
                  </p>
                )}
              </div>
            </div>

            {/* Delivery address */}
            {(addressLines.length > 0 || snap?.phone) && (
              <div className="mx-5 mt-3 rounded-2xl p-3" style={{ backgroundColor: "#F4F2EC" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: "#9ca3af" }}
                >
                  {t("orderDetail.deliveryAddress", { defaultValue: "Adresse de livraison" })}
                </p>
                <div className="mt-1 space-y-0.5 text-[12.5px] leading-snug">
                  {snap?.phone && <p className="font-semibold">{snap.phone}</p>}
                  {addressLines.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                  {snap?.details && <p style={{ color: "#6b7280" }}>↳ {snap.details}</p>}
                  {snap?.country && (
                    <p
                      className="flex items-center gap-1.5 pt-0.5 text-[11.5px]"
                      style={{ color: "#6b7280" }}
                    >
                      <CountryFlag code={snap.country} className="h-3 w-4 rounded-[2px]" />
                      {countryName(snap.country, lang)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Notched perforation divider */}
            <div className="relative mt-5 flex items-center px-5" aria-hidden>
              <span
                className="absolute -left-3 h-6 w-6 rounded-full"
                style={{ backgroundColor: "#F5F2EA" }}
              />
              <span
                className="h-0 w-full border-t-2 border-dashed"
                style={{ borderColor: "#D8D4C8" }}
              />
              <span
                className="absolute -right-3 h-6 w-6 rounded-full"
                style={{ backgroundColor: "#F5F2EA" }}
              />
            </div>

            {/* Amounts */}
            <div className="space-y-2 px-5 pt-4 text-[13.5px]">
              <div className="flex items-center justify-between">
                <span style={{ color: "#6b7280" }}>
                  {t("pay.item", { defaultValue: "Article" })}
                </span>
                <span className="font-semibold tabular-nums">{fmt(Number(order.amount))}</span>
              </div>
              {isCourier ? (
                <div className="flex items-center justify-between">
                  <span style={{ color: "#6b7280" }}>
                    {t("delivery.fee", { defaultValue: "Livraison" })}
                  </span>
                  <span className="font-semibold">
                    {t("delivery.courierShort", { defaultValue: "au livreur" })}
                  </span>
                </div>
              ) : Number(order.delivery_fee) > 0 ? (
                <div className="flex items-center justify-between">
                  <span style={{ color: "#6b7280" }}>
                    {t("delivery.fee", { defaultValue: "Livraison" })}
                    {order.delivery_zone ? ` · ${order.delivery_zone}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmt(Number(order.delivery_fee))}
                  </span>
                </div>
              ) : null}
              <div
                className="flex items-baseline justify-between border-t pt-2.5"
                style={{ borderColor: "#E8E4D8" }}
              >
                <span className="text-[13px] font-bold uppercase tracking-wide">
                  {t("pay.total", { defaultValue: "Total" })}
                </span>
                <span className="text-[22px] font-black tabular-nums" style={{ color: "#10162B" }}>
                  {fmt(Number(order.total))}
                </span>
              </div>
            </div>

            {/* Payment meta */}
            <div className="px-5 pb-5 pt-3">
              {isPaid ? (
                <p className="text-[11.5px]" style={{ color: "#6b7280" }}>
                  {t("invoice.paidVia", {
                    defaultValue: "Payée le {{date}} · {{method}}",
                    date: paidAt ?? createdAt,
                    method: payMethodLabel,
                  })}
                </p>
              ) : (
                <p className="text-[11.5px]" style={{ color: "#b45309" }}>
                  {t("invoice.pendingNote", {
                    defaultValue:
                      "Paiement en attente — la facture sera validée après règlement.",
                  })}
                </p>
              )}
              <p className="mt-2 text-[10px] tabular-nums" style={{ color: "#c2beb2" }}>
                {order.id}
              </p>
              <p className="mt-3 text-center text-[12px] font-semibold" style={{ color: "#9ca3af" }}>
                {t("invoice.thanks", { defaultValue: "Merci pour ta confiance 💛" })}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Press
            onClick={() => void shareImage()}
            disabled={!!busy}
            className="!min-h-12 flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: "#10162B" }}
          >
            {busy === "image" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Share2 size={15} />
            )}
            {t("invoice.shareImage", { defaultValue: "Partager l'image" })}
          </Press>
          <Press
            onClick={() => void savePdf()}
            disabled={!!busy}
            aria-label={t("invoice.downloadPdf", { defaultValue: "Télécharger PDF" })}
            className="!min-h-12 !min-w-12 rounded-2xl border border-border disabled:opacity-60"
          >
            {busy === "pdf" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileDown size={16} />
            )}
          </Press>
          <Press
            onClick={async () => {
              haptic.selection();
              try {
                await navigator.clipboard.writeText(shareText);
                toast.success(t("invoice.copied", { defaultValue: "Facture copiée" }));
              } catch {
                toast.error(t("invoice.copyFailed", { defaultValue: "Copie impossible" }));
              }
            }}
            disabled={!!busy}
            aria-label={t("invoice.copy", { defaultValue: "Copier" })}
            className="!min-h-12 !min-w-12 rounded-2xl border border-border disabled:opacity-60"
          >
            <Copy size={16} />
          </Press>
        </div>
        <p className="mt-2 px-1 text-center text-[11px] text-muted-foreground">
          {t("invoice.shareHint", {
            defaultValue:
              "Partager ouvre WhatsApp / Messages… · PDF te demande où enregistrer la facture.",
          })}
        </p>
      </div>
    </PushScreen>
  );
}
