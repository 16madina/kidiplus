import { useEffect, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Share2, Home, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { useBroadcast } from "@/lib/broadcast-context";
import { fmtDuration } from "@/lib/broadcast-mock";
import { formatMoney } from "@/lib/money";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import { fetchOrdersForLive, type OrderRow } from "@/lib/orders-db";
import { fetchLiveGiftsTotal } from "@/lib/live-gifts-db";
import { Logo } from "@/components/brand/logo";
import { LiveReplayPlayer } from "@/components/live-viewer/live-replay-player";
import {
  fetchLiveReplayMeta,
  isReplayPlayable,
  type LiveReplayMeta,
} from "@/lib/live-replay-client";

export function BroadcastSummary({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { session, reset, liveId, currency } = useBroadcast();
  const fmt = (n: number, cur: string = currency) => formatMoney(n, cur, i18n.language);

  // Real paid orders for this live (if any). Falls back to the mock sales
  // recorded locally when the seller's live wasn't backed by a DB row.
  const [realOrders, setRealOrders] = useState<OrderRow[] | null>(null);
  const [giftsTotal, setGiftsTotal] = useState<{ count: number; sellerNet: number } | null>(null);
  const [replayMeta, setReplayMeta] = useState<LiveReplayMeta | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);

  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    void fetchOrdersForLive(liveId).then((rows) => {
      if (alive) setRealOrders(rows.filter((r) => r.status === "paid"));
    });
    void fetchLiveGiftsTotal(liveId).then((g) => {
      if (alive) setGiftsTotal({ count: g.count, sellerNet: g.sellerNet });
    });
    return () => { alive = false; };
  }, [liveId]);

  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    const poll = async () => {
      const meta = await fetchLiveReplayMeta(liveId);
      if (alive) setReplayMeta(meta);
    };
    void poll();
    const iv = setInterval(() => {
      void poll();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [liveId]);

  const usingReal = (realOrders?.length ?? 0) > 0;
  const revenue = usingReal
    ? (realOrders ?? []).reduce((s, o) => s + Number(o.amount), 0)
    : session.sales.reduce((s, x) => s + x.price, 0);
  const salesCount = usingReal ? realOrders!.length : session.sales.length;

  const replayReady = isReplayPlayable(replayMeta);
  const replayPending =
    replayMeta?.replay_status === "recording" ||
    replayMeta?.replay_status === "processing";
  const showReplayButton = !!liveId && (replayReady || replayPending);

  return (
    <motion.div
      key="summary"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative h-full w-full overflow-y-auto bg-background pt-safe"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-5 px-5 pt-8 pb-6">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.05 }}
          className="mx-auto flex items-center justify-center"
        >
          <Logo size={72} variant="image" />
        </motion.div>
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight">{t("broadcast.summary.title")} 🎉</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {session.title || "—"} · {session.category}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t("broadcast.summary.duration")} value={fmtDuration(session.durationSec)} />
          <StatTile label={t("broadcast.summary.peakViewers")} value={String(session.peakViewers)} />
          <StatTile label={t("broadcast.summary.sales")} value={String(salesCount)} />
        </div>

        <div
          className="rounded-2xl p-5 text-center text-white"
          style={{
            background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
          }}
        >
          <div className="text-[12px] font-semibold uppercase tracking-wide opacity-80">
            {t("broadcast.summary.revenue")}
          </div>
          <RevenueCounter value={revenue} currency={currency} locale={i18n.language} />
        </div>

        {giftsTotal && giftsTotal.count > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[24px] leading-none">🎁</span>
              <div>
                <p className="text-[13px] font-bold">{t("gifts.summaryTitle", "Cadeaux reçus")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("gifts.summaryCount", { defaultValue: "{{count}} cadeaux", count: giftsTotal.count })}
                </p>
              </div>
            </div>
            <span
              className="text-[16px] font-bold tabular-nums"
              style={{ color: "oklch(0.65 0.16 60)" }}
            >
              +{fmt(giftsTotal.sellerNet)}
            </span>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-[15px] font-bold">{t("broadcast.summary.sales")}</h2>
          {salesCount === 0 ? (
            <div className="rounded-2xl bg-muted p-4 text-center text-[13px] text-muted-foreground">
              {t("home.empty")}
            </div>
          ) : usingReal ? (
            <motion.ul
              variants={listContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-1.5"
            >
              {realOrders!.map((o) => (
                <motion.li
                  key={o.id}
                  variants={listItem}
                  className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{o.item_name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {o.kind === "auction" ? t("pay.kind.auction") : t("pay.kind.fixed")}
                    </p>
                  </div>
                  <span className="text-[15px] font-bold tabular-nums">
                    {fmt(Number(o.amount), o.currency)}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <motion.ul
              variants={listContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-1.5"
            >
              {session.sales.map((s) => (
                <motion.li
                  key={s.id}
                  variants={listItem}
                  className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{s.productName}</p>
                    <p className="text-[12px] text-muted-foreground">@{s.buyer}</p>
                  </div>
                  <span className="text-[15px] font-bold tabular-nums">{fmt(s.price)}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {showReplayButton && (
            <Press
              disabled={!replayReady}
              onClick={() => {
                if (!replayReady || !replayMeta?.replay_url) return;
                haptic.light();
                setReplayOpen(true);
              }}
              className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-semibold text-white disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, oklch(0.55 0.18 25), oklch(0.48 0.16 20))",
              }}
            >
              <Play size={16} className="mr-2 fill-current" />
              {replayReady
                ? t("broadcast.replay.watch", "Revoir le live")
                : t("broadcast.replay.preparing", "Replay bientôt disponible…")}
            </Press>
          )}
          <Press
            onClick={() => {
              haptic.light();
              toast.success(t("common.copied"));
            }}
            className="!min-h-12 h-12 w-full rounded-2xl bg-foreground text-[15px] font-semibold text-background"
          >
            <Share2 size={16} className="mr-2" />
            {t("common.share")}
          </Press>
          <Press
            onClick={() => { reset(); onDone(); }}
            className="!min-h-12 h-12 w-full rounded-2xl bg-muted text-[15px] font-semibold"
          >
            <Home size={16} className="mr-2" />
            {t("broadcast.summary.close")}
          </Press>
        </div>
      </div>

      {replayOpen && replayMeta?.replay_url && (
        <LiveReplayPlayer
          url={replayMeta.replay_url}
          title={session.title}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </motion.div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-muted px-2 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-[18px] font-bold tabular-nums">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function RevenueCounter({ value, currency = "EUR", locale = "fr" }: { value: number; currency?: string; locale?: string }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const ctrl = animate(mv, value, {
      duration: 0.9,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [value, mv]);
  return (
    <div className="mt-1 text-[36px] font-bold tabular-nums leading-none">
      {formatMoney(display, currency, locale)}
    </div>
  );
}
