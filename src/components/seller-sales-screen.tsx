// SellerSalesScreen — lists paid + pending orders where the current user is
// the seller. Tap a row to view its event timeline.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { PushScreen } from "@/components/push-screen";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSellerOrders,
  fetchProfilesByIds,
  subscribeOrders,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders-db";
import { formatMoney } from "@/lib/money";

type BuyerMap = Record<string, { display_name: string; handle: string }>;

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

export function SellerSalesScreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const revenueCurrency = profile?.currency ?? "EUR";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [buyers, setBuyers] = useState<BuyerMap>({});
  const [detail, setDetail] = useState<OrderRow | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    const load = async () => {
      const rows = await fetchSellerOrders(user.id);
      if (!alive) return;
      setOrders(rows);
      const ids = Array.from(new Set(rows.map((r) => r.buyer_id)));
      const profs = await fetchProfilesByIds(ids);
      if (alive) setBuyers(profs);
    };
    void load();
    const unsub = subscribeOrders({ sellerId: user.id }, () => { void load(); });
    return () => { alive = false; unsub(); };
  }, [open, user]);

  const revenue = orders
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + Number(o.amount), 0);

  return (
    <PushScreen open={open} onClose={onClose} title={t("sales.title")} zIndex={65}>
      <div className="px-4 py-4">
        {/* Revenue tile */}
        <div
          className="mb-4 rounded-2xl p-5 text-center text-white"
          style={{
            background: "linear-gradient(135deg, oklch(0.72 0.15 90), oklch(0.62 0.16 70))",
          }}
        >
          <div className="text-[12px] font-semibold uppercase tracking-wide opacity-80">
            {t("sales.revenue")}
          </div>
          <div className="mt-1 text-[32px] font-bold tabular-nums leading-none">
            {formatMoney(revenue, revenueCurrency)}
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">
            {t("sales.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o, i) => {
              const meta = statusMeta(o.status);
              const buyer = buyers[o.buyer_id];
              const label = buyer
                ? `@${buyer.handle}`
                : t("sales.buyer");
              return (
                <motion.li
                  key={o.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    ease: EASE_IOS,
                    delay: Math.min(i, 8) * 0.03,
                  }}
                >
                  <Press
                    onClick={() => setDetail(o)}
                    className="!block w-full rounded-2xl border border-border p-0 text-left"
                  >
                    <div className="flex items-center gap-3 p-3">
                      {o.item_image ? (
                        <img
                          src={o.item_image}
                          alt=""
                          className="h-14 w-14 rounded-xl object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-[14px] font-semibold">{o.item_name}</p>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ backgroundColor: meta.bg, color: meta.color }}
                          >
                            {t(meta.labelKey)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-[13px] font-bold">{formatMoney(Number(o.amount), o.currency)}</p>
                      </div>
                    </div>
                  </Press>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      <PushScreen
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.item_name ?? ""}
        zIndex={70}
      >
        {detail && (
          <div className="space-y-4 px-4 py-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
              {detail.item_image ? (
                <img src={detail.item_image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-xl bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{detail.item_name}</p>
                <p className="mt-1 text-[13px] font-bold">
                  {formatMoney(Number(detail.amount), detail.currency)}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <p className="mb-3 text-[13px] font-semibold">{t("timeline.title")}</p>
              <OrderTimeline orderId={detail.id} />
            </div>
          </div>
        )}
      </PushScreen>

              );
            })}
          </ul>
        )}
      </div>
    </PushScreen>
  );
}
