// OrdersScreen — "Mes commandes" hub with two sub-tabs.
//
// - "Commandes" (SALES): orders where the current user is the seller.
//   Tap → SellerOrderDetailSheet (shipping block + Marquer expédié).
// - "Commandé" (PURCHASES): orders where the current user is the buyer.
//   Tap → BuyerOrderDetail (timeline + confirm/dispute/pay).
//
// The same component is used from the profile quick action ("Mes commandes")
// AND embedded inside the Activité screen's orders tab. Money logic stays in
// SellerEarningsScreen — this screen owns fulfillment only.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Package,
  PackageCheck,
  AlertTriangle,
  Check,
  ShoppingBag,
  Store,
  MapPin,
  Truck,
  ReceiptText,
} from "lucide-react";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import { haptic } from "@/lib/haptics";
import { orderDateShort } from "@/lib/activity-mock";
import {
  fetchMyOrders,
  fetchSellerOrders,
  fetchProfilesByIds,
  fetchOrderById,
  subscribeOrders,
  type OrderRow,
  type OrderStatus,
  type FulfillmentStatus,
} from "@/lib/orders-db";
import {
  confirmOrderDelivered,
  disputeOrder,
  markOrderShipped,
  releaseOverdueEscrow,
} from "@/lib/escrow-db";
import { expireOverdueOrders } from "@/lib/lives-db";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OrderItemImage } from "@/components/orders/order-item-image";
import { LeaveReviewSheet } from "@/components/orders/leave-review-sheet";
import { fetchMyReviewedOrderIds } from "@/lib/reviews-db";
import { SellerOrderDetailSheet } from "@/components/seller/order-detail-sheet";
import { OrderInvoiceSheet } from "@/components/orders/order-invoice-sheet";
import { CountryFlag } from "@/components/country-flag";
import { countryName } from "@/lib/delivery-zones-data";

type ProfileMap = Record<string, { display_name: string; handle: string }>;

const FULFILL_META: Record<FulfillmentStatus, { bg: string; color: string; key: string }> = {
  awaiting: { bg: "oklch(0.95 0.03 260)", color: "oklch(0.35 0.12 260)", key: "orders.fulfillment.awaiting" },
  shipped:  { bg: "oklch(0.94 0.06 60)",  color: "oklch(0.42 0.14 60)",  key: "orders.fulfillment.shipped" },
  delivered:{ bg: "oklch(0.94 0.06 155)", color: "oklch(0.4 0.12 155)",  key: "orders.fulfillment.delivered" },
  disputed: { bg: "oklch(0.94 0.06 27)",  color: "oklch(0.45 0.18 27)",  key: "orders.fulfillment.disputed" },
};

function statusMeta(s: OrderStatus): { bg: string; color: string; labelKey: string } {
  switch (s) {
    case "paid":
      return { bg: "oklch(0.94 0.06 155)", color: "oklch(0.4 0.12 155)", labelKey: "orders.status.paid" };
    case "failed":
      return { bg: "oklch(0.94 0.06 27)", color: "oklch(0.45 0.18 27)", labelKey: "orders.status.failed" };
    case "cancelled":
      return { bg: "var(--muted)", color: "var(--muted-foreground)", labelKey: "orders.status.cancelled" };
    default:
      return { bg: "oklch(0.94 0.05 80)", color: "oklch(0.42 0.14 70)", labelKey: "orders.status.pending" };
  }
}

function formatDeadline(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function hoursLeft(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

/* ============================================================
   Embeddable content (used in Activité orders tab + PushScreen)
   ============================================================ */

type SubTab = "sales" | "purchases";

export function OrdersScreenContent({
  initialTab,
}: { initialTab?: SubTab } = {}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const isSeller = !!profile?.is_seller;
  const [tab, setTab] = useState<SubTab>(
    initialTab ?? (isSeller ? "sales" : "purchases"),
  );

  // Purchases (buyer side)
  const [purchases, setPurchases] = useState<OrderRow[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [openPurchase, setOpenPurchase] = useState<OrderRow | null>(null);
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const [paySuccessOnly, setPaySuccessOnly] = useState(false);
  const payOrderRef = useRef<OrderRow | null>(null);
  payOrderRef.current = payOrder;
  const [reviewOrder, setReviewOrder] = useState<OrderRow | null>(null);

  // Sales (seller side)
  const [sales, setSales] = useState<OrderRow[]>([]);
  const [buyers, setBuyers] = useState<ProfileMap>({});
  const [detailSale, setDetailSale] = useState<OrderRow | null>(null);

  // Purchases loader
  useEffect(() => {
    if (!user) { setPurchases([]); return; }
    let alive = true;
    const load = async () => {
      await Promise.all([
        expireOverdueOrders().catch(() => 0),
        releaseOverdueEscrow().catch(() => null),
      ]);
      const rows = await fetchMyOrders(user.id);
      if (!alive) return;
      setPurchases(rows);
      const deliveredIds = rows.filter((r) => r.fulfillment_status === "delivered").map((r) => r.id);
      const set = await fetchMyReviewedOrderIds(deliveredIds).catch(() => new Set<string>());
      if (alive) setReviewedIds(set);
    };
    void load();
    const unsub = subscribeOrders({ buyerId: user.id }, () => void load());
    return () => { alive = false; unsub(); };
  }, [user]);

  // Sales loader
  useEffect(() => {
    if (!user) { setSales([]); return; }
    let alive = true;
    const load = async () => {
      const rows = await fetchSellerOrders(user.id);
      if (!alive) return;
      setSales(rows);
      const ids = Array.from(new Set(rows.map((o) => o.buyer_id)));
      const profs = await fetchProfilesByIds(ids);
      if (alive) setBuyers(profs);
    };
    void load();
    const unsub = subscribeOrders({ sellerId: user.id }, () => void load());
    return () => { alive = false; unsub(); };
  }, [user]);

  // Deep-link: open a specific order (from push tap).
  useEffect(() => {
    const onOpen = async (e: Event) => {
      const detail = (e as CustomEvent<{ order_id?: string }>).detail;
      const id = detail?.order_id;
      if (!id) return;
      const local = purchases.find((o) => o.id === id);
      if (local) { setTab("purchases"); setOpenPurchase(local); return; }
      const asSale = sales.find((o) => o.id === id);
      if (asSale) { setTab("sales"); setDetailSale(asSale); return; }
      const fetched = await fetchOrderById(id).catch(() => null);
      if (!fetched) return;
      if (user && fetched.seller_id === user.id) { setTab("sales"); setDetailSale(fetched); }
      else { setTab("purchases"); setOpenPurchase(fetched); }
    };
    window.addEventListener("kidi:open-order", onOpen as EventListener);
    return () => window.removeEventListener("kidi:open-order", onOpen as EventListener);
  }, [purchases, sales, user]);

  // PayPal checkout return — PaymentSheet is usually unmounted after the browser
  // redirect, so show the green success sheet + refresh the purchases list here.
  useEffect(() => {
    const showPaid = async (orderId: string | undefined) => {
      toast.success(
        t("pay.method.paypalPaid", { defaultValue: "Payé avec PayPal" }),
      );
      haptic.success();
      setTab("purchases");
      let ord =
        (orderId ? purchases.find((o) => o.id === orderId) : null) ??
        (orderId ? await fetchOrderById(orderId).catch(() => null) : null);
      if (!ord && user) {
        const rows = await fetchMyOrders(user.id).catch(() => [] as OrderRow[]);
        setPurchases(rows);
        ord = orderId ? rows.find((o) => o.id === orderId) ?? null : null;
      } else if (ord) {
        setPurchases((os) =>
          os.map((x) =>
            x.id === ord!.id
              ? { ...x, status: "paid", payment_method: "paypal", paid_at: new Date().toISOString() }
              : x,
          ),
        );
      }
      if (ord) {
        setPaySuccessOnly(true);
        setPayOrder({
          ...ord,
          status: "paid",
          payment_method: "paypal",
          paid_at: ord.paid_at ?? new Date().toISOString(),
        });
      }
    };

    const onDone = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { ok?: boolean; status?: string; orderId?: string }
        | undefined;
      if (!(detail?.ok || detail?.status === "ok")) return;
      const open = payOrderRef.current;
      // PaymentSheet still open (native browser return) — it shows the green check.
      if (open && (!detail.orderId || open.id === detail.orderId)) {
        setPurchases((os) =>
          os.map((x) =>
            !detail.orderId || x.id === detail.orderId
              ? { ...x, status: "paid", payment_method: "paypal", paid_at: new Date().toISOString() }
              : x,
          ),
        );
        return;
      }
      void showPaid(detail.orderId);
    };

    window.addEventListener("kidi:paypal-order-done", onDone);

    try {
      const raw = sessionStorage.getItem("kidi:paypal_order_done");
      if (raw) {
        sessionStorage.removeItem("kidi:paypal_order_done");
        const parsed = JSON.parse(raw) as { status?: string; orderId?: string };
        if (parsed.status === "ok") void showPaid(parsed.orderId);
      }
    } catch {
      /* ignore */
    }

    return () => window.removeEventListener("kidi:paypal-order-done", onDone);
  }, [purchases, t, user]);

  const onShip = async (orderId: string) => {
    haptic.medium();
    const r = await markOrderShipped(orderId);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(t("orders.shipped"));
    setSales((os) =>
      os.map((o) =>
        o.id === orderId
          ? { ...o, fulfillment_status: "shipped", shipped_at: new Date().toISOString() }
          : o,
      ),
    );
  };

  const paidSalesCount = useMemo(
    () => sales.filter((s) => s.status === "paid").length,
    [sales],
  );
  const pendingSalesCount = useMemo(
    () => sales.filter((s) => s.status === "pending").length,
    [sales],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Segmented sub-tabs */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 rounded-full border border-border p-1">
          <TabBtn active={tab === "sales"} onClick={() => setTab("sales")}>
            <span className="inline-flex items-center gap-1.5">
              <Store size={13} /> {t("myOrders.tabs.sales", { defaultValue: "Mes ventes" })}
              {(paidSalesCount > 0 || pendingSalesCount > 0) && (
                <span
                  className="ml-1 rounded-full px-1.5 text-[10px] font-bold"
                  style={{ backgroundColor: "oklch(0.94 0.06 60)", color: "oklch(0.42 0.14 60)" }}
                >
                  {paidSalesCount + pendingSalesCount}
                </span>
              )}
            </span>
          </TabBtn>
          <TabBtn active={tab === "purchases"} onClick={() => setTab("purchases")}>
            <span className="inline-flex items-center gap-1.5">
              <ShoppingBag size={13} /> {t("myOrders.tabs.purchases", { defaultValue: "Mes achats" })}
            </span>
          </TabBtn>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-muted-foreground">
          {tab === "sales"
            ? t("myOrders.salesHint", {
                defaultValue: "Articles que des acheteurs t’ont commandés — à livrer une fois payés.",
              })
            : t("myOrders.purchasesHint", {
                defaultValue: "Articles que tu as commandés chez d’autres vendeurs.",
              })}
        </p>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <AnimatePresence mode="wait">
          {tab === "sales" ? (
            <motion.div
              key="sales"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="space-y-2"
            >
              <SalesList
                orders={sales}
                buyers={buyers}
                onOpen={(o) => setDetailSale(o)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="purchases"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="space-y-3"
            >
              {purchases.length === 0 ? (
                <EmptyState
                  icon={<Package size={22} className="text-muted-foreground" />}
                  message={t("activity.empty.orders")}
                />
              ) : (
                purchases.map((o, i) => (
                  <PurchaseCard
                    key={o.id}
                    order={o}
                    index={i}
                    hasReview={reviewedIds.has(o.id)}
                    onOpen={() => setOpenPurchase(o)}
                    onPay={() => {
                      setPaySuccessOnly(false);
                      setPayOrder(o);
                    }}
                    onReview={() => setReviewOrder(o)}
                    onConfirm={async () => {
                      const r = await confirmOrderDelivered(o.id);
                      if (!r.ok) { toast.error(r.error); return; }
                      toast.success(t("orders.delivered"));
                      setPurchases((os) => os.map((x) => x.id === o.id
                        ? { ...x, fulfillment_status: "delivered", delivered_confirmed_at: new Date().toISOString() }
                        : x));
                    }}
                    onDispute={async () => {
                      const r = await disputeOrder(o.id, "other");
                      if (!r.ok) { toast.error(r.error); return; }
                      toast.success(t("orders.disputeOpened"));
                      setPurchases((os) => os.map((x) => x.id === o.id
                        ? { ...x, fulfillment_status: "disputed" }
                        : x));
                    }}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sheets & push screens */}
      <SellerOrderDetailSheet
        order={detailSale}
        onClose={() => setDetailSale(null)}
        onShip={onShip}
      />
      <BuyerOrderDetailScreen order={openPurchase} onClose={() => setOpenPurchase(null)} />
      <PaymentSheet
        order={payOrder}
        successOnly={paySuccessOnly}
        onClose={() => {
          setPayOrder(null);
          setPaySuccessOnly(false);
        }}
        onPaid={(paid) => {
          setPayOrder(null);
          setPaySuccessOnly(false);
          setPurchases((os) =>
            os.map((x) =>
              x.id === paid.id
                ? {
                    ...x,
                    status: "paid",
                    payment_method: paid.payment_method || "wallet",
                    paid_at: new Date().toISOString(),
                  }
                : x,
            ),
          );
          setOpenPurchase((cur) =>
            cur && cur.id === paid.id
              ? {
                  ...cur,
                  status: "paid",
                  payment_method: paid.payment_method || "wallet",
                  paid_at: new Date().toISOString(),
                }
              : cur,
          );
        }}
      />
      {reviewOrder && (
        <LeaveReviewSheet
          open={!!reviewOrder}
          onClose={() => setReviewOrder(null)}
          orderId={reviewOrder.id}
          onSubmitted={() => {
            const id = reviewOrder.id;
            setReviewedIds((prev) => { const n = new Set(prev); n.add(id); return n; });
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   PushScreen wrapper (used from profile quick action)
   ============================================================ */
export function OrdersScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("myOrders.title", { defaultValue: "Mes commandes" })}
      zIndex={65}
    >
      <OrdersScreenContent />
    </PushScreen>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors"
      style={{
        backgroundColor: active ? "var(--foreground)" : "transparent",
        color: active ? "var(--background)" : "var(--muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
      <p className="mt-3 text-[14px] text-muted-foreground">{message}</p>
    </div>
  );
}

/* ============================================================
   Sales list (seller)
   ============================================================ */

function SalesList({
  orders,
  buyers,
  onOpen,
}: {
  orders: OrderRow[];
  buyers: ProfileMap;
  onOpen: (o: OrderRow) => void;
}) {
  const { t, i18n } = useTranslation();
  // Show paid (to ship) + pending (awaiting buyer payment). Hide failed/cancelled noise.
  const visible = orders.filter((o) => o.status === "paid" || o.status === "pending");
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<Store size={22} className="text-muted-foreground" />}
        message={t("myOrders.emptySales", { defaultValue: "Aucune commande à expédier pour le moment." })}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {visible.map((o) => {
        const buyer = buyers[o.buyer_id];
        const isPending = o.status === "pending";
        const fm = isPending
          ? { bg: "oklch(0.94 0.05 80)", color: "oklch(0.42 0.14 70)", key: "orders.status.pending" }
          : FULFILL_META[o.fulfillment_status];
        const snap = asSnapshot(o.address_snapshot);
        const destination = snap
          ? [snap.city, snap.country ? countryName(snap.country, i18n.language) : null]
              .filter(Boolean)
              .join(" · ")
          : null;
        return (
          <li key={o.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <Press onClick={() => onOpen(o)} className="!block w-full p-0 text-left">
              <div className="flex items-center gap-3 p-3">
                <OrderItemImage src={o.item_image} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[14px] font-semibold">{o.item_name}</p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: fm.bg, color: fm.color }}
                    >
                      {isPending
                        ? t("myOrders.awaitingBuyerPay", {
                            defaultValue: "En attente que l’acheteur paie",
                          })
                        : t(fm.key)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {buyer ? `@${buyer.handle}` : t("sales.buyer")} · {orderDateShort(new Date(o.created_at))}
                  </p>
                  {destination && (
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                      <MapPin size={11} className="shrink-0" /> {destination}
                    </p>
                  )}
                  <p className="mt-0.5 text-[13px] font-bold tabular-nums">
                    {formatMoney(Number(o.amount), o.currency, i18n.language)}
                  </p>
                </div>
              </div>
            </Press>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================
   Purchase card (buyer)
   ============================================================ */

function PurchaseCard({
  order, index, hasReview, onOpen, onPay, onConfirm, onDispute, onReview,
}: {
  order: OrderRow;
  index: number;
  hasReview?: boolean;
  onOpen: () => void;
  onPay: () => void;
  onConfirm: () => void;
  onDispute: () => void;
  onReview: () => void;
}) {
  const { t, i18n } = useTranslation();
  const meta = statusMeta(order.status);
  const deadlineOk =
    !order.payment_deadline || hoursLeft(order.payment_deadline) > 0;
  const deadlineExpired =
    !!order.payment_deadline && hoursLeft(order.payment_deadline) <= 0;
  // Any unpaid order the buyer can still settle (pending, or failed after a card attempt).
  const canPayNow =
    (order.status === "pending" || order.status === "failed") && deadlineOk;
  const isTimeoutCancel =
    order.status === "cancelled" && order.cancelled_reason === "payment_timeout";
  const showAsExpired =
    isTimeoutCancel ||
    (deadlineExpired &&
      (order.status === "pending" || order.status === "failed" || order.status === "cancelled"));
  const hrs = order.payment_deadline ? hoursLeft(order.payment_deadline) : null;
  const urgent = hrs !== null && hrs > 0 && hrs < 6;
  const isPaid = order.status === "paid";
  const canConfirm = isPaid && (order.fulfillment_status === "shipped" || order.fulfillment_status === "awaiting");
  const canDispute = canConfirm;
  const fm = FULFILL_META[order.fulfillment_status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 8) * 0.03 }}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Press onClick={onOpen} className="!block w-full p-0 text-left">
          <div className="flex items-center gap-3 p-3">
            <OrderItemImage src={order.item_image} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-[14px] font-semibold">{order.item_name}</p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                >
                  {showAsExpired ? t("orders.status.paymentTimeout") : t(meta.labelKey)}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {orderDateShort(new Date(order.created_at))}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-[13px] font-bold">{formatMoney(Number(order.total), order.currency, i18n.language)}</p>
                {isPaid && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: fm.bg, color: fm.color }}
                  >
                    {t(fm.key)}
                  </span>
                )}
              </div>
              {canPayNow && order.payment_deadline && (
                <p
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: urgent ? "oklch(0.94 0.06 27)" : "oklch(0.94 0.05 80)",
                    color: urgent ? "oklch(0.45 0.18 27)" : "oklch(0.42 0.14 70)",
                  }}
                >
                  {t("orders.payBefore", { date: formatDeadline(order.payment_deadline, i18n.language) })}
                </p>
              )}
            </div>
          </div>
        </Press>
        {canPayNow && (
          <div className="border-t border-border p-2">
            <Press
              onClick={onPay}
              className="!block w-full rounded-xl py-2.5 text-center text-[13px] font-bold text-white"
              style={{ backgroundColor: "oklch(0.6 0.18 250)" }}
            >
              {t("orders.payNow")}
            </Press>
          </div>
        )}
        {isPaid && canConfirm && (
          <div className="flex gap-2 border-t border-border p-2">
            <Press
              onClick={onConfirm}
              className="!min-h-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold text-white"
              style={{ backgroundColor: "oklch(0.55 0.18 155)" }}
            >
              <PackageCheck size={14} /> {t("orders.confirmDelivery")}
            </Press>
            {canDispute && (
              <Press
                onClick={onDispute}
                className="!min-h-10 flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[12px] font-semibold"
                style={{ borderColor: "oklch(0.85 0.14 27)", color: "oklch(0.5 0.18 27)" }}
              >
                <AlertTriangle size={12} /> {t("orders.reportProblem")}
              </Press>
            )}
          </div>
        )}
        {isPaid && order.fulfillment_status === "delivered" && (
          <div className="border-t border-border p-2">
            {hasReview ? (
              <div
                className="!min-h-10 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold"
                style={{ backgroundColor: "oklch(0.96 0.03 155)", color: "oklch(0.4 0.12 155)" }}
              >
                <Check size={14} /> {t("reviews.left", { defaultValue: "Avis laissé" })}
              </div>
            ) : (
              <Press
                onClick={onReview}
                className="!min-h-10 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, oklch(0.7 0.16 60), oklch(0.62 0.17 45))" }}
              >
                ⭐ {t("reviews.rateOrder", { defaultValue: "Noter cette commande" })}
              </Press>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ============================================================
   Buyer order detail (PushScreen with timeline)
   ============================================================ */

function BuyerOrderDetailScreen({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Reset invoice when leaving / switching order so back stack stays clean.
  useEffect(() => {
    if (!order) setInvoiceOpen(false);
  }, [order]);

  return (
    <PushScreen
      open={!!order}
      onClose={onClose}
      title={order ? order.item_name : ""}
      zIndex={70}
      swipeBackEnabled={!invoiceOpen}
    >
      {order && (
        <BuyerOrderDetailBody
          order={order}
          invoiceOpen={invoiceOpen}
          onInvoiceOpenChange={setInvoiceOpen}
        />
      )}
      {!order && <div className="p-4 text-sm text-muted-foreground">{t("orders.empty")}</div>}
    </PushScreen>
  );
}

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

function fullDate(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(lang, {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function BuyerOrderDetailBody({
  order,
  invoiceOpen,
  onInvoiceOpenChange,
}: {
  order: OrderRow;
  invoiceOpen: boolean;
  onInvoiceOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const meta = statusMeta(order.status);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isBuyer = !!user && user.id === order.buyer_id;
  const canReview = isBuyer && order.fulfillment_status === "delivered";
  const fm = FULFILL_META[order.fulfillment_status];
  const snap = asSnapshot(order.address_snapshot);
  const addressParts = snap
    ? [
        snap.street_address,
        snap.zone_or_commune,
        [snap.postal_code, snap.city].filter(Boolean).join(" "),
        snap.region,
      ].filter((p): p is string => !!p && String(p).trim().length > 0)
    : [];
  const shippedDate = fullDate(order.shipped_at, i18n.language);
  const deliveredDate = fullDate(order.delivered_confirmed_at, i18n.language);

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
        <OrderItemImage src={order.item_image} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{order.item_name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {orderDateShort(new Date(order.created_at))}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold">
              {formatMoney(Number(order.total), order.currency, i18n.language)}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {t(meta.labelKey)}
            </span>
            {order.status === "paid" && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: fm.bg, color: fm.color }}
              >
                {t(fm.key)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Buyer invoice: item + delivery = total. Platform/processing fees are
          charged to the seller, never added on top of the buyer's total. */}
      <div className="rounded-2xl border border-border p-4">
        <Row label={t("pay.item")} value={formatMoney(Number(order.amount), order.currency, i18n.language)} />
        {order.delivery_mode === "courier" ? (
          <Row label={t("delivery.fee", { defaultValue: "Livraison" })} value={t("delivery.courierShort", { defaultValue: "au livreur" })} />
        ) : Number(order.delivery_fee) > 0 ? (
          <Row
            label={
              t("delivery.fee", { defaultValue: "Livraison" }) +
              (order.delivery_zone ? ` · ${order.delivery_zone}` : "")
            }
            value={formatMoney(Number(order.delivery_fee), order.currency, i18n.language)}
          />
        ) : null}
        <div className="my-2 h-px bg-border" />
        <Row label={t("pay.total")} value={formatMoney(Number(order.total), order.currency, i18n.language)} bold />
        <Press
          onClick={() => { haptic.selection(); onInvoiceOpenChange(true); }}
          className="!min-h-10 mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[13px] font-semibold"
        >
          <ReceiptText size={14} /> {t("invoice.viewCta", { defaultValue: "Voir la facture" })}
        </Press>
      </div>

      {/* Delivery address (buyer view) */}
      {snap && (
        <section className="rounded-2xl border border-border p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <MapPin size={12} />
            {t("orderDetail.deliveryAddress", { defaultValue: "Adresse de livraison" })}
          </div>
          {snap.full_name && <p className="text-[14px] font-semibold">{snap.full_name}</p>}
          {snap.phone && <p className="mt-0.5 text-[13px] text-muted-foreground">{snap.phone}</p>}
          <div className="mt-1 space-y-0.5 text-[13px] leading-snug">
            {addressParts.map((p, i) => <p key={i}>{p}</p>)}
            {snap.details && <p className="text-muted-foreground">↳ {snap.details}</p>}
          </div>
          {snap.country && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <CountryFlag code={snap.country} className="h-3 w-4 rounded-sm" />
              {countryName(snap.country, i18n.language)}
            </p>
          )}
        </section>
      )}

      {/* Shipping progress (dates) */}
      {order.status === "paid" && (
        <section className="rounded-2xl border border-border p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Truck size={12} />
            {t("orderDetail.shippingTitle", { defaultValue: "Livraison" })}
          </div>
          <div className="space-y-1.5 text-[13px]">
            <p>
              <span className="font-semibold">{t("orderDetail.shippedOn", { defaultValue: "Expédié le" })}:</span>{" "}
              {shippedDate ?? t("orderDetail.notYetShipped", { defaultValue: "pas encore expédié" })}
            </p>
            <p>
              <span className="font-semibold">{t("orderDetail.deliveredOn", { defaultValue: "Reçu le" })}:</span>{" "}
              {deliveredDate ?? t("orderDetail.notYetDelivered", { defaultValue: "pas encore reçu" })}
            </p>
          </div>
        </section>
      )}

      {canReview && (
        <Press
          onClick={() => setReviewOpen(true)}
          className="!min-h-12 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.7 0.16 60), oklch(0.62 0.17 45))" }}
        >
          <Check size={16} /> {t("reviews.leave", { defaultValue: "Laisser un avis" })}
        </Press>
      )}

      <div className="rounded-2xl border border-border p-4">
        <p className="mb-3 text-[13px] font-semibold">{t("timeline.title")}</p>
        <OrderTimeline orderId={order.id} />
      </div>

      <LeaveReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        orderId={order.id}
      />
      <OrderInvoiceSheet
        order={order}
        open={invoiceOpen}
        onClose={() => onInvoiceOpenChange(false)}
      />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-[13px] ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-[13px] tabular-nums ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
