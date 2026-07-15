// SellerEarningsScreen — "Mes gains" hub (MONEY ONLY).
//
// - Gold gradient available-balance card (realtime).
// - "Retirer mes gains" opens WithdrawSheet.
// - Tabs: Ventes (per-order earnings breakdown: price → commission → net)
//         and Retraits (payout history).
// - Fulfillment/logistics live in "Mes commandes" — a small hint links there.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Wallet as WalletIcon, ArrowDownToLine, Clock, PackageCheck } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import {
  fetchMyBalance,
  fetchMyPayouts,
  subscribeMyEarnings,
  type SellerBalance,
  type PayoutRow,
  type PayoutStatus,
} from "@/lib/earnings-db";
import {
  fetchSellerOrders,
  fetchProfilesByIds,
  subscribeOrders,
  type OrderRow,
} from "@/lib/orders-db";
import { WithdrawSheet } from "./withdraw-sheet";
import { OrderItemImage } from "@/components/orders/order-item-image";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees";
import { expireOverdueOrders } from "@/lib/lives-db";
import { releaseOverdueEscrow } from "@/lib/escrow-db";

type BuyerMap = Record<string, { display_name: string; handle: string }>;

function payoutStatusMeta(s: PayoutStatus): { bg: string; color: string; key: string } {
  switch (s) {
    case "paid":
      return { bg: "oklch(0.94 0.06 155)", color: "oklch(0.4 0.12 155)", key: "payout.status.paid" };
    case "rejected":
      return { bg: "oklch(0.94 0.06 27)", color: "oklch(0.45 0.18 27)", key: "payout.status.rejected" };
    case "processing":
      return { bg: "oklch(0.94 0.05 250)", color: "oklch(0.42 0.14 250)", key: "payout.status.processing" };
    default:
      return { bg: "oklch(0.94 0.05 80)", color: "oklch(0.42 0.14 70)", key: "payout.status.requested" };
  }
}

export function SellerEarningsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "EUR";
  const [tab, setTab] = useState<"sales" | "payouts">("sales");
  const [balance, setBalance] = useState<SellerBalance | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [buyers, setBuyers] = useState<BuyerMap>({});
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    const load = async () => {
      await Promise.all([
        expireOverdueOrders().catch(() => 0),
        releaseOverdueEscrow().catch(() => null),
      ]);
      const [b, os, ps] = await Promise.all([
        fetchMyBalance(user.id),
        fetchSellerOrders(user.id),
        fetchMyPayouts(user.id),
      ]);
      if (!alive) return;
      setBalance(b);
      setOrders(os);
      setPayouts(ps);
      const ids = Array.from(new Set(os.map((o) => o.buyer_id)));
      const profs = await fetchProfilesByIds(ids);
      if (alive) setBuyers(profs);
    };
    void load();
    const unsubE = subscribeMyEarnings(user.id, () => void load());
    const unsubO = subscribeOrders({ sellerId: user.id }, () => void load());
    return () => {
      alive = false;
      unsubE();
      unsubO();
    };
  }, [open, user]);

  const available = balance?.available ?? 0;
  const pending = balance?.pending ?? 0;
  const balanceCurrency = balance?.currency ?? currency;

  const fmt = (n: number, cur?: string) => formatMoney(n, cur ?? balanceCurrency, i18n.language);

  return (
    <PushScreen open={open} onClose={onClose} title={t("gains.title")} zIndex={65}>
      <div className="px-4 py-4">
        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_IOS }}
          className="rounded-3xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg, oklch(0.72 0.15 90), oklch(0.62 0.16 70))",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide opacity-90">
            <WalletIcon size={14} />
            {t("gains.available")}
          </div>
          <p className="mt-1 text-[34px] font-bold leading-none tabular-nums">
            {fmt(available)}
          </p>
          <Press
            onClick={() => available > 0 && setWithdrawOpen(true)}
            className="mt-4 w-full rounded-2xl py-3 text-[15px] font-bold"
            style={{
              backgroundColor: available > 0 ? "#10162B" : "rgba(16,22,43,0.4)",
              color: "white",
            }}
          >
            <span className="flex items-center justify-center gap-1.5">
              <ArrowDownToLine size={16} />
              {t("gains.withdraw")}
            </span>
          </Press>
        </motion.div>

        {/* Pending / escrow card */}
        <div
          className="mt-2 flex items-center justify-between rounded-2xl border border-border p-3"
          style={{ backgroundColor: "oklch(0.98 0.02 80)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: "oklch(0.94 0.06 80)", color: "oklch(0.42 0.14 70)" }}>
              <Clock size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-muted-foreground truncate">{t("gains.pending")}</p>
              <p className="text-[16px] font-bold tabular-nums">{fmt(pending)}</p>
            </div>
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
          {t("gains.escrowExplainer")}
        </p>

        {/* Shipping hint → Mes commandes */}
        <div
          className="mt-3 flex items-start gap-2 rounded-2xl border border-border p-3"
          style={{ backgroundColor: "oklch(0.98 0.02 260)" }}
        >
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: "oklch(0.95 0.03 260)", color: "oklch(0.35 0.12 260)" }}
          >
            <PackageCheck size={15} />
          </div>
          <p className="text-[12px] leading-snug text-muted-foreground">
            {t("gains.shippingHint", {
              defaultValue: "Gère tes expéditions dans « Mes commandes ».",
            })}
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 rounded-full border border-border p-1">
          <TabBtn active={tab === "sales"} onClick={() => setTab("sales")}>
            {t("gains.tabs.sales")}
          </TabBtn>
          <TabBtn active={tab === "payouts"} onClick={() => setTab("payouts")}>
            {t("gains.tabs.payouts")}
          </TabBtn>
        </div>

        <div className="mt-3">
          {tab === "sales" ? (
            <SalesEarningsList orders={orders} buyers={buyers} fmt={fmt} />
          ) : (
            <PayoutsList payouts={payouts} fmt={fmt} tr={t} />
          )}
        </div>
      </div>

      <WithdrawSheet
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        available={available}
        currency={balanceCurrency}
      />
    </PushScreen>
  );
}

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

function SalesEarningsList({
  orders,
  buyers,
  fmt,
}: {
  orders: OrderRow[];
  buyers: BuyerMap;
  fmt: (n: number, cur?: string) => string;
}) {
  const { t } = useTranslation();
  const paid = orders.filter((o) => o.status === "paid");
  if (paid.length === 0) {
    return <p className="py-12 text-center text-[13px] text-muted-foreground">{t("sales.empty")}</p>;
  }
  return (
    <ul className="space-y-2">
      {paid.map((o) => {
        const buyer = buyers[o.buyer_id];
        const released =
          o.fulfillment_status === "delivered" ||
          o.refund_status === "refunded_wallet" ||
          o.refund_status === "refunded_card";
        return (
          <li key={o.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-3">
              <OrderItemImage src={o.item_image} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-[14px] font-semibold">{o.item_name}</p>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={
                      released
                        ? { backgroundColor: "oklch(0.94 0.06 155)", color: "oklch(0.4 0.12 155)" }
                        : { backgroundColor: "oklch(0.94 0.05 80)", color: "oklch(0.42 0.14 70)" }
                    }
                  >
                    {released
                      ? t("gains.moneyState.released", { defaultValue: "Libéré" })
                      : t("gains.moneyState.pending", { defaultValue: "En attente" })}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {buyer ? `@${buyer.handle}` : t("sales.buyer")}
                </p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px]">
              <BreakdownCell label={t("gains.price")} value={fmt(Number(o.amount), o.currency)} />
              <BreakdownCell
                label={`KiDi+ −${PLATFORM_FEE_PERCENT}%`}
                value={`−${fmt(Number(o.platform_fee), o.currency)}`}
                muted
              />
              <BreakdownCell
                label={t("gains.net")}
                value={fmt(Number(o.seller_net || 0), o.currency)}
                strong
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BreakdownCell({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className="rounded-lg py-1.5"
      style={{ backgroundColor: strong ? "oklch(0.96 0.04 80)" : "var(--muted)" }}
    >
      <div className="text-muted-foreground">{label}</div>
      <div
        className="mt-0.5 font-bold tabular-nums"
        style={{ color: muted ? "var(--muted-foreground)" : "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}

function PayoutsList({
  payouts,
  fmt,
  tr,
}: {
  payouts: PayoutRow[];
  fmt: (n: number, cur?: string) => string;
  tr: (k: string) => string;
}) {
  const { i18n } = useTranslation();
  if (payouts.length === 0) {
    return (
      <p className="py-12 text-center text-[13px] text-muted-foreground">
        {tr("payout.emptyHistory")}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {payouts.map((p) => {
        const meta = payoutStatusMeta(p.status);
        const when = new Date(p.requested_at).toLocaleDateString(i18n.language);
        return (
          <li key={p.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold tabular-nums">
                  {fmt(Number(p.amount), p.currency)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {tr(`payout.method.${p.method}`)} · {when}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: meta.bg, color: meta.color }}
              >
                {tr(meta.key)}
              </span>
            </div>
            {p.status === "rejected" && p.admin_note && (
              <p className="mt-2 rounded-xl bg-muted p-2 text-[12px] leading-relaxed">
                <span className="font-semibold">{tr("payout.rejectionReason")}: </span>
                {p.admin_note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
