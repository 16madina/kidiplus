import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { Bell, Radio, Truck, Trash2, Inbox, Check, PackageCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { formatRelative } from "@/lib/activity-mock";
import { useAuth } from "@/lib/auth-context";
import { AdminMessagesInbox } from "@/components/moderation/admin-messages-inbox";
import { SuspensionBanner, AccountFrozenBanner } from "@/components/moderation/moderation-gate";
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeMyNotifications,
  type NotificationRow,
} from "@/lib/notifications-db";
import { payloadFromNotificationRow, openFromPush } from "@/lib/push-router";
import { GuestActivityScreen } from "@/components/guest-activity-screen";
import { OrdersScreen } from "@/screens/orders-screen";
import { DmInboxContent, OPEN_DM_EVENT } from "@/components/dm/dm-inbox";

type Tab = "notifs" | "messages";

export function ActivityScreen({
  embedded = false,
  initialTab = "notifs",
}: {
  /** When true, hide the page title (PushScreen already shows it) and trim tab padding. */
  embedded?: boolean;
  initialTab?: Tab;
}) {
  const { guestMode } = useAuth();
  if (guestMode) return <GuestActivityScreen />;
  return <ActivityScreenAuthed embedded={embedded} initialTab={initialTab} />;
}

function ActivityScreenAuthed({
  embedded,
  initialTab,
}: {
  embedded: boolean;
  initialTab: Tab;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [ordersOpen, setOrdersOpen] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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

  // Order deep-link (push tap): orders now live in the profile, so open the
  // Orders overlay here and replay the event once its content is mounted.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOrdersOpen((already) => {
        if (!already && detail?.order_id) {
          setTimeout(() => {
            try {
              window.dispatchEvent(new CustomEvent("kidi:open-order", { detail }));
            } catch { /* ignore */ }
          }, 350);
        }
        return true;
      });
    };
    window.addEventListener("kidi:open-order", onOpen as EventListener);
    return () => window.removeEventListener("kidi:open-order", onOpen as EventListener);
  }, []);

  // DM deep-link (push tap) → switch to Messages tab; DmInboxContent opens the thread.
  useEffect(() => {
    const onOpen = () => setTab("messages");
    window.addEventListener(OPEN_DM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DM_EVENT, onOpen);
  }, []);

  const removeNotif = (id: string) => {
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
        className="shrink-0"
        style={
          embedded
            ? undefined
            : {
                paddingTop: "env(safe-area-inset-top)",
                backgroundColor: "color-mix(in oklch, var(--background) 90%, transparent)",
                backdropFilter: "saturate(180%) blur(18px)",
                WebkitBackdropFilter: "saturate(180%) blur(18px)",
              }
        }
      >
        <div className="px-4 pb-2 pt-2">
          {!embedded && (
            <h1 className="mb-2 text-[22px] font-bold tracking-tight">{t("activity.title")}</h1>
          )}
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: "notifs", label: t("activity.tabs.notifications") },
              { key: "messages", label: t("activity.tabs.messages", { defaultValue: "Messages" }) },
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
          paddingBottom: embedded
            ? "calc(1rem + env(safe-area-inset-bottom))"
            : "calc(5.5rem + env(safe-area-inset-bottom))",
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
              <AccountFrozenBanner />
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
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="h-full"
            >
              <DmInboxContent />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Orders overlay for push deep-links (orders tab moved to profile). */}
      <OrdersScreen open={ordersOpen} onClose={() => setOrdersOpen(false)} />
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

/* ================= Empty ================= */

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
      <p className="mt-3 text-[14px] text-muted-foreground">{message}</p>
    </div>
  );
}
