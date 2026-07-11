// PaymentSheet — Stripe card checkout inside a native-feel bottom sheet.
//
// Flow:
// 1. `order` prop = a freshly-created pending order row (see createPendingOrder).
// 2. Call POST /api/checkout with the buyer's Supabase bearer token to get
//    a Stripe clientSecret + publishableKey.
// 3. Render <Elements> + <PaymentElement>; confirm the payment client-side.
// 4. Webhook flips the order to `paid` (async). We show a success animation
//    on Stripe's `succeeded` return value; the real DB update lands via
//    the realtime subscription in the Commandes tab.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, ShieldCheck, AlertCircle, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRow } from "@/lib/orders-db";
import { useWallet } from "@/lib/wallet-context";
import { payOrderWithWallet } from "@/lib/wallet-db";
import { convertMoney, formatMoney, normalizeCurrency } from "@/lib/money";
import { TopUpSheet } from "@/components/wallet/topup-sheet";
import {
  confirmOrderPayment,
  markPendingOrder,
  clearPendingOrder,
  readPendingOrder,
  paymentIntentIdFromClientSecret,
} from "@/lib/payment-confirm";
import { resolvePublishableKey, paymentsEnvHeaders } from "@/lib/stripe-publishable";
import { mapPayErrorToI18n } from "@/lib/pay-errors";
import { BrandBadge, type BrandKey } from "@/components/brand/brand-badge";



type CheckoutResp = {
  clientSecret?: string;
  publishableKey?: string;
  error?: string;
};

export function PaymentSheet({
  order,
  onClose,
  onPaid,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onPaid?: (order: OrderRow) => void;
}) {
  const { t, i18n } = useTranslation();
  const { balance, currency: walletCurrency } = useWallet();
  const orderCurrency = normalizeCurrency(order?.currency ?? "EUR");
  const fmt = (n: number) => formatMoney(n, orderCurrency, i18n.language);
  const [topupOpen, setTopupOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; clientSecret: string; stripePromise: Promise<StripeJs | null> }
    | { kind: "verifying" }
    | { kind: "not_configured" }
    | { kind: "error"; message: string }
    | { kind: "done" }
  >({ kind: "loading" });


  // Reset on order change
  useEffect(() => {
    if (!order) {
      setState({ kind: "loading" });
      return;
    }
    // Recovery: if a previous attempt left a pending PI for this order,
    // try to confirm it once (idempotent).
    const pending = readPendingOrder(order.id);
    if (pending) {
      void confirmOrderPayment(pending).then((r) => {
        if (r.ok) clearPendingOrder(order.id);
      });
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setState({ kind: "error", message: t("pay.errors.notSignedIn") });
          return;
        }
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...paymentsEnvHeaders(),
          },
          body: JSON.stringify({ orderId: order.id }),
        });

        const body = (await res.json().catch(() => ({}))) as CheckoutResp;
        if (cancelled) return;
        if (res.status === 503 || body.error === "stripe_not_configured") {
          setState({ kind: "not_configured" });
          return;
        }
        const pubKey = resolvePublishableKey(body.publishableKey);
        if (!res.ok || !body.clientSecret || !pubKey) {
          setState({
            kind: "error",
            message: !pubKey
              ? t("pay.errors.notConfigured")
              : mapPayErrorToI18n(t, body.error),
          });
          return;
        }
        // Store PI id BEFORE the client confirms it, so a reload between
        // Stripe success and our confirm call can still recover.
        const pi = paymentIntentIdFromClientSecret(body.clientSecret);
        if (pi && order) markPendingOrder(order.id, pi);
        setState({
          kind: "ready",
          clientSecret: body.clientSecret,
          stripePromise: loadStripe(pubKey),
        });

      } catch {
        if (!cancelled) setState({ kind: "error", message: t("pay.errors.network") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order, t]);

  const handleSuccess = async (paymentIntentId: string) => {
    if (!order) return;
    setState({ kind: "verifying" });
    markPendingOrder(order.id, paymentIntentId);
    const r = await confirmOrderPayment(paymentIntentId);
    if (r.ok) {
      clearPendingOrder(order.id);
      haptic.success();
      setState({ kind: "done" });
      toast.success(t("pay.toasts.confirmed"));
      onPaid?.(order);
      setTimeout(onClose, 1400);
    } else {
      // Card succeeded on Stripe but our server couldn't confirm yet — the
      // pending PI stays in localStorage; the webhook (or the next open of
      // this sheet) will still credit the order. Show a reassuring message.
      haptic.warning();
      setState({
        kind: "error",
        message: t("pay.verifyingFailed", {
          defaultValue: "Paiement accepté par la banque. Vérification en cours — votre commande sera confirmée sous peu.",
        }),
      });
    }
  };

  return (
    <BottomSheet open={!!order} onClose={onClose} heightPercent={88}>
      {order && (
        <div className="flex h-full flex-col">
          <AnimatePresence mode="wait">
            {state.kind === "done" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center gap-3 px-5"
              >
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 18 }}
                  className="grid h-20 w-20 place-items-center rounded-full"
                  style={{ backgroundColor: "oklch(0.72 0.2 155)" }}
                >
                  <Check size={44} color="white" strokeWidth={3} />
                </motion.div>
                <p className="text-lg font-bold">{t("pay.toasts.confirmed")}</p>
                <p className="text-center text-sm text-muted-foreground">
                  {t("pay.doneHint")}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="pay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 pt-2"
              >
                <h2 className="text-lg font-bold">{t("pay.title")}</h2>

                {/* Summary */}
                <div className="mt-4 flex items-center gap-3 rounded-2xl border p-3">
                  {order.item_image ? (
                    <img
                      src={order.item_image}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{order.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.kind === "auction" ? t("pay.kind.auction") : t("pay.kind.fixed")}
                    </p>
                  </div>
                </div>

                {/* Fees breakdown: item + delivery (or courier note) = total */}
                <dl className="mt-4 space-y-2 text-sm">
                  <Row label={t("pay.item")} value={fmt(Number(order.amount))} />
                  {order.delivery_mode === "courier" ? (
                    <Row label={t("delivery.fee")} value={t("delivery.courierNote")} />
                  ) : Number(order.delivery_fee) > 0 ? (
                    <Row
                      label={
                        t("delivery.fee") +
                        (order.delivery_zone ? ` · ${order.delivery_zone}` : "")
                      }
                      value={fmt(Number(order.delivery_fee))}
                    />
                  ) : null}
                  <div className="my-2 h-px bg-border" />
                  <Row label={t("pay.total")} value={fmt(Number(order.total))} bold />
                </dl>

                {/* Payment method selector */}
                <div className="mt-5">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("pay.method.title")}
                  </p>
                  <div className="flex flex-col gap-2">
                    {/* Wallet method — first, with balance and insufficient-funds shortcut */}
                    <WalletMethodRow
                      balance={balance}
                      walletCurrency={walletCurrency}
                      orderCurrency={orderCurrency}
                      total={Number(order.total)}
                      locale={i18n.language}
                      busy={walletBusy}
                      onPay={async () => {
                        if (walletBusy) return;
                        setWalletBusy(true);
                        haptic.medium();
                        const r = await payOrderWithWallet(order.id);
                        setWalletBusy(false);
                        if (r.ok) {
                          haptic.success();
                          setState({ kind: "done" });
                          const debitLabel =
                            r.debitAmount !== undefined && r.debitCurrency
                              ? formatMoney(r.debitAmount, r.debitCurrency, i18n.language)
                              : null;
                          toast.success(
                            debitLabel
                              ? t("wallet.paidWithWalletAmt", {
                                  defaultValue: "Payé : {{amount}}",
                                  amount: debitLabel,
                                })
                              : t("wallet.paidWithWallet"),
                          );
                          onPaid?.(order);
                          setTimeout(onClose, 1400);
                        } else {
                          haptic.warning();
                          toast.error(
                            r.error === "insufficient_funds"
                              ? t("wallet.insufficient")
                              : t("pay.errors.generic"),
                          );
                        }
                      }}
                      onTopUp={() => setTopupOpen(true)}
                    />
                    <MethodRow
                      active
                      icon={<CreditCard size={20} />}
                      label={t("pay.method.card")}
                      subtitle={t("pay.method.cardSub")}
                      right={
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                          <span>VISA</span>
                          <span>·</span>
                          <span>MC</span>
                        </div>
                      }
                    />

                    {orderCurrency === "XOF" && (
                      <>
                        <MethodRow
                          active
                          logoUrl={waveLogo}
                          brandColor={WAVE_BLUE}
                          label={t("pay.method.waveVisa")}
                          subtitle={t("pay.method.waveVisaSub")}
                        />
                        <MethodRow
                          active
                          logoUrl={orangeMoneyLogo}
                          brandColor={ORANGE}
                          label={t("pay.method.orangeVisa")}
                          subtitle={t("pay.method.orangeVisaSub")}
                        />
                        <MethodRow
                          active
                          logoUrl={djamoLogo}
                          brandColor={DJAMO_INDIGO}
                          label={t("pay.method.djamo")}
                          subtitle={t("pay.method.djamoSub")}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Stripe Elements or fallback state */}
                <div className="mt-5 flex-1">
                  {state.kind === "loading" && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-muted-foreground" size={22} />
                    </div>
                  )}
                  {state.kind === "not_configured" && (
                    <NotConfigured />
                  )}
                  {state.kind === "error" && (
                    <ErrorState message={state.message} onRetry={onClose} />
                  )}
                  {state.kind === "verifying" && (
                    <div className="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-center">
                      <Loader2 className="animate-spin" size={28} />
                      <p className="text-[15px] font-semibold">
                        {t("pay.verifying", { defaultValue: "Vérification du paiement…" })}
                      </p>
                      <p className="max-w-[260px] text-[12px] text-muted-foreground">
                        {t("pay.verifyingHint", {
                          defaultValue: "Confirmation en cours auprès de notre serveur.",
                        })}
                      </p>
                    </div>
                  )}
                  {state.kind === "ready" && (
                    <StripeCardForm
                      clientSecret={state.clientSecret}
                      stripePromise={state.stripePromise}
                      totalLabel={fmt(Number(order.total))}
                      onSuccess={(pi) => { void handleSuccess(pi); }}
                    />
                  )}
                </div>

                <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <ShieldCheck size={12} />
                  <span>{t("pay.secure")}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />
    </BottomSheet>
  );
}

function WalletMethodRow({
  balance,
  walletCurrency,
  orderCurrency,
  total,
  locale,
  busy,
  onPay,
  onTopUp,
}: {
  balance: number;
  walletCurrency: string;
  orderCurrency: string;
  total: number;
  locale: string;
  busy: boolean;
  onPay: () => void;
  onTopUp: () => void;
}) {
  const { t } = useTranslation();
  const crossCurrency = walletCurrency !== orderCurrency;
  const debit = crossCurrency ? convertMoney(total, orderCurrency, walletCurrency) : total;
  const enough = balance >= debit;
  return (
    <button
      type="button"
      onClick={busy ? undefined : (enough ? onPay : onTopUp)}
      disabled={busy}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
        enough ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{ backgroundColor: "oklch(0.19 0.06 265)" }}
      >
        <Wallet size={18} color="#c8a24a" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{t("wallet.method")}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {formatMoney(balance, walletCurrency, locale)}
        </div>
        {crossCurrency && (
          <div className="mt-0.5 text-[10.5px] text-muted-foreground tabular-nums">
            {t("wallet.debitHint", {
              defaultValue: "Débit : {{amount}}",
              amount: formatMoney(debit, walletCurrency, locale),
            })}
          </div>
        )}
      </div>
      {busy ? (
        <Loader2 className="animate-spin" size={16} />
      ) : enough ? (
        <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">
          {t("pay.payNow", { total: formatMoney(total, orderCurrency, locale) })}
        </span>
      ) : (
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] font-bold text-destructive">
            {t("wallet.insufficient")}
          </span>
          <span className="text-[11px] font-semibold text-primary">
            {t("wallet.topupCta")}
          </span>
        </span>
      )}
    </button>
  );
}


function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-bold" : "text-muted-foreground"}>{label}</dt>
      <dd className={bold ? "text-lg font-bold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function MethodRow({
  icon,
  label,
  subtitle,
  right,
  badge,
  brandColor,
  active,
  disabled,
  logoUrl,
}: {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
  badge?: string;
  brandColor?: string;
  active?: boolean;
  disabled?: boolean;
  logoUrl?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = logoUrl && !imgFailed;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
        active ? "border-primary bg-primary/5" : "border-border"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl"
        style={
          showImg
            ? { backgroundColor: "white" }
            : { backgroundColor: brandColor ?? "transparent", color: brandColor ? "white" : "inherit" }
        }
      >
        {showImg ? (
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : brandColor ? (
          <span className="text-[13px] font-bold">{label[0]}</span>
        ) : (
          icon
        )}
      </div>


      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{label}</div>
        {subtitle && (
          <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {badge ? (
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      ) : (
        right
      )}
    </div>
  );
}

function NotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-dashed p-5 text-center">
      <AlertCircle className="text-muted-foreground" size={22} />
      <p className="text-sm font-semibold">{t("pay.notConfigured.title")}</p>
      <p className="text-xs text-muted-foreground">{t("pay.notConfigured.body")}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-5 text-center">
      <AlertCircle className="text-destructive" size={22} />
      <p className="text-sm font-semibold">{t("pay.errors.title")}</p>
      <p className="text-xs text-muted-foreground">{message}</p>
      <Press
        onClick={onRetry}
        className="mt-1 rounded-xl bg-muted px-4 py-2 text-[13px] font-semibold"
      >
        {t("common.close")}
      </Press>
    </div>
  );
}

function StripeCardForm({
  clientSecret,
  stripePromise,
  totalLabel,
  onSuccess,
}: {
  clientSecret: string;
  stripePromise: Promise<StripeJs | null>;
  totalLabel: string;
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
      <StripePayForm totalLabel={totalLabel} onSuccess={onSuccess} />
    </Elements>
  );
}

function StripePayForm({
  totalLabel,
  onSuccess,
}: {
  totalLabel: string;
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
      const slug =
        error.type === "card_error"
          ? "card_declined"
          : error.code === "amount_too_small" || error.code === "amount_too_large"
            ? "invalid_amount"
            : "stripe_error";
      setError(error.message ?? mapPayErrorToI18n(t, slug));
      haptic.warning();
      return;
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onSuccess(paymentIntent.id);
    } else {
      setError(t("pay.errors.generic"));
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Press
        type="submit"
        disabled={!stripe || busy}
        className="mt-1 w-full rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "…" : t("pay.payNow", { total: totalLabel })}
      </Press>
    </form>
  );
}
