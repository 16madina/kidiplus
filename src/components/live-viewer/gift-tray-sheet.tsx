// Compact bottom sheet showing the gift catalog with prices in the LIVE's
// currency + a "≈ …" hint in the sender's wallet currency when they differ.
// Currency never blocks — the sender's wallet is debited in THEIR currency
// via server-side conversion (send_gift RPC).
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Press } from "@/components/press";
import { GIFT_CATALOG, giftByKey, type GiftKey } from "@/lib/gifts";
import {
  convertMoney,
  formatMoney,
  formatConvertedHint,
  normalizeCurrency,
} from "@/lib/money";
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
  const wcur = normalizeCurrency(walletCurrency);
  const crossCurrency = cur !== wcur;
  const [confirmKey, setConfirmKey] = useState<GiftKey | null>(null);

  const fmtLive = (n: number) => formatMoney(n, cur, locale);

  const trigger = (key: GiftKey) => {
    const g = giftByKey(key);
    if (!g) return;
    if (g.tier === 3 && confirmKey !== key) {
      haptic.light();
      setConfirmKey(key);
      window.setTimeout(() => {
        setConfirmKey((c) => (c === key ? null : c));
      }, 2000);
      return;
    }
    setConfirmKey(null);
    void onSend(key);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={58}>
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
              {formatMoney(balance, wcur, locale)}
            </p>
            {crossCurrency && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("gifts.fxHint", {
                  defaultValue: "Débité en {{wcur}} (conversion auto)",
                  wcur,
                })}
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
            const priceLive = g.prices[cur] ?? 0;
            const debit = crossCurrency ? convertMoney(priceLive, cur, wcur) : priceLive;
            const canAfford = balance >= debit && !sending;
            const isConfirm = confirmKey === g.key;
            return (
              <Press
                key={g.key}
                onClick={() => {
                  if (sending) return;
                  if (!canAfford) {
                    onTopUp();
                    return;
                  }
                  trigger(g.key);
                }}
                disabled={sending}
                className="!min-h-24 relative flex flex-col items-center justify-center gap-0.5 rounded-2xl p-2 text-center"
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
                    className="grid h-10 place-items-center text-[32px] leading-none"
                  >
                    {g.imageSrc ? (
                      <img
                        src={g.imageSrc}
                        alt=""
                        className="h-9 w-auto max-w-[72px] object-contain"
                      />
                    ) : (
                      g.emoji
                    )}
                  </motion.span>
                </AnimatePresence>
                <span className="text-[11px] font-semibold leading-tight">
                  {t(g.nameKey)}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums leading-tight"
                  style={{ color: "oklch(0.65 0.16 60)" }}
                >
                  {fmtLive(priceLive)}
                </span>
                {crossCurrency && (
                  <span className="text-[10px] tabular-nums leading-tight text-muted-foreground">
                    {formatConvertedHint(priceLive, cur, wcur, locale)}
                  </span>
                )}
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
      cannot_gift_self: t("gifts.err.self", "Tu ne peux pas t'envoyer un cadeau"),
      live_not_active: t("gifts.err.notLive", "Le live n'est plus actif"),
      sanctioned: t("gifts.err.sanctioned", "Compte suspendu"),
      unauthorized: t("gifts.err.auth", "Connecte-toi pour envoyer un cadeau"),
      unknown_gift: t("gifts.err.unknown", "Cadeau inconnu"),
      conversion_unavailable: t("gifts.err.conversion", "Conversion indisponible pour cette devise"),
      daily_limit: t("risk.errors.dailyLimit", "Limite journalière atteinte. Réessaie demain."),
      seller_gift_limit: t(
        "risk.errors.sellerGiftLimit",
        "Ce vendeur a atteint sa limite de cadeaux du jour.",
      ),
      risk_restricted: t(
        "risk.errors.restricted",
        "Paiements temporairement bloqués. Contacte le support.",
      ),
      unknown: t("gifts.err.unknown", "Envoi impossible"),
    };
    toast.error(map[err] ?? map.unknown);
  };
}
