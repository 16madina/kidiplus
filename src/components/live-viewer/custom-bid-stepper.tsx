// Inline custom-bid stepper — Whatnot-style compact panel over the auction card.
// Opens/closes in 150ms; +/− step by currency increment with press-and-hold to
// repeat; tap the amount for direct numeric entry; confirm places the bid.
import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  bidStepFor,
  formatMoney,
  maxBidAmount,
  normalizeCurrency,
  roundForCurrency,
  type Currency,
} from "@/lib/money";

export function CustomBidStepper({
  open,
  onClose,
  currentPrice,
  startPrice,
  currency,
  onConfirm,
  minOverride,
}: {
  open: boolean;
  onClose: () => void;
  /** Latest known highest price (drives min = current + step). */
  currentPrice: number;
  /** Auction starting price (drives cap). */
  startPrice: number;
  currency: string;
  /** Called with the chosen amount. Return `false` to keep the panel open (e.g. price changed). */
  onConfirm: (amount: number) => void | Promise<void>;
  /** Optional forced minimum (e.g. after a price_changed toast). */
  minOverride?: number | null;
}) {
  const { t, i18n } = useTranslation();
  const cur: Currency = normalizeCurrency(currency);
  const locale = i18n.language;

  const step = useMemo(() => bidStepFor(currentPrice, cur), [currentPrice, cur]);
  const min = useMemo(
    () => Math.max(roundForCurrency(currentPrice + step, cur), minOverride ?? 0),
    [currentPrice, step, cur, minOverride],
  );
  const max = useMemo(() => maxBidAmount(startPrice, cur), [startPrice, cur]);

  const [amount, setAmount] = useState<number>(min);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset amount when opening or when minimum shifts above current amount.
  useEffect(() => {
    if (!open) return;
    setAmount((prev) => Math.min(Math.max(prev, min), max));
  }, [open, min, max]);
  useEffect(() => {
    if (open) setAmount(min);
    else setEditing(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Press-and-hold accelerator.
  const holdRef = useRef<{ timer: number | null; interval: number | null }>({
    timer: null,
    interval: null,
  });
  const stopHold = () => {
    if (holdRef.current.timer) { clearTimeout(holdRef.current.timer); holdRef.current.timer = null; }
    if (holdRef.current.interval) { clearInterval(holdRef.current.interval); holdRef.current.interval = null; }
  };
  useEffect(() => () => stopHold(), []);
  const startHold = (dir: 1 | -1) => {
    stopHold();
    const tick = () => bump(dir);
    holdRef.current.timer = window.setTimeout(() => {
      holdRef.current.interval = window.setInterval(tick, 70);
    }, 350);
  };

  function bump(dir: 1 | -1) {
    setAmount((a) => {
      const next = roundForCurrency(a + dir * step, cur);
      return Math.min(Math.max(next, min), max);
    });
    haptic.light?.();
  }

  function commitDraft() {
    const parsed = Number(draft.replace(/[^\d.,-]/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(Math.max(roundForCurrency(parsed, cur), min), max);
      setAmount(clamped);
    }
    setEditing(false);
  }

  const atMin = amount <= min;
  const atMax = amount >= max;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
          className="mt-1.5 overflow-hidden rounded-2xl"
          style={{
            backgroundColor: "rgba(15, 15, 20, 0.85)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <div className="flex items-center justify-between px-3 pt-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {t("bid.custom.title", "Enchère personnalisée")}
            </p>
            <Press
              onClick={onClose}
              aria-label={t("bid.custom.close", "Fermer")}
              className="!min-h-6 h-6 w-6 rounded-full text-white/70"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <X size={12} />
            </Press>
          </div>

          <div className="flex items-center gap-2 px-3 py-2">
            <Press
              onClick={() => bump(-1)}
              onPointerDown={() => startHold(-1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              disabled={atMin}
              aria-label={t("bid.custom.decrease", "Diminuer")}
              className="h-11 w-11 shrink-0 rounded-xl text-white disabled:opacity-40"
              style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
            >
              <Minus size={18} />
            </Press>

            <div className="flex-1 rounded-xl px-2 py-2 text-center"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
              {editing ? (
                <input
                  ref={inputRef}
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => { if (e.key === "Enter") commitDraft(); }}
                  className="w-full bg-transparent text-center text-[18px] font-bold text-white outline-none tabular-nums"
                />
              ) : (
                <Press
                  hapticOnTap={false}
                  onClick={() => { setDraft(String(amount)); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                  aria-label={t("bid.custom.editAmount", "Modifier le montant")}
                  className="!block !min-h-0 w-full !p-0 text-center"
                >
                  <p className="text-[18px] font-bold text-white tabular-nums">
                    {formatMoney(amount, cur, locale)}
                  </p>
                  <p className="text-[10px] text-white/50 tabular-nums">
                    {t("bid.custom.min", "min")} {formatMoney(min, cur, locale)}
                  </p>
                </Press>
              )}
            </div>

            <Press
              onClick={() => bump(1)}
              onPointerDown={() => startHold(1)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              disabled={atMax}
              aria-label={t("bid.custom.increase", "Augmenter")}
              className="h-11 w-11 shrink-0 rounded-xl text-white disabled:opacity-40"
              style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
            >
              <Plus size={18} />
            </Press>
          </div>

          <div className="px-3 pb-2.5">
            <Press
              onClick={() => {
                haptic.success();
                void onConfirm(amount);
              }}
              disabled={amount < min || amount > max}
              className="w-full rounded-xl py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.82 0.16 85), oklch(0.72 0.18 75))",
                color: "#1a1200",
              }}
            >
              <Gavel size={14} className="mr-1.5" />
              {t("bid.custom.confirm", "Enchérir {{amount}}", {
                amount: formatMoney(amount, cur, locale),
              })}
            </Press>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
