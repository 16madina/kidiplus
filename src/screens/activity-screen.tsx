import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { Bell, Radio, Package, Truck, Trash2, Inbox, Check, CreditCard, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import {
  formatRelative,
  initialNotifications,
  initialOrders,
  orderDateShort,
  orderStatusMeta,
  type Notification,
  type Order,
} from "@/lib/activity-mock";
import { formatEuro } from "@/lib/live-viewer-mock";

type Tab = "notifs" | "orders";

export function ActivityScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("notifs");
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setNotifs(initialNotifications());
      setOrders(initialOrders());
      setLoading(false);
    }, 450);
    return () => clearTimeout(t);
  }, []);

  const removeNotif = (id: string) => {
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    toast(t("common.remove"));
  };
  const markRead = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
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
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
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
                        onTap={() => markRead(n.id)}
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
                  message="Aucune commande pour l'instant"
                />
              ) : (
                orders.map((o, i) => (
                  <OrderCard key={o.id} order={o} index={i} onOpen={() => setOpenOrder(o)} />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <OrderDetailScreen order={openOrder} onClose={() => setOpenOrder(null)} />
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
  n: Notification;
  index: number;
  onDelete: () => void;
  onTap: () => void;
}) {
  const x = useMotionValue(0);
  const [snapped, setSnapped] = useState(false);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80, transition: { duration: 0.2, ease: EASE_IOS } }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 8) * 0.03 }}
      className="relative overflow-hidden"
    >
      {/* delete action underneath */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end"
        style={{ width: SWIPE_ACTION, backgroundColor: "oklch(0.6 0.24 27)" }}
      >
        <button
          onClick={onDelete}
          className="flex h-full w-full flex-col items-center justify-center gap-1 text-white"
        >
          <Trash2 size={18} strokeWidth={2.2} />
          <span className="text-[11px] font-semibold">Supprimer</span>
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
            <div className="relative shrink-0">
              <img
                src={n.avatar}
                alt=""
                className="h-11 w-11 rounded-full object-cover"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                draggable={false}
              />
              <NotifKindBadge kind={n.kind} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug">
                <span className={n.unread ? "font-semibold" : "font-medium text-foreground/85"}>
                  {n.title}
                </span>
              </p>
              {n.body && (
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{n.body}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatRelative(n.minutesAgo)}
              </p>
            </div>
            {n.unread && (
              <span
                aria-label="Non lu"
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

function NotifKindBadge({ kind }: { kind: Notification["kind"] }) {
  const map: Record<Notification["kind"], { icon: React.ReactNode; bg: string }> = {
    live: { icon: <Radio size={9} />, bg: "oklch(0.65 0.26 15)" },
    shipped: { icon: <Truck size={9} />, bg: "oklch(0.7 0.17 55)" },
    outbid: { icon: <Bell size={9} />, bg: "oklch(0.6 0.2 250)" },
    sold: { icon: <Check size={9} />, bg: "oklch(0.6 0.17 155)" },
    follow: { icon: <Bell size={9} />, bg: "oklch(0.55 0.16 300)" },
    reminder: { icon: <Bell size={9} />, bg: "oklch(0.62 0.24 20)" },
  };
  const m = map[kind];
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full text-white ring-2 ring-background"
      style={{ backgroundColor: m.bg }}
    >
      {m.icon}
    </span>
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

/* ================= Orders ================= */

function OrderCard({ order, index, onOpen }: { order: Order; index: number; onOpen: () => void }) {
  const meta = orderStatusMeta(order.status);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 8) * 0.03 }}
    >
      <Press
        onClick={onOpen}
        className="!block w-full overflow-hidden rounded-2xl p-0 text-left"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3 p-3">
          <img
            src={order.image}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
            onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[14px] font-semibold">{order.product}</p>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: meta.bg, color: meta.color }}
              >
                {meta.label}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              @{order.seller} · {orderDateShort(order.date)}
            </p>
            <p className="mt-0.5 text-[13px] font-bold">{formatEuro(order.price)}</p>
          </div>
        </div>
      </Press>
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

/* ================= Order detail ================= */

const STEPS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "ordered", label: "Commandé", icon: <Check size={12} strokeWidth={3} /> },
  { key: "paid", label: "Payé", icon: <CreditCard size={12} strokeWidth={2.5} /> },
  { key: "shipped", label: "Expédié", icon: <Truck size={12} strokeWidth={2.5} /> },
  { key: "delivered", label: "Livré", icon: <Package size={12} strokeWidth={2.5} /> },
];

function statusIndex(s: Order["status"]): number {
  if (s === "paid") return 1;
  if (s === "shipped") return 2;
  return 3;
}

function OrderDetailScreen({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <PushScreen open={!!order} onClose={onClose} title={order ? order.code : ""} zIndex={65}>
      {order && <OrderDetailBody order={order} />}
    </PushScreen>
  );
}

function OrderDetailBody({ order }: { order: Order }) {
  const meta = orderStatusMeta(order.status);
  const activeIdx = statusIndex(order.status);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setProgress(activeIdx), 120);
    return () => clearTimeout(t);
  }, [activeIdx]);

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Summary card */}
      <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
        <img
          src={order.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{order.product}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">@{order.seller}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[14px] font-bold">{formatEuro(order.price)}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
          </div>
        </div>
      </div>

      {/* Tracking timeline */}
      <div className="rounded-2xl border border-border p-4">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Suivi
        </h2>
        <div className="relative pl-8">
          {/* connector track */}
          <div
            className="absolute left-[13px] top-3 bottom-3 w-[2px] rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          />
          {/* animated progress (scaleY only) */}
          <motion.div
            className="absolute left-[13px] top-3 bottom-3 w-[2px] rounded-full"
            style={{
              backgroundColor: "oklch(0.6 0.17 155)",
              transformOrigin: "top center",
            }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: progress / (STEPS.length - 1) }}
            transition={{ duration: 0.6, ease: EASE_IOS }}
          />

          <ul className="space-y-4">
            {STEPS.map((s, i) => {
              const done = i <= activeIdx;
              const filled = i <= progress;
              return (
                <li key={s.key} className="relative">
                  <motion.span
                    className="absolute -left-8 top-0 grid h-7 w-7 place-items-center rounded-full"
                    initial={false}
                    animate={{
                      backgroundColor: filled
                        ? "oklch(0.6 0.17 155)"
                        : "color-mix(in oklch, var(--muted) 100%, transparent)",
                      color: filled ? "#fff" : "var(--muted-foreground)",
                      scale: filled ? 1 : 0.9,
                    }}
                    transition={{ duration: 0.25, ease: EASE_IOS, delay: i * 0.06 }}
                  >
                    {s.icon}
                  </motion.span>
                  <div className="min-h-7 pt-0.5">
                    <p className={`text-[14px] ${done ? "font-semibold" : "text-muted-foreground"}`}>
                      {s.label}
                    </p>
                    {i === activeIdx && (
                      <p className="text-[11px] text-muted-foreground">
                        {orderDateShort(order.date)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Address */}
      <div className="rounded-2xl border border-border p-4">
        <div className="mb-2 flex items-center gap-2">
          <MapPin size={14} className="text-muted-foreground" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Livraison
          </h2>
        </div>
        <p className="text-[14px] font-semibold">{order.address.name}</p>
        <p className="text-[13px] text-muted-foreground">
          {order.address.line1}
          <br />
          {order.address.zip} {order.address.city}
          <br />
          {order.address.country}
        </p>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-border p-4">
        <Row label="Sous-total" value={formatEuro(order.price)} />
        <Row label="Livraison" value="Offerte" />
        <div className="my-2 h-px bg-border" />
        <Row label="Total" value={formatEuro(order.price)} bold />
      </div>
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
