import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Gavel, Timer, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { type Product } from "@/lib/live-viewer-mock";
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
  onBid,
  onOpenProducts,
  onBuy,
}: {
  product: Product;
  secondsLeft: number;
  lastBidder?: string;
  currency?: string;
  viewerCurrency?: string;
  auctionActive?: boolean;
  onBid: () => void;
  onOpenProducts: () => void;
  onBuy?: () => void;
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
          <img
            src={product.image}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
            onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
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
                backgroundColor: urgent
                  ? "oklch(0.6 0.24 25 / 0.95)"
                  : "rgba(255,255,255,0.12)",
                color: "white",
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

      <div className="px-3 pb-3">
        {isAuction ? (
          <Press
            onClick={auctionActive && secondsLeft > 0 ? onBid : undefined}
            disabled={!auctionActive || secondsLeft <= 0}
            className="w-full rounded-xl py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{
              background: auctionActive && secondsLeft > 0
                ? "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.6 0.24 25))"
                : "rgba(255,255,255,0.14)",
            }}
          >
            {auctionActive && secondsLeft > 0 ? (
              <>
                <Gavel size={16} className="mr-1.5" />
                Enchérir {formatMoney(nextBid, cur, locale)}
              </>
            ) : (
              t("live.waitingForSeller")
            )}
          </Press>
        ) : (
          <Press
            onClick={onBuy}
            className="w-full rounded-xl py-2.5 text-[14px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.6 0.24 25))",
            }}
          >
            Acheter {formatMoney(product.price, cur, locale)}
          </Press>
        )}
      </div>
    </motion.div>
  );
}
