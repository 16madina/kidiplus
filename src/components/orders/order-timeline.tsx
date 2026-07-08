// Vertical event timeline for an order. Used in buyer/seller order detail
// (simple view) and admin (with actor handles).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShoppingBag,
  CreditCard,
  Truck,
  PackageCheck,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  fetchOrderEvents,
  subscribeOrderEvents,
  type OrderEventKind,
  type OrderEventRow,
} from "@/lib/order-events-db";
import { fetchProfilesByIds } from "@/lib/orders-db";

const META: Record<
  OrderEventKind,
  { icon: React.ComponentType<{ size?: number }>; color: string; key: string }
> = {
  created:           { icon: ShoppingBag,   color: "oklch(0.55 0.16 260)", key: "timeline.event.created" },
  paid:              { icon: CreditCard,    color: "oklch(0.55 0.18 250)", key: "timeline.event.paid" },
  shipped:           { icon: Truck,         color: "oklch(0.6 0.16 60)",   key: "timeline.event.shipped" },
  delivery_confirmed:{ icon: PackageCheck,  color: "oklch(0.55 0.18 155)", key: "timeline.event.delivered" },
  auto_released:     { icon: Clock,         color: "oklch(0.55 0.18 155)", key: "timeline.event.autoReleased" },
  disputed:          { icon: AlertTriangle, color: "oklch(0.55 0.2 27)",   key: "timeline.event.disputed" },
  dispute_released:  { icon: ShieldCheck,   color: "oklch(0.55 0.18 155)", key: "timeline.event.disputeReleased" },
  dispute_refunded:  { icon: Undo2,         color: "oklch(0.55 0.16 300)", key: "timeline.event.disputeRefunded" },
  cancelled:         { icon: XCircle,       color: "oklch(0.55 0.05 260)", key: "timeline.event.cancelled" },
};

export function OrderTimeline({
  orderId,
  showActors = false,
}: {
  orderId: string;
  showActors?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<OrderEventRow[]>([]);
  const [handles, setHandles] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const rows = await fetchOrderEvents(orderId);
      if (!alive) return;
      setEvents(rows);
      if (showActors) {
        const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
        if (ids.length) {
          const profs = await fetchProfilesByIds(ids);
          if (!alive) return;
          const map: Record<string, string> = {};
          for (const id of Object.keys(profs)) map[id] = profs[id].handle;
          setHandles(map);
        }
      }
    };
    void load();
    const unsub = subscribeOrderEvents(orderId, () => { void load(); });
    return () => { alive = false; unsub(); };
  }, [orderId, showActors]);

  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-muted-foreground">
        {t("timeline.empty")}
      </p>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });

  return (
    <ol className="relative ml-2 border-l border-border pl-4">
      {events.map((e, i) => {
        const m = META[e.event] ?? META.created;
        const Icon = m.icon;
        const actor = e.actor_id ? handles[e.actor_id] : null;
        return (
          <li key={e.id} className="relative pb-4 last:pb-0">
            <span
              className="absolute -left-[26px] top-0 grid h-6 w-6 place-items-center rounded-full ring-4 ring-background"
              style={{ backgroundColor: m.color, color: "white" }}
            >
              <Icon size={12} />
            </span>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold">{t(m.key)}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {fmt(e.created_at)}
              </span>
            </div>
            {showActors && actor && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("timeline.by")} @{actor}
              </p>
            )}
            {showActors && !actor && e.event === "auto_released" && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("timeline.system")}</p>
            )}
            {i < events.length - 1 ? null : null}
          </li>
        );
      })}
    </ol>
  );
}
