import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { Bell, Radio, Package, Truck, Trash2, Inbox, Check, PackageCheck, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import { formatRelative, orderDateShort } from "@/lib/activity-mock";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyOrders,
  subscribeOrders,
  type OrderRow,
  type OrderStatus,
  type FulfillmentStatus,
} from "@/lib/orders-db";
import { confirmOrderDelivered, disputeOrder, releaseOverdueEscrow } from "@/lib/escrow-db";
import { expireOverdueOrders } from "@/lib/lives-db";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { AdminMessagesInbox } from "@/components/moderation/admin-messages-inbox";
import { SuspensionBanner } from "@/components/moderation/moderation-gate";
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeMyNotifications,
  type NotificationRow,
} from "@/lib/notifications-db";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { LeaveReviewSheet } from "@/components/orders/leave-review-sheet";
import { fetchOrderById } from "@/lib/orders-db";
import { fetchMyReviewedOrderIds } from "@/lib/reviews-db";
import { payloadFromNotificationRow, openFromPush } from "@/lib/push-router";
import { GuestEmptyState } from "@/components/guest-empty-state";

type Tab = "notifs" | "orders";

export function ActivityScreen() {
  const { guestMode } = useAuth();
  if (guestMode) {
    return (
      <GuestEmptyState
        icon={<Bell size={40} className="text-accent" />}
        title="Crée un compte pour voir ton activité"
        subtitle="Notifications, commandes, escrow, litiges — tout est ici une fois connecté."
      />
    );
  }
  return <ActivityScreenAuthed />;
}

function ActivityScreenAuthed() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("notifs");
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [openOrder, setOpenOrder] = useState<OrderRow | null>(null);
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const [reviewOrder, setReviewOrder] = useState<OrderRow | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  // Real DB-backed notifications.
  useEffect(() => {
    if (!user) { setNotifs([]); setLoading(false); return; }
    let alive = true;
    const load = async () => {
      const r = await fetchMyNotifications(50);
      if (!alive) return;
      setNotifs(r.rows);
      setLoading(false);
    };
    void load();
    const unsub = subscribeMyNotifications(user.id, () => { void load(); });
    return () => { alive = false; unsub(); };
  }, [user]);

  useEffect(() => {
    if (!user) { setOrders([]); return; }
    let alive = true;
    const load = async () => {
      // Opportunistic cleanup + escrow auto-release/reminders.
      await expireOverdueOrders().catch(() => 0);
      await releaseOverdueEscrow().catch(() => null);
      const rows = await fetchMyOrders(user.id);
      if (!alive) return;
      setOrders(rows);
      const deliveredIds = rows.filter((r) => r.fulfillment_status === "delivered").map((r) => r.id);
      const set = await fetchMyReviewedOrderIds(deliveredIds).catch(() => new Set<string>());
      if (alive) setReviewedIds(set);
    };
    void load();
    const unsub = subscribeOrders({ buyerId: user.id }, () => { void load(); });
    return () => { alive = false; unsub(); };
  }, [user]);

  // Listen for deep-link requests to open a specific order (from push tap).
  useEffect(() => {
    const onOpen = async (e: Event) => {
      const detail = (e as CustomEvent<{ order_id?: string }>).detail;
      const id = detail?.order_id;
      if (!id) return;
      setTab("orders");
      const local = orders.find((o) => o.id === id);
      if (local) { setOpenOrder(local); return; }
      const fetched = await fetchOrderById(id).catch(() => null);
      if (fetched) setOpenOrder(fetched);
    };
    window.addEventListener("kidi:open-order", onOpen as EventListener);
    return () => window.removeEventListener("kidi:open-order", onOpen as EventListener);
  }, [orders]);

  const removeNotif = (id: string) => {
    // Soft-hide locally (no destructive server delete — mark read).
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    void markNotificationRead(id);
    toast(t("common.remove"));
  };
  const markRead = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
    void markNotificationRead(id);
  };
  const openNotif = (n: NotificationRow) => {
    markRead(n.id);
    // Route based on notification kind + payload.
    openFromPush(payloadFromNotificationRow(n));
  };
  const markAll = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    void markAllNotificationsRead();
  };



  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="shrink-0 pt-safe"
        style={{
          backgroundColor: "color-mix(in oklch, var(--background) 90%, transparent)",
          backdropFilter: "saturate(180%) blur(18px)",
          WebkitBackdropFilter: "saturate(180%) blur(18px)",
        }}
      >
        <div className="px-4 pb-2 pt-2">
          <h1 className="mb-2 text-[22px] font-bold tracking-tight">{t("activity.title")}</h1>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: "notifs", label: t("activity.tabs.notifications") },
              { key: "orders", label: t("activity.tabs.orders") },
            ]}
          />
        </div>
      </div>

      {/* Body */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <AnimatePresence mode="wait">
          {tab === "notifs" ? (
            <motion.div
              key="notifs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="pt-2"
            >
              <SuspensionBanner />
              <AdminMessagesInbox />
              {notifs.some((n) => !n.read_at) && (
                <div className="flex justify-end px-4 pb-1 pt-2">
                  <button
                    onClick={markAll}
                    className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {t("notif.markAllRead")}
                  </button>
                </div>
              )}
              {loading ? (
                <NotifSkeletons />
              ) : notifs.length === 0 ? (
                <EmptyState
                  icon={<Inbox size={22} className="text-muted-foreground" />}
                  message={t("activity.empty.notifications")}
                />
              ) : (
                <ul>
                  <AnimatePresence initial={false}>
                    {notifs.map((n, i) => (
                      <NotifRow
                        key={n.id}
                        n={n}
                        index={i}
                        onDelete={() => removeNotif(n.id)}
                        onTap={() => openNotif(n)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="orders"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="space-y-3 px-4 pt-3"
            >
              {loading ? (
                <OrderSkeletons />
              ) : orders.length === 0 ? (
                <EmptyState
                  icon={<Package size={22} className="text-muted-foreground" />}
                  message={t("activity.empty.orders")}
                />
              ) : (
                orders.map((o, i) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    index={i}
                    hasReview={reviewedIds.has(o.id)}
                    onOpen={() => setOpenOrder(o)}
                    onPay={() => setPayOrder(o)}
                    onReview={() => setReviewOrder(o)}
                    onConfirm={async () => {
                      const r = await confirmOrderDelivered(o.id);
                      if (!r.ok) { toast.error(r.error); return; }
                      toast.success(t("orders.delivered"));
                      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, fulfillment_status: "delivered", delivered_confirmed_at: new Date().toISOString() } : x)));
                    }}
                    onDispute={async () => {
                      const r = await disputeOrder(o.id, "other");
                      if (!r.ok) { toast.error(r.error); return; }
                      toast.success(t("orders.disputeOpened"));
                      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, fulfillment_status: "disputed" } : x)));
                    }}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <OrderDetailScreen order={openOrder} onClose={() => setOpenOrder(null)} />
      <PaymentSheet
        order={payOrder}
        onClose={() => setPayOrder(null)}
        onPaid={() => setPayOrder(null)}
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

/* ================= Segmented control ================= */

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div
      className="relative flex rounded-xl p-1"
      style={{ backgroundColor: "var(--muted)" }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="relative flex-1 rounded-lg py-1.5 text-[13px] font-semibold outline-none"
            style={{
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              minHeight: 32,
            }}
          >
            {active && (
              <motion.span
                layoutId="seg-pill"
                className="absolute inset-0 -z-0 rounded-lg bg-background shadow-sm"
                transition={{ duration: 0.2, ease: EASE_IOS }}
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 1px rgba(0,0,0,0.04)" }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================= Notifications ================= */

const SWIPE_ACTION = 88;

function NotifRow({
  n,
  index,
  onDelete,
  onTap,
}: {
  n: NotificationRow;
  index: number;
  onDelete: () => void;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  const x = useMotionValue(0);
  const [snapped, setSnapped] = useState(false);
  const unread = !n.read_at;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(n.created_at).getTime()) / 60000));

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80, transition: { duration: 0.2, ease: EASE_IOS } }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 8) * 0.03 }}
      className="relative overflow-hidden"
    >
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end"
        style={{ width: SWIPE_ACTION, backgroundColor: "oklch(0.6 0.24 27)" }}
      >
        <button
          onClick={onDelete}
          className="flex h-full w-full flex-col items-center justify-center gap-1 text-white"
        >
          <Trash2 size={18} strokeWidth={2.2} />
          <span className="text-[11px] font-semibold">{t("common.delete")}</span>
        </button>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -SWIPE_ACTION, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        dragDirectionLock
        style={{ x }}
        onDragEnd={(_, info) => {
          const shouldSnap = info.offset.x < -SWIPE_ACTION / 2 || info.velocity.x < -300;
          const target = shouldSnap ? -SWIPE_ACTION : 0;
          animate(x, target, { duration: 0.2, ease: EASE_IOS });
          setSnapped(shouldSnap);
        }}
        className="relative bg-background"
      >
        <Press
          onClick={() => {
            if (snapped) {
              animate(x, 0, { duration: 0.2, ease: EASE_IOS });
              setSnapped(false);
              return;
            }
            onTap();
          }}
          className="!block w-full p-0 text-left"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <NotifKindIcon kind={n.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug">
                <span className={unread ? "font-semibold" : "font-medium text-foreground/85"}>
                  {n.title}
                </span>
              </p>
              {n.body && (
                <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{n.body}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatRelative(minutes)}
              </p>
            </div>
            {unread && (
              <span
                aria-label={t("common.notifications")}
                className="mt-2 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "oklch(0.6 0.2 250)" }}
              />
            )}
          </div>
        </Press>
      </motion.div>
    </motion.li>
  );
}

function NotifKindIcon({ kind }: { kind: string }) {
  let icon: React.ReactNode = <Bell size={18} />;
  let bg = "oklch(0.6 0.2 250)";
  if (kind === "order_shipped") { icon = <Truck size={18} />; bg = "oklch(0.6 0.16 60)"; }
  else if (kind === "order_delivered") { icon = <PackageCheck size={18} />; bg = "oklch(0.55 0.18 155)"; }
  else if (kind === "order_auto_released") { icon = <Check size={18} />; bg = "oklch(0.55 0.18 155)"; }
  else if (kind === "order_reminder") { icon = <Bell size={18} />; bg = "oklch(0.62 0.24 20)"; }
  else if (kind === "dispute_released" || kind === "dispute_refunded") { icon = <ShieldCheck size={18} />; bg = "oklch(0.55 0.16 300)"; }
  else if (kind === "live") { icon = <Radio size={18} />; bg = "oklch(0.65 0.26 15)"; }
  return (
    <div
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white"
      style={{ backgroundColor: bg }}
    >
      {icon}
    </div>
  );
}


function NotifSkeletons() {
  return (
    <ul>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-4/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ================= Orders (real, from DB) ================= */

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
  return new Date(iso).toLocaleString(lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function hoursLeft(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

const FULFILL_META: Record<FulfillmentStatus, { bg: string; color: string; key: string }> = {
  awaiting: { bg: "oklch(0.95 0.03 260)", color: "oklch(0.35 0.12 260)", key: "orders.fulfillment.awaiting" },
  shipped:  { bg: "oklch(0.94 0.06 60)",  color: "oklch(0.42 0.14 60)",  key: "orders.fulfillment.shipped" },
  delivered:{ bg: "oklch(0.94 0.06 155)", color: "oklch(0.4 0.12 155)",  key: "orders.fulfillment.delivered" },
  disputed: { bg: "oklch(0.94 0.06 27)",  color: "oklch(0.45 0.18 27)",  key: "orders.fulfillment.disputed" },
};

function OrderCard({
  order, index, onOpen, onPay, onConfirm, onDispute,
}: {
  order: OrderRow;
  index: number;
  onOpen: () => void;
  onPay: () => void;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const { t, i18n } = useTranslation();
  const meta = statusMeta(order.status);
  const isAuctionPending =
    order.status === "pending" && order.kind === "auction" && !!order.payment_deadline;
  const isTimeoutCancel =
    order.status === "cancelled" && order.cancelled_reason === "payment_timeout";
  const hrs = order.payment_deadline ? hoursLeft(order.payment_deadline) : null;
  const urgent = hrs !== null && hrs > 0 && hrs < 6;
  const isPaid = order.status === "paid";
  const canConfirm = isPaid && (order.fulfillment_status === "shipped" || order.fulfillment_status === "awaiting");
  const canDispute = isPaid && (order.fulfillment_status === "shipped" || order.fulfillment_status === "awaiting");
  const fm = FULFILL_META[order.fulfillment_status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 8) * 0.03 }}
    >
      <div
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <Press onClick={onOpen} className="!block w-full p-0 text-left">
          <div className="flex items-center gap-3 p-3">
            {order.item_image ? (
              <img
                src={order.item_image}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-xl bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-[14px] font-semibold">{order.item_name}</p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                >
                  {isTimeoutCancel ? t("orders.status.paymentTimeout") : t(meta.labelKey)}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {orderDateShort(new Date(order.created_at))}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-[13px] font-bold">{formatMoney(Number(order.total), order.currency)}</p>
                {isPaid && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: fm.bg, color: fm.color }}
                  >
                    {t(fm.key)}
                  </span>
                )}
              </div>
              {isAuctionPending && order.payment_deadline && (
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
        {isAuctionPending && (
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
      </div>
    </motion.div>
  );
}

function OrderSkeletons() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <div className="skeleton h-16 w-16 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-3/5" />
            <div className="skeleton h-3 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        </div>
      ))}
    </>
  );
}

/* ================= Order detail (real) ================= */

function OrderDetailScreen({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <PushScreen
      open={!!order}
      onClose={onClose}
      title={order ? order.item_name : ""}
      zIndex={65}
    >
      {order && <OrderDetailBody order={order} />}
      {!order && <div className="p-4 text-sm text-muted-foreground">{t("orders.empty")}</div>}
    </PushScreen>
  );
}

function OrderDetailBody({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const meta = statusMeta(order.status);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isBuyer = !!user && user.id === order.buyer_id;
  const canReview = isBuyer && order.fulfillment_status === "delivered";

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
        {order.item_image ? (
          <img src={order.item_image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" draggable={false} />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-xl bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{order.item_name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {orderDateShort(new Date(order.created_at))}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[14px] font-bold">{formatMoney(Number(order.total), order.currency)}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {t(meta.labelKey)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <Row label={t("pay.item")} value={formatMoney(Number(order.amount), order.currency)} />
        <Row label={t("pay.platformFee")} value={formatMoney(Number(order.platform_fee), order.currency)} />
        <Row label={t("pay.processingFee")} value={formatMoney(Number(order.processing_fee), order.currency)} />
        <div className="my-2 h-px bg-border" />
        <Row label={t("pay.total")} value={formatMoney(Number(order.total), order.currency)} bold />
      </div>

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

/* ================= Empty ================= */

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
      <p className="mt-3 text-[14px] text-muted-foreground">{message}</p>
    </div>
  );
}
