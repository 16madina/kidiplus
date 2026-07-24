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
  /** When present, bid/buy is blocked because the seller doesn't deliver to
   *  the viewer's country. The label is shown on the CTA. */
  deliveryBlockedLabel?: string;
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

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl"
      style={{
        backgroundColor: "rgba(15, 15, 20, 0.72)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <Press
        onClick={onOpenProducts}
        className="!block w-full !p-2.5 text-left"
        aria-label="Voir tous les produits"
      >
        <div className="flex items-center gap-2.5">
          <LiveProductImage
            src={product.image}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 truncate text-[13px] font-semibold text-white">
                {product.name}
              </p>
              <ChevronUp size={14} className="shrink-0 text-white/60" />
            </div>
            {isAuction ? (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-white/60">
                  Enchère
                </span>
                <motion.span
                  key={bidPulse}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.18, 1] }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                  className="text-[15px] font-bold text-white"
                >
                  {formatMoney(product.price, cur, locale)}
                </motion.span>
                <AnimatePresence>
                  {lastBidder && (
                    <motion.span
                      key={lastBidder + bidPulse}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="truncate text-[11px] text-white/70"
                    >
                      @{lastBidder}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="mt-0.5 text-[15px] font-bold text-white">
                {formatMoney(product.price, cur, locale)}
              </div>
            )}
            {convHint && (
              <div className="mt-0.5 text-[10.5px] text-white/60 tabular-nums">
                {convHint}
              </div>
            )}
          </div>

          {isAuction && (
            <div
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold tabular-nums"
              style={{
                background: urgent
                  ? "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.7 0.16 75))"
                  : "rgba(255,255,255,0.12)",
                color: urgent ? "#10162B" : "white",
                boxShadow: urgent ? "0 0 18px oklch(0.78 0.14 85 / 0.55)" : "none",
              }}
            >
              <motion.span
                animate={urgent ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{
                  duration: 0.6,
                  repeat: urgent ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className="flex items-center gap-1"
              >
                <Timer size={12} />
                {mm}:{ss}
              </motion.span>
            </div>
          )}
        </div>
      </Press>

      <div className="px-2.5 pb-2.5">
        {isAuction ? (
          <>
            <div className="flex items-stretch gap-1.5">
              <Press
                onClick={canBid ? onBid : undefined}
                disabled={!canBid}
                className="flex-1 rounded-xl py-2 text-[13px] font-bold text-white disabled:opacity-50"
                style={{
                  background: canBid
                    ? "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.6 0.24 25))"
                    : "rgba(255,255,255,0.14)",
                }}
              >
                {isHighestBidder ? (
                  t("live.highestBidder")
                ) : canBid ? (
                  <>
                    <Gavel size={14} className="mr-1.5" />
                    {t("live.bidAt", { amount: formatMoney(nextBid, cur, locale) })}
                  </>
                ) : deliveryBlocked ? (
                  deliveryBlockedLabel
                ) : disabled ? (
                  t("live.ended")
                ) : auctionActive && secondsLeft <= 0 ? (
                  t("live.auctionEnding", "Fin de l'enchère…")
                ) : (
                  t("live.waitingForSeller")
                )}
              </Press>
              {onToggleCustom && (
                <Press
                  onClick={canBid ? onToggleCustom : undefined}
                  disabled={!canBid}
                  aria-label={t("bid.custom.open", "Enchère personnalisée")}
                  className="w-11 shrink-0 rounded-xl text-white disabled:opacity-50"
                  style={{
                    background: canBid
                      ? "rgba(255,255,255,0.14)"
                      : "rgba(255,255,255,0.08)",
                  }}
                >
                  <motion.span
                    animate={{ rotate: customOpen ? 45 : 0 }}
                    transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                    className="inline-flex"
                  >
                    <Plus size={18} />
                  </motion.span>
                </Press>
              )}
            </div>
            {auctionActive && urgent && secondsLeft > 0 && (
              <div
                className="mt-1.5 text-center text-[10.5px] font-semibold"
                style={{ color: "oklch(0.82 0.14 85)" }}
              >
                {t("auction.suddenDeath.hint", "Toute enchère relance le chrono ⚡")}
              </div>
            )}
            {customPanel}
          </>
        ) : (
          <Press
            onClick={disabled || deliveryBlocked ? undefined : onBuy}
            disabled={disabled || deliveryBlocked}
            className="w-full rounded-xl py-2 text-[13px] font-bold text-white disabled:opacity-60"
            style={{
              background: deliveryBlocked
                ? "rgba(255,255,255,0.14)"
                : "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.6 0.24 25))",
            }}
          >
            {deliveryBlocked
              ? deliveryBlockedLabel
              : `Acheter ${formatMoney(product.price, cur, locale)}`}
          </Press>
        )}
      </div>
    </motion.div>
  );
}
