import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import { Gavel, Timer, ChevronUp, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { type Product } from "@/lib/live-viewer-mock";
import { LiveProductImage } from "./live-product-image";
import {
  approxLabel,
  formatMoney,
  nextBidAmount,
  normalizeCurrency,
  type Currency,
} from "@/lib/money";

/** Compact Whatnot-style product + bid bar — transparent, low height. */
export function AuctionCard({
  product,
  secondsLeft,
  lastBidder,
  currency = "EUR",
  viewerCurrency,
  auctionActive = false,
  isHighestBidder = false,
  disabled = false,
  deliveryBlockedLabel,
  waitingLabel,
  onBid,
  onOpenProducts,
  onBuy,
  onToggleCustom,
  customPanel,
  customOpen = false,
}: {
  product: Product;
  secondsLeft: number;
  lastBidder?: string;
  currency?: string;
  viewerCurrency?: string;
  auctionActive?: boolean;
  isHighestBidder?: boolean;
  disabled?: boolean;
  deliveryBlockedLabel?: string;
  /** Optional one-line status above the bar (e.g. next item soon). */
  waitingLabel?: string;
  onBid: () => void;
  onOpenProducts: () => void;
  onBuy?: () => void;
  onToggleCustom?: () => void;
  customPanel?: ReactNode;
  customOpen?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [bidPulse, setBidPulse] = useState(0);
  useEffect(() => {
    setBidPulse((v) => v + 1);
  }, [product.price]);

  const cur: Currency = normalizeCurrency(currency);
  const locale = i18n.language;
  const isAuction = product.mode === "auction";
  const urgent = secondsLeft <= 10;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const nextBid = nextBidAmount(product.price, cur);
  const convHint = viewerCurrency ? approxLabel(product.price, cur, viewerCurrency, locale) : "";
  const deliveryBlocked = Boolean(deliveryBlockedLabel);
  const canBid =
    auctionActive && secondsLeft > 0 && !isHighestBidder && !disabled && !deliveryBlocked;

  const glass = {
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    backdropFilter: "blur(12px) saturate(140%)",
    WebkitBackdropFilter: "blur(12px) saturate(140%)",
    border: "1px solid rgba(255,255,255,0.14)",
  } as const;

  const ctaLabel = (() => {
    if (isHighestBidder) return t("live.youLead", "Tu mènes 🏆");
    if (canBid) return t("live.bidAt", { amount: formatMoney(nextBid, cur, locale) });
    if (deliveryBlocked) return deliveryBlockedLabel;
    if (disabled) return t("live.ended");
    if (auctionActive && secondsLeft <= 0) return t("live.auctionEnding", "Fin de l'enchère…");
    return t("live.waitingForSeller");
  })();

  return (
    <motion.div layout className="relative flex flex-col gap-1.5">
      {waitingLabel ? (
        <div
          className="rounded-full px-3 py-1.5 text-center text-[12px] font-semibold text-white/90"
          style={glass}
        >
          {waitingLabel}
        </div>
      ) : null}

      {/* Product row — thumbnail | info | timer */}
      <Press
        onClick={onOpenProducts}
        className="!flex w-full items-center gap-2.5 !rounded-2xl !px-2.5 !py-2 text-left"
        style={glass}
        aria-label="Voir tous les produits"
      >
        <LiveProductImage
          src={product.image}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="min-w-0 truncate text-[13px] font-semibold leading-tight text-white">
              {product.name}
            </p>
            <ChevronUp size={13} className="shrink-0 text-white/55" />
          </div>
          {product.metaLine ? (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-white/60">
              {product.metaLine}
            </p>
          ) : null}
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <motion.span
              key={bidPulse}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="text-[16px] font-bold tabular-nums leading-none text-white"
            >
              {formatMoney(product.price, cur, locale)}
            </motion.span>
            {convHint ? (
              <span className="truncate text-[11px] tabular-nums text-white/55">{convHint}</span>
            ) : null}
            <AnimatePresence>
              {isAuction && lastBidder ? (
                <motion.span
                  key={lastBidder + bidPulse}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="truncate text-[11px] text-white/65"
                >
                  @{lastBidder}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {isAuction ? (
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1.5 text-[13px] font-bold tabular-nums"
            style={{
              background: urgent
                ? "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.7 0.16 75))"
                : "rgba(255,255,255,0.14)",
              color: urgent ? "#10162B" : "white",
            }}
          >
            <motion.span
              animate={urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{
                duration: 0.55,
                repeat: urgent ? Infinity : 0,
                ease: "easeInOut",
              }}
              className="flex items-center gap-0.5"
            >
              <Timer size={12} />
              {mm}:{ss}
            </motion.span>
          </div>
        ) : null}
      </Press>

      {/* CTA row — Max/+ left, primary bid/buy right (Whatnot order) */}
      {isAuction ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-stretch gap-1.5">
            {onToggleCustom ? (
              <Press
                onClick={canBid ? onToggleCustom : undefined}
                disabled={!canBid}
                aria-label={t("bid.custom.open", "Enchère personnalisée")}
                className="h-11 w-[4.75rem] shrink-0 rounded-full text-[12px] font-bold text-white disabled:opacity-45"
                style={glass}
              >
                <motion.span
                  animate={{ rotate: customOpen ? 45 : 0 }}
                  transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                  className="inline-flex items-center gap-0.5"
                >
                  <Plus size={15} />
                  {t("bid.custom.short", "Max")}
                </motion.span>
              </Press>
            ) : null}
            <Press
              onClick={canBid || deliveryBlocked ? onBid : undefined}
              disabled={!canBid && !deliveryBlocked}
              className="h-11 min-w-0 flex-1 rounded-full px-3 text-[14px] font-bold text-white disabled:opacity-55"
              style={{
                background: canBid
                  ? "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))"
                  : "rgba(255,255,255,0.16)",
                color: canBid ? "#10162B" : "white",
                boxShadow: canBid ? "0 4px 16px oklch(0.78 0.14 85 / 0.35)" : "none",
              }}
            >
              {canBid ? (
                <span className="inline-flex items-center justify-center gap-1">
                  <Gavel size={14} />
                  {t("live.bidAt", { amount: formatMoney(nextBid, cur, locale) })}
                </span>
              ) : (
                <span className="truncate">{ctaLabel}</span>
              )}
            </Press>
          </div>
          {auctionActive && urgent && secondsLeft > 0 ? (
            <p
              className="text-center text-[10px] font-semibold leading-none"
              style={{ color: "oklch(0.86 0.12 85)" }}
            >
              {t("auction.suddenDeath.hint", "Toute enchère relance le chrono ⚡")}
            </p>
          ) : null}
          {customPanel}
        </div>
      ) : (
        <Press
          onClick={disabled || deliveryBlocked ? undefined : onBuy}
          disabled={disabled || deliveryBlocked}
          className="h-11 w-full rounded-full text-[14px] font-bold disabled:opacity-55"
          style={{
            background: deliveryBlocked
              ? "rgba(255,255,255,0.16)"
              : "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
            color: deliveryBlocked ? "white" : "#10162B",
          }}
        >
          {deliveryBlocked
            ? deliveryBlockedLabel
            : t("live.buyNowPrice", {
                amount: formatMoney(product.price, cur, locale),
                defaultValue: "Acheter {{amount}}",
              })}
        </Press>
      )}
    </motion.div>
  );
}
