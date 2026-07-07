// TopUpSheet — bottom sheet to recharge the KiDi+ wallet balance.
//
// Flow:
// 1. Choose an amount (preset chip or custom input, 2–500 €).
// 2. POST /api/wallet-topup with the buyer's Supabase bearer token → returns
//    { clientSecret, publishableKey }.
// 3. Confirm the payment client-side via Stripe Elements (card only).
// 4. On `succeeded`, the webhook credits the wallet server-side and the
//    Realtime subscription pushes the new balance to the pill — we just
//    animate confetti + haptic and close.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wallet, AlertCircle, Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Confetti } from "@/components/live-viewer/confetti";
import { Press } from "@/components/press";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/lib/wallet-context";
import { haptic } from "@/lib/haptics";
import { formatMoney, topUpPresets, topUpLimits, normalizeCurrency, roundForCurrency, isZeroDecimal } from "@/lib/money";
import {
  confirmWalletTopup,
  markPendingTopup,
  clearPendingTopup,
  readPendingTopup,
  paymentIntentIdFromClientSecret,
} from "@/lib/payment-confirm";

const WAVE_BLUE = "#1DC8FE";
const ORANGE = "#FF6600";

type Step =
  | { kind: "amount" }
  | { kind: "loading" }
  | { kind: "ready"; clientSecret: string; stripePromise: Promise<StripeJs | null>; amount: number }
  | { kind: "verifying"; amount: number }
  | { kind: "done"; amount: number }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

export function TopUpSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { balance, currency, refresh } = useWallet();
  const cur = normalizeCurrency(currency);
  const PRESETS = topUpPresets(cur);
  const { min: MIN_AMOUNT, max: MAX_AMOUNT } = topUpLimits(cur);
  const zeroDec = isZeroDecimal(cur);

  const [step, setStep] = useState<Step>({ kind: "amount" });
  const [selected, setSelected] = useState<number>(PRESETS[1] ?? PRESETS[0]);
  const [custom, setCustom] = useState<string>("");
  const [confettiKey, setConfettiKey] = useState(0);

  useEffect(() => {
    if (open) {
      setStep({ kind: "amount" });
      setSelected(PRESETS[1] ?? PRESETS[0]);
      setCustom("");
      // Recovery: if a previous attempt left a pending PI in localStorage,
      // try to confirm it now (idempotent). Silent — if it fails we just
      // leave the PI in localStorage for a later retry.
      const pending = readPendingTopup();
      if (pending) {
        void (async () => {
          const r = await confirmWalletTopup(pending);
          if (r.ok) {
            clearPendingTopup();
            await refresh();
            if (!r.duplicate) toast.success(t("wallet.topup.success"));
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cur]);

  const chosenAmount = useMemo(() => {
    const custN = Number(custom.replace(",", "."));
    if (custom && Number.isFinite(custN) && custN > 0) return roundForCurrency(custN, cur);
    return selected;
  }, [custom, selected, cur]);

  const valid =
    Number.isFinite(chosenAmount) &&
    chosenAmount >= MIN_AMOUNT &&
    chosenAmount <= MAX_AMOUNT;

  const startPayment = async () => {
    if (!valid) return;
    setStep({ kind: "loading" });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setStep({ kind: "error", message: t("pay.errors.notSignedIn") });
        return;
      }
      const res = await fetch("/api/wallet-topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: chosenAmount }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        publishableKey?: string;
        error?: string;
      };
      if (res.status === 503 || body.error === "stripe_not_configured") {
        setStep({ kind: "not_configured" });
        return;
      }
      if (!res.ok || !body.clientSecret || !body.publishableKey) {
        setStep({ kind: "error", message: body.error ?? t("pay.errors.generic") });
        return;
      }
      // Store the PI id BEFORE Stripe confirms — so a page reload after
      // Stripe success but before our confirm call can still recover.
      const pi = paymentIntentIdFromClientSecret(body.clientSecret);
      if (pi) markPendingTopup(pi);
      setStep({
        kind: "ready",
        clientSecret: body.clientSecret,
        stripePromise: loadStripe(body.publishableKey),
        amount: chosenAmount,
      });
    } catch {
      setStep({ kind: "error", message: t("pay.errors.network") });
    }
  };

  const handleSuccess = async (amount: number, paymentIntentId: string) => {
    // Enter the verifying state — a spinner is shown while we ask our
    // server to credit the wallet (fallback path if the webhook is slow
    // or unreachable). The credit RPC is idempotent so the webhook can
    // safely fire too.
    setStep({ kind: "verifying", amount });
    markPendingTopup(paymentIntentId);
    const r = await confirmWalletTopup(paymentIntentId);
    if (r.ok) {
      clearPendingTopup();
      await refresh();
      haptic.success();
      setConfettiKey((k) => k + 1);
      setStep({ kind: "done", amount });
      toast.success(t("wallet.topup.success"));
      setTimeout(onClose, 1500);
    } else {
      // Leave the PI in localStorage — WalletScreen / next open of this
      // sheet will retry. Show a soft error but do not lose the credit.
      haptic.warning();
      setStep({
        kind: "error",
        message: t("wallet.topup.verifyingFailed", {
          defaultValue: "Paiement confirmé par la banque. Vérification en cours — votre solde sera crédité sous peu.",
        }),
      });
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={82}>
      <div className="relative flex h-full flex-col px-5 pb-5 pt-2">
        <Confetti trigger={confettiKey} />
        <AnimatePresence mode="wait">
          {step.kind === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
              <p className="text-lg font-bold">{t("wallet.topup.success")}</p>
              <p className="text-sm text-muted-foreground">
                {t("wallet.topup.credited", { amount: formatMoney(step.amount, cur, i18n.language) })}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="pay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 flex-col overflow-y-auto"
            >
              <h2 className="text-lg font-bold">{t("wallet.topup.title")}</h2>

              {/* Current balance card */}
              <div
                className="mt-3 flex items-center gap-3 rounded-2xl p-3"
                style={{ backgroundColor: "oklch(0.19 0.06 265)", color: "white" }}
              >
                <div
                  className="grid h-10 w-10 place-items-center rounded-full"
                  style={{ backgroundColor: "rgba(200,162,74,0.15)" }}
                >
                  <Wallet size={18} color="#c8a24a" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wide opacity-70">
                    {t("wallet.currentBalance")}
                  </p>
                  <p className="text-[20px] font-bold tabular-nums">
                    {formatMoney(balance, cur, i18n.language)}
                  </p>
                </div>
              </div>

              {step.kind === "amount" || step.kind === "error" || step.kind === "not_configured" || step.kind === "loading" ? (
                <>
                  {/* Preset amounts */}
                  <p className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("wallet.topup.chooseAmount")}
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {PRESETS.map((p) => (
                      <Press
                        key={p}
                        onClick={() => {
                          setSelected(p);
                          setCustom("");
                        }}
                        className={`!min-h-11 rounded-xl border-2 py-2 text-[15px] font-bold ${
                          selected === p && !custom
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        {formatMoney(p, cur, i18n.language)}
                      </Press>
                    ))}
                  </div>
                  <label className="mt-3 flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2 focus-within:border-primary">
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      {t("wallet.topup.other")}
                    </span>
                    <input
                      value={custom}
                      onChange={(e) => setCustom(
                        e.target.value.replace(zeroDec ? /[^0-9]/g : /[^0-9.,]/g, ""),
                      )}
                      inputMode={zeroDec ? "numeric" : "decimal"}
                      placeholder={`${MIN_AMOUNT}–${MAX_AMOUNT}`}
                      className="flex-1 bg-transparent text-right text-[15px] font-bold outline-none tabular-nums"
                    />
                  </label>

                  {/* Payment methods */}
                  <p className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("pay.method.title")}
                  </p>
                  <MethodRow icon="card" label={t("pay.method.card")} active />
                  <MethodRow
                    label="Wave"
                    brandColor={WAVE_BLUE}
                    badge={t("pay.method.comingSoon")}
                    disabled
                  />
                  <MethodRow
                    label="Orange Money"
                    brandColor={ORANGE}
                    badge={t("pay.method.comingSoon")}
                    disabled
                  />

                  {step.kind === "not_configured" && (
                    <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed p-4 text-center">
                      <AlertCircle className="text-muted-foreground" size={20} />
                      <p className="text-sm font-semibold">
                        {t("pay.notConfigured.title")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("pay.notConfigured.body")}
                      </p>
                    </div>
                  )}
                  {step.kind === "error" && (
                    <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                      {step.message}
                    </p>
                  )}

                  <div className="mt-auto pt-4">
                    <Press
                      onClick={startPayment}
                      disabled={!valid || step.kind === "loading"}
                      className="w-full rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground disabled:opacity-60"
                    >
                      {step.kind === "loading" ? (
                        <Loader2 className="mx-auto animate-spin" size={18} />
                      ) : (
                        t("wallet.topup.continueCta", {
                          amount: formatMoney(chosenAmount, cur, i18n.language),
                        })
                      )}
                    </Press>
                    {!valid && (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground">
                        {t("wallet.topup.range", { min: MIN_AMOUNT, max: MAX_AMOUNT })}
                      </p>
                    )}
                  </div>
                </>
              ) : step.kind === "ready" ? (
                <StripeInline
                  clientSecret={step.clientSecret}
                  stripePromise={step.stripePromise}
                  amountLabel={formatMoney(step.amount, cur, i18n.language)}
                  onSuccess={(pi) => { void handleSuccess(step.amount, pi); }}
                />
              ) : step.kind === "verifying" ? (
                <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="animate-spin" size={28} />
                  <p className="text-[15px] font-semibold">
                    {t("wallet.topup.verifying", { defaultValue: "Vérification du paiement…" })}
                  </p>
                  <p className="max-w-[260px] text-[12px] text-muted-foreground">
                    {t("wallet.topup.verifyingHint", {
                      defaultValue: "Nous créditons votre portefeuille. Cela prend quelques secondes.",
                    })}
                  </p>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}

function MethodRow({
  label,
  brandColor,
  badge,
  active,
  disabled,
  icon,
}: {
  label: string;
  brandColor?: string;
  badge?: string;
  active?: boolean;
  disabled?: boolean;
  icon?: "card";
}) {
  return (
    <div
      className={`mt-2 flex items-center gap-3 rounded-2xl border px-3 py-3 ${
        active ? "border-primary bg-primary/5" : "border-border"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{
          backgroundColor: brandColor ?? "transparent",
          color: brandColor ? "white" : "inherit",
        }}
      >
        {brandColor ? (
          <span className="text-[13px] font-bold">{label[0]}</span>
        ) : icon === "card" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
        ) : null}
      </div>
      <div className="flex-1 text-[14px] font-semibold">{label}</div>
      {badge && (
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

function StripeInline({
  clientSecret,
  stripePromise,
  amountLabel,
  onSuccess,
}: {
  clientSecret: string;
  stripePromise: Promise<StripeJs | null>;
  amountLabel: string;
  onSuccess: (paymentIntentId: string) => void;
}) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe" as const,
        variables: { colorPrimary: "#c8a24a", borderRadius: "12px" },
      },
    }),
    [clientSecret],
  );
  return (
    <Elements stripe={stripePromise} options={options}>
      <StripeInlineForm amountLabel={amountLabel} onSuccess={onSuccess} />
    </Elements>
  );
}

function StripeInlineForm({
  amountLabel,
  onSuccess,
}: {
  amountLabel: string;
  onSuccess: (paymentIntentId: string) => void;
}) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    haptic.medium();
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? t("pay.errors.generic"));
      haptic.warning();
      return;
    }
    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")
    ) {
      onSuccess(paymentIntent.id);
    } else {
      setError(t("pay.errors.generic"));
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 flex flex-1 flex-col gap-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div className="mt-auto pt-3">
        <Press
          type="submit"
          disabled={!stripe || busy}
          className="w-full rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "…" : t("wallet.topup.confirmCta", { amount: amountLabel })}
        </Press>
      </div>
    </form>
  );
}
