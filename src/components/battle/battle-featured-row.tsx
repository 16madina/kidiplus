import { useEffect, useState } from "react";
import type { LiveProductRow } from "@/lib/lives-db";
import { LiveProductImage } from "@/components/live-viewer/live-product-image";
import { Press } from "@/components/press";
import { bidStepFor, formatMoney, normalizeCurrency } from "@/lib/money";
import { BATTLE_CARD_ROW_STYLE } from "@/components/battle/battle-split-chrome";
import { useTranslation } from "react-i18next";
import { haptic } from "@/lib/haptics";

export function pickBattleFeatured(products: LiveProductRow[]): LiveProductRow | null {
  const playable = products.filter(
    (p) => p.status !== "sold" && p.status !== "out" && p.status !== "unsold",
  );
  const active = playable.find((p) => p.status === "active");
  if (active) return active;
  const sorted = [...playable].sort((a, b) => a.position - b.position);
  return sorted[0] ?? null;
}

export function auctionSecondsLeft(product: LiveProductRow | null, now = Date.now()): number {
  if (!product || product.status !== "active" || !product.auction_deadline_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(product.auction_deadline_at) - now) / 1000));
}

function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function BattleFeaturedRow({
  left,
  right,
  currency,
  leftImage,
  rightImage,
  leftSecondsLeft = 0,
  rightSecondsLeft = 0,
  leftOwned = false,
  rightOwned = false,
  viewer = false,
  onOpenLeft,
  onOpenRight,
  onOwnerActionLeft,
  onOwnerActionRight,
  onBidLeft,
  onBidRight,
}: {
  left: LiveProductRow | null;
  right: LiveProductRow | null;
  currency: string;
  leftImage?: string | null;
  rightImage?: string | null;
  leftSecondsLeft?: number;
  rightSecondsLeft?: number;
  leftOwned?: boolean;
  rightOwned?: boolean;
  viewer?: boolean;
  onOpenLeft: () => void;
  onOpenRight: () => void;
  onOwnerActionLeft?: () => void;
  onOwnerActionRight?: () => void;
  onBidLeft?: () => void;
  onBidRight?: () => void;
}) {
  return (
    <div
      className="absolute inset-x-1 z-[32] grid grid-cols-2 gap-1"
      style={BATTLE_CARD_ROW_STYLE}
    >
      <MiniCard
        product={left}
        image={leftImage ?? left?.image_url}
        currency={currency}
        secondsLeft={leftSecondsLeft}
        owned={leftOwned}
        viewer={viewer}
        onOpen={onOpenLeft}
        onOwnerAction={onOwnerActionLeft}
        onBid={onBidLeft}
      />
      <MiniCard
        product={right}
        image={rightImage ?? right?.image_url}
        currency={currency}
        secondsLeft={rightSecondsLeft}
        owned={rightOwned}
        viewer={viewer}
        onOpen={onOpenRight}
        onOwnerAction={onOwnerActionRight}
        onBid={onBidRight}
      />
    </div>
  );
}

function MiniCard({
  product,
  image,
  currency,
  secondsLeft,
  owned,
  viewer,
  onOpen,
  onOwnerAction,
  onBid,
}: {
  product: LiveProductRow | null;
  image?: string | null;
  currency: string;
  secondsLeft: number;
  owned: boolean;
  viewer: boolean;
  onOpen: () => void;
  onOwnerAction?: () => void;
  onBid?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cur = normalizeCurrency(currency);
  const locale = i18n.language;
  const auctionOn = !!product && product.status === "active" && product.mode === "auction";
  const [clock, setClock] = useState(secondsLeft);

  useEffect(() => {
    if (!auctionOn) {
      setClock(0);
      return;
    }
    const tick = () => {
      const fromDeadline = auctionSecondsLeft(product);
      setClock(fromDeadline > 0 ? fromDeadline : secondsLeft);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [auctionOn, product, secondsLeft]);

  if (!product) {
    return (
      <Press
        onClick={() => {
          haptic.selection();
          onOpen();
        }}
        className="flex h-[76px] min-w-0 items-center rounded-[14px] px-2.5 text-left"
        style={{
          backgroundColor: "rgba(12,16,28,0.82)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <p className="truncate text-[11px] font-semibold text-white/80">
          {owned ? t("battle.card.select") : t("battle.card.next")}
        </p>
      </Press>
    );
  }

  const step = bidStepFor(Number(product.price), cur);
  const action = (() => {
    if (owned && onOwnerAction && !auctionOn) {
      return {
        label: product.mode === "auction" ? t("battle.card.start") : t("live.listForSale"),
        run: onOwnerAction,
      };
    }
    if (viewer && auctionOn && onBid) {
      return {
        label: t("battle.card.bid", { amount: formatMoney(step, cur, locale) }),
        run: onBid,
      };
    }
    return null;
  })();

  return (
    <div
      className="flex h-[76px] min-w-0 items-center gap-1 rounded-[14px] p-1.5"
      style={{
        backgroundColor: "rgba(12,16,28,0.88)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          haptic.selection();
          onOpen();
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <LiveProductImage
          src={image}
          className="h-[62px] w-[62px] shrink-0 rounded-[10px] object-cover"
          iconClassName="text-white/50"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-bold leading-tight text-white">
            {product.name}
          </span>
          {auctionOn ? (
            <span className="mt-0.5 block truncate text-[10px] font-semibold tabular-nums text-[#f6d365]">
              {t("live.currentBid")} {formatMoney(Number(product.price), cur, locale)}
              {clock > 0 ? ` · ${formatClock(clock)}` : ""}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-[10px] font-semibold tabular-nums text-white/75">
              {formatMoney(
                Number(product.mode === "auction" ? product.start_price : product.price),
                cur,
                locale,
              )}
            </span>
          )}
        </span>
      </button>
      {action ? (
        <Press
          onClick={() => {
            haptic.medium();
            action.run();
          }}
          className="!min-h-8 !min-w-0 h-8 max-w-[46%] shrink-0 truncate rounded-full px-2 text-[10px] font-bold"
          style={{ backgroundColor: "oklch(0.85 0.18 90)", color: "#10162B" }}
        >
          {action.label}
        </Press>
      ) : null}
    </div>
  );
}
