// Compact bottom sheet showing the gift catalog with prices in the live's
// currency. Tap a gift → sends immediately (tier 3 asks a quick confirm).
// Wallet balance + top-up shortcut at the top. If wallet currency doesn't
// match the live, the tray disables sending and shows the top-up hint.
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Press } from "@/components/press";
import { GIFT_CATALOG, giftByKey, type GiftKey } from "@/lib/gifts";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useWallet } from "@/lib/wallet-context";
import { haptic } from "@/lib/haptics";
import { EASE_IOS } from "@/lib/motion";

export function GiftTraySheet({
  open,
  onClose,
  liveCurrency,
  locale,
  sending,
  onSend,
  onTopUp,
}: {
  open: boolean;
  onClose: () => void;
  liveCurrency: string;
  locale: string;
  sending: boolean;
  onSend: (key: GiftKey) => void | Promise<void>;
  onTopUp: () => void;
}) {
  const { t } = useTranslation();
  const { balance, currency: walletCurrency } = useWallet();
  const cur = normalizeCurrency(liveCurrency);
  const walletMatches = normalizeCurrency(walletCurrency) === cur;
  const [confirmKey, setConfirmKey] = useState<GiftKey | null>(null);

  const fmt = (n: number) => formatMoney(n, cur, locale);

  const trigger = (key: GiftKey) => {
    const g = giftByKey(key);
    if (!g) return;
    if (g.tier === 3 && confirmKey !== key) {
      haptic.light();
      setConfirmKey(key);
      // Auto-clear the confirm state after 2s.
      window.setTimeout(() => {
        setConfirmKey((cur) => (cur === key ? null : cur));
      }, 2000);
      return;
    }
    setConfirmKey(null);
    void onSend(key);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={55}>
      <div className="flex h-full flex-col px-4 pb-4">
        <div className="flex items-center justify-between pb-2">
          <div>
            <h2 className="text-[17px] font-bold">{t("gifts.title", "Envoyer un cadeau")}</h2>
            <p className="text-[12px] text-muted-foreground">
              {t("gifts.subtitle", "Le vendeur reçoit 70% du montant")}
            </p>
          </div>
          <Press aria-label={t("common.close", "Fermer")} onClick={onClose} className="h-9 w-9 rounded-full bg-muted">
            <X size={16} />
          </Press>
        </div>

        <div
          className="mb-3 flex items-center justify-between rounded-2xl px-3 py-2.5"
          style={{
            background: "linear-gradient(135deg, oklch(0.75 0.14 85 / 0.15), oklch(0.65 0.16 60 / 0.12))",
            border: "1px solid oklch(0.75 0.14 85 / 0.35)",
          }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("gifts.walletBalance", "Solde")}
            </p>
            <p className="text-[16px] font-bold tabular-nums">
              {formatMoney(balance, walletCurrency, locale)}
            </p>
            {!walletMatches && (
              <p className="mt-0.5 text-[11px] font-medium text-destructive">
                {t("gifts.currencyHint", { defaultValue: "Portefeuille en {{cur}}", cur: walletCurrency })}
              </p>
            )}
          </div>
          <Press
            onClick={() => {
              haptic.light();
              onTopUp();
            }}
            className="!min-h-9 flex h-9 items-center gap-1 rounded-full bg-foreground px-3 text-[13px] font-bold text-background"
          >
            <Plus size={14} />
            {t("wallet.topupCta", "Recharger")}
          </Press>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto pb-2">
          {GIFT_CATALOG.map((g) => {
            const price = g.prices[cur] ?? 0;
            const canAfford = walletMatches && balance >= price && !sending;
            const isConfirm = confirmKey === g.key;
            return (
              <Press
                key={g.key}
                onClick={() => (walletMatches && !sending ? trigger(g.key) : (!walletMatches ? onTopUp() : undefined))}
                disabled={sending}
                className="!min-h-24 relative flex flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center"
                style={{
                  backgroundColor: isConfirm ? "oklch(0.75 0.14 85 / 0.25)" : "var(--muted)",
                  border: isConfirm
                    ? "2px solid oklch(0.75 0.16 85)"
                    : "1px solid transparent",
                  opacity: canAfford ? 1 : 0.55,
                }}
              >
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={isConfirm ? "confirm" : "idle"}
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-[34px] leading-none"
                  >
                    {g.emoji}
                  </motion.span>
                </AnimatePresence>
                <span className="text-[11px] font-semibold leading-tight">
                  {t(g.nameKey)}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: "oklch(0.65 0.16 60)" }}
                >
                  {fmt(price)}
                </span>
                {isConfirm && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, ease: EASE_IOS }}
                    className="absolute inset-x-1 bottom-1 rounded-full py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: "oklch(0.62 0.2 30)" }}
                  >
                    {t("gifts.confirmTap", "Retoucher pour envoyer")}
                  </motion.span>
                )}
              </Press>
            );
          })}
        </div>

        {!walletMatches && (
          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            {t("gifts.matchLive", { defaultValue: "Recharge en {{cur}} pour envoyer un cadeau", cur })}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

// Local convenience for a fallback toast handler.
export function useGiftError() {
  const { t } = useTranslation();
  return (err: string) => {
    const map: Record<string, string> = {
      insufficient_funds: t("gifts.err.insufficient", "Solde insuffisant — recharge ton portefeuille"),
      currency_mismatch: t("gifts.err.currency", "Portefeuille dans une autre devise"),
      cannot_gift_self: t("gifts.err.self", "Tu ne peux pas t'envoyer un cadeau"),
      live_not_active: t("gifts.err.notLive", "Le live n'est plus actif"),
      sanctioned: t("gifts.err.sanctioned", "Compte suspendu"),
      unauthorized: t("gifts.err.auth", "Connecte-toi pour envoyer un cadeau"),
      unknown_gift: t("gifts.err.unknown", "Cadeau inconnu"),
      unknown: t("gifts.err.unknown", "Envoi impossible"),
    };
    toast.error(map[err] ?? map.unknown);
  };
}
