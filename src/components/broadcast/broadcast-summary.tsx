import { useEffect, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Share2, Home, PartyPopper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { useBroadcast } from "@/lib/broadcast-context";
import { formatEuro, fmtDuration } from "@/lib/broadcast-mock";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

export function BroadcastSummary({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { session, reset } = useBroadcast();
  const revenue = session.sales.reduce((s, x) => s + x.price, 0);

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
          className="mx-auto grid h-16 w-16 place-items-center rounded-full"
          style={{
            background: "linear-gradient(135deg, oklch(0.72 0.2 145), oklch(0.62 0.2 155))",
          }}
        >
          <PartyPopper size={30} color="white" />
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
          <StatTile label={t("broadcast.summary.sales")} value={String(session.sales.length)} />
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
          <RevenueCounter value={revenue} />
        </div>

        <div>
          <h2 className="mb-2 text-[15px] font-bold">{t("broadcast.summary.sales")}</h2>
          {session.sales.length === 0 ? (
            <div className="rounded-2xl bg-muted p-4 text-center text-[13px] text-muted-foreground">
              {t("home.empty")}
            </div>
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
                  <span className="text-[15px] font-bold tabular-nums">{formatEuro(s.price)}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Press
            onClick={() => {
              haptic.light();
              toast.success("Récap copié dans le presse-papier");
            }}
            className="!min-h-12 h-12 w-full rounded-2xl bg-foreground text-[15px] font-semibold text-background"
          >
            <Share2 size={16} className="mr-2" />
            Partager le récap
          </Press>
          <Press
            onClick={() => { reset(); onDone(); }}
            className="!min-h-12 h-12 w-full rounded-2xl bg-muted text-[15px] font-semibold"
          >
            <Home size={16} className="mr-2" />
            Retour à l'accueil
          </Press>
        </div>
      </div>
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

function RevenueCounter({ value }: { value: number }) {
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
      {formatEuro(display)}
    </div>
  );
}
