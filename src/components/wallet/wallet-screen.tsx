// WalletScreen — full-screen "Mon portefeuille" view opened from Profile menu.
// Shows animated balance, a Recharger CTA, and the transaction history feed.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet as WalletIcon,
  Plus,
  Receipt,
} from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useWallet } from "@/lib/wallet-context";
import { formatMoney } from "@/lib/money";
import { TopUpSheet } from "./topup-sheet";
import type { WalletTxRow } from "@/lib/wallet-db";
import { confirmWalletTopup, readPendingTopup, clearPendingTopup } from "@/lib/payment-confirm";
import { clearPendingPaypalOrder } from "@/lib/paypal-topup-client";

export function WalletScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { balance, currency, transactions, refresh } = useWallet();
  const [topupOpen, setTopupOpen] = useState(false);

  // Recovery: Stripe pending confirm + PayPal deep-link result.
  useEffect(() => {
    if (!open) return;

    try {
      const raw = sessionStorage.getItem("kidi:paypal_done");
      if (raw) {
        sessionStorage.removeItem("kidi:paypal_done");
        clearPendingPaypalOrder();
        const done = JSON.parse(raw) as {
          status?: string;
          amount?: string | null;
          currency?: string | null;
          duplicate?: boolean;
        };
        void refresh();
        if (done.status === "ok") {
          if (!done.duplicate) toast.success(t("wallet.topup.success"));
        } else if (done.status === "cancelled") {
          toast.message(
            t("wallet.topup.paypalCancelled", { defaultValue: "Paiement annulé — aucun montant prélevé." }),
          );
        } else if (done.status === "pending") {
          toast.message(
            t("wallet.topup.paypalPendingHint", {
              defaultValue: "Paiement en cours de confirmation — ton solde se mettra à jour sous peu.",
            }),
          );
        }
        setTopupOpen(false);
      }
    } catch {
      /* ignore */
    }

    const pending = readPendingTopup();
    if (!pending) return;
    void (async () => {
      const r = await confirmWalletTopup(pending);
      if (r.ok) {
        clearPendingTopup();
        await refresh();
        if (!r.duplicate) toast.success(t("wallet.topup.success"));
      }
    })();
  }, [open, refresh, t]);


  return (
    <PushScreen open={open} onClose={onClose} title={t("wallet.title")} zIndex={65}>
      <div className="flex flex-col gap-4 px-4 py-5">
        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-3xl p-5"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.19 0.06 265) 0%, oklch(0.27 0.07 265) 100%)",
            color: "white",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide opacity-80">
            <WalletIcon size={14} color="#c8a24a" />
            {t("wallet.currentBalance")}
          </div>
          <p className="mt-1 text-[36px] font-bold tabular-nums">
            {formatMoney(balance, currency)}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-white/80">
            {t("wallet.explainer")}
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("kidi:open-section", { detail: "earnings" }));
              }, 250);
            }}
            className="mt-1 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: "#c8a24a" }}
          >
            {t("wallet.toEarningsLink")}
          </button>
          <Press
            onClick={() => setTopupOpen(true)}
            className="mt-4 w-full rounded-2xl py-3 text-[15px] font-bold"
            style={{ backgroundColor: "#c8a24a", color: "#10162B" }}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Plus size={16} />
              {t("wallet.topupCta")}
            </span>
          </Press>
        </motion.div>

        {/* History */}
        <div>
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("wallet.history")}
          </h2>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center">
              <Receipt size={22} className="text-muted-foreground" />
              <p className="text-sm font-semibold">{t("wallet.emptyTitle")}</p>
              <p className="max-w-[240px] text-xs text-muted-foreground">
                {t("wallet.emptyBody")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {transactions.map((tx, i) => (
                <div key={tx.id}>
                  <TxRow tx={tx} currency={currency} locale={i18n.language} />
                  {i < transactions.length - 1 && (
                    <div className="ml-14 h-px bg-border" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />
    </PushScreen>
  );
}

function TxRow({
  tx,
  currency,
  locale,
}: {
  tx: WalletTxRow;
  currency: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const positive = tx.amount >= 0;
  const tint = positive ? "oklch(0.72 0.2 155)" : "oklch(0.6 0.24 27)";
  const label =
    tx.type === "topup"
      ? t("wallet.tx.topup")
      : tx.type === "purchase"
        ? t("wallet.tx.purchase")
        : tx.type === "refund"
          ? t("wallet.tx.refund")
          : t("wallet.tx.adjustment");
  const date = new Date(tx.created_at).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
        style={{ backgroundColor: tint }}
      >
        {positive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{date}</p>
      </div>
      <div className="text-right">
        <p
          className="text-[15px] font-bold tabular-nums"
          style={{ color: tint }}
        >
          {positive ? "+" : "−"}
          {formatMoney(Math.abs(Number(tx.amount)), currency)}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMoney(Number(tx.balance_after), currency)}
        </p>
      </div>
    </div>
  );
}
