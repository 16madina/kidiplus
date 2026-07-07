// WithdrawSheet — seller requests a payout from their available balance.
// Steps: form → confirm → success. Method: Wave / Orange Money / PayPal / Bank.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { payoutMinimumFor } from "@/lib/fees";
import { requestPayout, type PayoutMethod } from "@/lib/earnings-db";

const WAVE = "#1DC8FE";
const ORANGE = "#FF6600";
const PAYPAL_BLUE = "#003087";
const PAYPAL_BLUE_LIGHT = "#0070BA";

// Basic RFC-ish email regex — good enough for input validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Method choices (and default) depend on the seller's wallet currency:
 *  - XOF: mobile money first (Wave, Orange Money), then PayPal, then Virement.
 *  - EUR / CAD: PayPal first, then Virement. Mobile-money options are hidden
 *    to reduce noise (irrelevant for European / Canadian sellers). */
function methodsForCurrency(currency: string): PayoutMethod[] {
  const cur = normalizeCurrency(currency);
  if (cur === "XOF") return ["wave", "orange_money", "paypal", "bank_transfer"];
  return ["paypal", "bank_transfer"];
}

/** PayPal-brand square with a white italic "P". */
function PaypalIcon() {
  return (
    <span
      className="italic"
      style={{
        color: "white",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 900,
        fontSize: 16,
        lineHeight: 1,
        letterSpacing: "-0.05em",
        textShadow: `1px 0 0 ${PAYPAL_BLUE_LIGHT}`,
      }}
    >
      P
    </span>
  );
}

export function WithdrawSheet({
  open,
  onClose,
  available,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  available: number;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const min = payoutMinimumFor(currency);
  const availableMethods = useMemo(() => methodsForCurrency(currency), [currency]);
  const defaultMethod: PayoutMethod = availableMethods[0] ?? "paypal";

  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [amount, setAmount] = useState<number>(available);
  const [method, setMethod] = useState<PayoutMethod>(defaultMethod);
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("form");
      setAmount(available);
      setMethod(defaultMethod);
      setPhone("");
      setIban("");
      setHolder("");
      setPaypalEmail("");
      setBusy(false);
    }
  }, [open, available, defaultMethod]);

  const destination = useMemo<Record<string, string>>(() => {
    if (method === "bank_transfer") return { iban: iban.trim(), holder: holder.trim() };
    if (method === "paypal") return { paypalEmail: paypalEmail.trim() };
    return { phone: phone.trim() };
  }, [method, phone, iban, holder, paypalEmail]);

  const emailTrimmed = paypalEmail.trim();
  const emailValid = EMAIL_RE.test(emailTrimmed) && emailTrimmed.length <= 254;
  const destinationValid =
    method === "bank_transfer"
      ? iban.trim().length >= 6 && holder.trim().length >= 2
      : method === "paypal"
        ? emailValid
        : phone.trim().length >= 6;
  const belowMin = amount < min;
  const aboveAvailable = amount > available;
  const canContinue = !belowMin && !aboveAvailable && amount > 0 && destinationValid;
  const invalidEmail = method === "paypal" && emailTrimmed.length > 0 && !emailValid;
  const disabledReason = belowMin
    ? t("payout.errors.belowMinInline", { min: formatMoney(min, currency, i18n.language) })
    : aboveAvailable
      ? t("payout.errors.aboveAvailable")
      : invalidEmail
        ? t("payout.errors.invalidEmail")
        : !destinationValid
          ? t("payout.errors.missingDestination")
          : null;

  const submit = async () => {
    setBusy(true);
    haptic.medium();
    const r = await requestPayout(amount, method, destination);
    setBusy(false);
    if (r.ok) {
      haptic.success();
      setStep("success");
      setTimeout(onClose, 1800);
    } else {
      haptic.warning();
      toast.error(
        r.error === "insufficient_funds"
          ? t("payout.errors.insufficient")
          : r.error === "below_minimum"
            ? t("payout.errors.belowMin", { min: formatMoney(r.min ?? min, currency, i18n.language) })
            : t("payout.errors.generic"),
      );
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={82}>
      <div className="flex h-full flex-col px-5 pb-5 pt-2">
        <AnimatePresence mode="wait">
          {step === "success" ? (
            <motion.div
              key="ok"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-1 flex-col items-center justify-center gap-3"
            >
              <motion.div
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
                className="grid h-20 w-20 place-items-center rounded-full"
                style={{ backgroundColor: "oklch(0.72 0.2 155)" }}
              >
                <Check size={44} color="white" strokeWidth={3} />
              </motion.div>
              <p className="text-lg font-bold">{t("payout.successTitle")}</p>
              <p className="text-center text-sm text-muted-foreground">
                {t("payout.successBody")}
              </p>
            </motion.div>
          ) : step === "confirm" ? (
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
              <h2 className="text-lg font-bold">{t("payout.confirmTitle")}</h2>
              <div className="mt-4 space-y-3 rounded-2xl border p-4 text-sm">
                <Row label={t("payout.amount")} value={formatMoney(amount, currency, i18n.language)} bold />
                <Row label={t("payout.method.label")} value={t(`payout.method.${method}`)} />
                {method === "bank_transfer" ? (
                  <>
                    <Row label="IBAN" value={iban} />
                    <Row label={t("payout.holder")} value={holder} />
                  </>
                ) : (
                  <Row label={t("payout.phone")} value={phone} />
                )}
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <Press onClick={() => setStep("form")} className="flex-1 rounded-2xl border py-3 text-[15px] font-semibold">
                  {t("common.back")}
                </Press>
                <Press
                  onClick={busy ? undefined : submit}
                  className="flex-1 rounded-2xl py-3 text-[15px] font-bold text-white"
                  style={{ backgroundColor: "#c8a24a", color: "#10162B" }}
                >
                  {busy ? <Loader2 className="mx-auto animate-spin" size={18} /> : t("payout.submit")}
                </Press>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col overflow-y-auto">
              <h2 className="text-lg font-bold">{t("payout.title")}</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t("payout.available")}: <span className="font-semibold text-foreground">{formatMoney(available, currency, i18n.language)}</span>
              </p>

              <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("payout.amount")}
              </label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value.replace(",", ".")) || 0)}
                className="mt-1 h-12 w-full rounded-2xl border px-4 text-[16px] font-semibold tabular-nums"
              />
              <p
                className="mt-1 text-[11px]"
                style={{
                  color: belowMin
                    ? "oklch(0.6 0.24 25)"
                    : "var(--muted-foreground)",
                  fontWeight: belowMin ? 600 : 400,
                }}
              >
                {belowMin
                  ? t("payout.errors.belowMinInline", {
                      min: formatMoney(min, currency, i18n.language),
                    })
                  : t("payout.minHint", {
                      min: formatMoney(min, currency, i18n.language),
                    })}
              </p>

              <p className="mt-4 mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("payout.method.label")}
              </p>
              <div className="flex flex-col gap-2">
                <MethodPick
                  active={method === "wave"}
                  onClick={() => setMethod("wave")}
                  color={WAVE}
                  label="Wave"
                />
                <MethodPick
                  active={method === "orange_money"}
                  onClick={() => setMethod("orange_money")}
                  color={ORANGE}
                  label="Orange Money"
                />
                <MethodPick
                  active={method === "bank_transfer"}
                  onClick={() => setMethod("bank_transfer")}
                  color="#10162B"
                  label={t("payout.method.bank_transfer")}
                  icon={<Building2 size={18} color="white" />}
                />
              </div>

              {method === "bank_transfer" ? (
                <>
                  <input
                    placeholder="IBAN"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    className="mt-3 h-12 w-full rounded-2xl border px-4 text-[14px]"
                  />
                  <input
                    placeholder={t("payout.holder")}
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border px-4 text-[14px]"
                  />
                </>
              ) : (
                <input
                  placeholder={t("payout.phonePlaceholder")}
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-3 h-12 w-full rounded-2xl border px-4 text-[14px]"
                />
              )}

              <div className="mt-auto pt-4">
                {!canContinue && disabledReason && (
                  <p
                    className="mb-2 text-center text-[12px] font-semibold"
                    style={{ color: "oklch(0.6 0.24 25)" }}
                  >
                    {disabledReason}
                  </p>
                )}
                <Press
                  onClick={canContinue ? () => setStep("confirm") : undefined}
                  disabled={!canContinue}
                  className="w-full rounded-2xl py-3 text-[15px] font-bold"
                  style={{
                    backgroundColor: canContinue ? "#c8a24a" : "var(--muted)",
                    color: canContinue ? "#10162B" : "var(--muted-foreground)",
                  }}
                >
                  {t("common.continue")}
                </Press>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}

function MethodPick({
  active,
  onClick,
  color,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
        active ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-xl text-white text-[13px] font-bold"
        style={{ backgroundColor: color }}
      >
        {icon ?? label[0]}
      </div>
      <div className="flex-1 text-[14px] font-semibold">{label}</div>
      {active && <Check size={18} color="var(--primary)" strokeWidth={2.4} />}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "text-base font-bold tabular-nums" : "text-right tabular-nums break-all"}>{value}</span>
    </div>
  );
}
