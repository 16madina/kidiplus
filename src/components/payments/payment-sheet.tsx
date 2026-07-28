// PaymentSheet — wallet-first checkout with lazy Stripe card form.
//
// Flow:
// 1. `order` prop = a pending order (auction finalize or createPendingOrder).
// 2. If the wallet covers the total (incl. FX), auto-debit immediately.
// 3. Otherwise show methods. Stripe PaymentIntent is created ONLY when the
//    user chooses card — avoids orphaned PIs marking the order "failed"
//    after a successful wallet pay.
// 4. Card path: POST /api/checkout → Elements → confirm → webhook/confirm.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, AlertCircle, Loader2, Wallet } from "lucide-react";
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
  cancelOrderPaymentIntent,
  confirmOrderPayment,
  markPendingOrder,
  clearPendingOrder,
  readPendingOrder,
  paymentIntentIdFromClientSecret,
} from "@/lib/payment-confirm";
import { resolvePublishableKey, paymentsEnvHeaders } from "@/lib/stripe-publishable";
import { mapPayErrorToI18n } from "@/lib/pay-errors";
import { BrandBadge, type BrandKey } from "@/components/brand/brand-badge";
import { OrderItemImage } from "@/components/orders/order-item-image";
import { setOrderProductOptions } from "@/lib/orders-db";
import { variantSelectionState } from "@/lib/live-product-options";
import { isNative } from "@/lib/native";
import {
  capturePaypalCheckout,
  clearPendingPaypalCheckout,
  createPaypalCheckout,
  mapPaypalCheckoutError,
  markPendingPaypalCheckout,
  readPendingPaypalCheckout,
} from "@/lib/paypal-checkout-client";

type CheckoutResp = {
  clientSecret?: string;
  publishableKey?: string;
  error?: string;
};

type SheetState =
  | { kind: "idle" }
  | { kind: "card_loading" }
  | { kind: "ready"; clientSecret: string; stripePromise: Promise<StripeJs | null> }
  | { kind: "verifying" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string }
  | { kind: "done" };

export function PaymentSheet({
  order,
  onClose,
  onPaid,
  productColors = [],
  productSizes = [],
  onOrderPatched,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onPaid?: (order: OrderRow) => void;
  /** Available color options for the live product (auction wins). */
  productColors?: string[];
  productSizes?: string[];
  onOrderPatched?: (order: OrderRow) => void;
}) {
  const { t, i18n } = useTranslation();
  const { balance, currency: walletCurrencyRaw } = useWallet();
  const walletCurrency = normalizeCurrency(walletCurrencyRaw);
  const orderCurrency = normalizeCurrency(order?.currency ?? "EUR");
  const fmt = (n: number) => formatMoney(n, orderCurrency, i18n.language);
  const [topupOpen, setTopupOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [paypalBusy, setPaypalBusy] = useState(false);
  const [cardSelected, setCardSelected] = useState(false);
  const [state, setState] = useState<SheetState>({ kind: "idle" });
  const autoTriedRef = useRef<string | null>(null);
  const paypalFinishedRef = useRef(false);
  const paypalSupported =
    orderCurrency === "XOF" ||
    orderCurrency === "EUR" ||
    orderCurrency === "CAD" ||
    orderCurrency === "USD" ||
    orderCurrency === "GBP";
  const variantState = variantSelectionState(productColors, productSizes);
  const existingOpts = (order?.address_snapshot?.product_options ?? null) as
    | { color?: string | null; size?: string | null }
    | null;
  const [pickedColor, setPickedColor] = useState<string | undefined>();
  const [pickedSize, setPickedSize] = useState<string | undefined>();

  useEffect(() => {
    if (!order) {
      setPickedColor(undefined);
      setPickedSize(undefined);
      return;
    }
    setPickedColor(
      existingOpts?.color ??
        variantState.color ??
        (productColors.length === 1 ? productColors[0] : undefined),
    );
    setPickedSize(
      existingOpts?.size ??
        variantState.size ??
        (productSizes.length === 1 ? productSizes[0] : undefined),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const needsVariant =
    order?.status === "pending" &&
    (productColors.length > 1 || productSizes.length > 1);
  const variantReady =
    !needsVariant ||
    ((productColors.length <= 1 || !!pickedColor) &&
      (productSizes.length <= 1 || !!pickedSize));

  const ensureVariantOnOrder = async (): Promise<boolean> => {
    if (!order || !needsVariant) return true;
    if (!variantReady) {
      toast.error(
        t("productOptions.pickRequired", "Choisis une couleur / taille"),
      );
      return false;
    }
    const r = await setOrderProductOptions(order.id, {
      color: pickedColor,
      size: pickedSize,
    });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    if (r.itemName) {
      onOrderPatched?.({ ...order, item_name: r.itemName });
    }
    return true;
  };

  const walletDebit = useMemo(() => {
    const total = Number(order?.total ?? 0);
    if (walletCurrency === orderCurrency) return total;
    return convertMoney(total, orderCurrency, walletCurrency);
  }, [order?.total, walletCurrency, orderCurrency]);

  const walletEnough = balance >= walletDebit && walletDebit > 0;

  const finishWalletPaid = useCallback(
    (ord: OrderRow, debitAmount?: number, debitCurrency?: string) => {
      haptic.success();
      setState({ kind: "done" });
      void cancelOrderPaymentIntent(ord.id);
      const debitLabel =
        debitAmount !== undefined && debitCurrency
          ? formatMoney(debitAmount, debitCurrency, i18n.language)
          : null;
      toast.success(
        debitLabel
          ? t("wallet.paidWithWalletAmt", {
              defaultValue: "Payé : {{amount}}",
              amount: debitLabel,
            })
          : t("wallet.paidWithWallet"),
      );
      onPaid?.(ord);
      setTimeout(onClose, 1400);
    },
    [i18n.language, onClose, onPaid, t],
  );

  const finishPaypalPaid = useCallback(
    (ord: OrderRow) => {
      paypalFinishedRef.current = true;
      clearPendingPaypalCheckout();
      haptic.success();
      setPaypalBusy(false);
      setState({ kind: "done" });
      void cancelOrderPaymentIntent(ord.id);
      toast.success(
        t("pay.method.paypalPaid", { defaultValue: "Payé avec PayPal" }),
      );
      onPaid?.(ord);
      setTimeout(onClose, 1400);
    },
    [onClose, onPaid, t],
  );

  const tryCapturePendingPaypal = useCallback(
    async (paypalOrderId: string, kidiOrder: OrderRow, opts?: { silent?: boolean }) => {
      if (paypalFinishedRef.current) return true;
      setState({ kind: "verifying" });
      const r = await capturePaypalCheckout(paypalOrderId);
      if (r.ok) {
        finishPaypalPaid(kidiOrder);
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch {
          /* ignore */
        }
        return true;
      }
      if (!opts?.silent) {
        setPaypalBusy(false);
        setState({ kind: "idle" });
        toast.error(mapPaypalCheckoutError(r.error, r.message));
      }
      return false;
    },
    [finishPaypalPaid],
  );

  // Resume PayPal checkout after native/web return.
  useEffect(() => {
    if (!order) return;
    paypalFinishedRef.current = false;

    const onDone = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { ok?: boolean; status?: string; orderId?: string }
        | undefined;
      if (detail?.orderId && detail.orderId !== order.id) return;
      if (detail?.ok || detail?.status === "ok") {
        finishPaypalPaid(order);
        return;
      }
      if (detail?.status === "cancelled") {
        clearPendingPaypalCheckout();
        setPaypalBusy(false);
        setState({ kind: "idle" });
        toast.message(mapPaypalCheckoutError("cancelled"));
        return;
      }
      const pending = readPendingPaypalCheckout();
      if (pending?.kidiOrderId === order.id) {
        void tryCapturePendingPaypal(pending.paypalOrderId, order, { silent: true });
      }
    };

    window.addEventListener("kidi:paypal-order-done", onDone);

    try {
      const raw = sessionStorage.getItem("kidi:paypal_order_done");
      if (raw) {
        sessionStorage.removeItem("kidi:paypal_order_done");
        const parsed = JSON.parse(raw) as { status?: string; orderId?: string };
        if (!parsed.orderId || parsed.orderId === order.id) {
          if (parsed.status === "ok") finishPaypalPaid(order);
          else if (parsed.status === "cancelled") {
            clearPendingPaypalCheckout();
            toast.message(mapPaypalCheckoutError("cancelled"));
          }
        }
      }
    } catch {
      /* ignore */
    }

    const pending = readPendingPaypalCheckout();
    if (pending?.kidiOrderId === order.id) {
      void tryCapturePendingPaypal(pending.paypalOrderId, order, { silent: true });
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let removeBrowserListener: (() => void) | undefined;
    if (isNative()) {
      void import("@capacitor/browser").then(({ Browser }) => {
        const sub = Browser.addListener("browserFinished", () => {
          const p = readPendingPaypalCheckout();
          if (p?.kidiOrderId === order.id) {
            void tryCapturePendingPaypal(p.paypalOrderId, order, { silent: true });
          }
        });
        removeBrowserListener = () => {
          void sub.then((h) => h.remove());
        };
      });
      pollTimer = setInterval(() => {
        if (paypalFinishedRef.current) return;
        const p = readPendingPaypalCheckout();
        if (p?.kidiOrderId === order.id) {
          void tryCapturePendingPaypal(p.paypalOrderId, order, { silent: true });
        }
      }, 1600);
    }

    return () => {
      window.removeEventListener("kidi:paypal-order-done", onDone);
      removeBrowserListener?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [order, finishPaypalPaid, tryCapturePendingPaypal]);

  const startPaypalCheckout = async () => {
    if (!order || paypalBusy) return;
    const okVariant = await ensureVariantOnOrder();
    if (!okVariant) return;
    setPaypalBusy(true);
    haptic.medium();
    const created = await createPaypalCheckout(order.id, { native: isNative() });
    if (!created.ok) {
      setPaypalBusy(false);
      toast.error(mapPaypalCheckoutError(created.error, created.message));
      return;
    }
    if (!created.approveUrl) {
      setPaypalBusy(false);
      toast.error(mapPaypalCheckoutError("paypal_create_failed"));
      return;
    }
    markPendingPaypalCheckout(created.paypalOrderId, order.id);
    if (isNative()) {
      try {
        const { Browser } = await import("@capacitor/browser");
        setState({ kind: "verifying" });
        await Browser.open({
          url: created.approveUrl,
          windowName: "_blank",
          presentationStyle: "popover",
        });
      } catch {
        setPaypalBusy(false);
        setState({ kind: "idle" });
        toast.error(mapPaypalCheckoutError("paypal_create_failed"));
      }
    } else {
      window.location.assign(created.approveUrl);
    }
  };

  const tryWalletPay = useCallback(
    async (ord: OrderRow, { silent }: { silent?: boolean } = {}) => {
      setWalletBusy(true);
      if (!silent) haptic.medium();
      const r = await payOrderWithWallet(ord.id);
      setWalletBusy(false);
      if (r.ok) {
        finishWalletPaid(ord, r.debitAmount, r.debitCurrency);
        return true;
      }
      if (!silent) {
        haptic.warning();
        toast.error(mapPayErrorToI18n(t, r.error));
      }
      return false;
    },
    [finishWalletPaid, t],
  );

  // Reset + wallet auto-pay when a new order opens. Do NOT create a Stripe PI yet.
  useEffect(() => {
    if (!order) {
      setState({ kind: "idle" });
      setCardSelected(false);
      autoTriedRef.current = null;
      return;
    }
    setState({ kind: "idle" });
    setCardSelected(false);

    const pending = readPendingOrder(order.id);
    if (pending) {
      void confirmOrderPayment(pending).then((r) => {
        if (r.ok) {
          clearPendingOrder(order.id);
          setState({ kind: "done" });
          onPaid?.(order);
          setTimeout(onClose, 800);
        }
      });
    }

    // Auto-debit once per order when wallet covers total and no variant pick needed.
    if (autoTriedRef.current === order.id) return;
    autoTriedRef.current = order.id;
    if (!walletEnough || needsVariant) return;
    let cancelled = false;
    void (async () => {
      // Not silent: if auto-pay fails, show the real error (limit, expired, etc.)
      const ok = await tryWalletPay(order, { silent: false });
      if (cancelled || ok) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const startCardCheckout = useCallback(async () => {
    if (!order || state.kind === "card_loading" || state.kind === "ready") return;
    const okVariant = await ensureVariantOnOrder();
    if (!okVariant) return;
    setCardSelected(true);
    setState({ kind: "card_loading" });
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
      const pi = paymentIntentIdFromClientSecret(body.clientSecret);
      if (pi) markPendingOrder(order.id, pi);
      setState({
        kind: "ready",
        clientSecret: body.clientSecret,
        stripePromise: loadStripe(pubKey),
      });
    } catch {
      setState({ kind: "error", message: t("pay.errors.network") });
    }
  }, [order, state.kind, t]); // ensureVariantOnOrder reads latest picks via closure

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
                  <OrderItemImage src={order.item_image} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{order.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.kind === "auction" ? t("pay.kind.auction") : t("pay.kind.fixed")}
                    </p>
                  </div>
                </div>

                {needsVariant && (
                  <div className="mt-4 space-y-3 rounded-2xl border p-3">
                    <p className="text-[13px] font-semibold">
                      {t("productOptions.pickVariant", "Choisis ta variante")}
                    </p>
                    {productColors.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {productColors.map((c) => {
                          const active = pickedColor === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                haptic.selection();
                                setPickedColor(c);
                              }}
                              className="min-h-9 rounded-full px-3 text-[12px] font-semibold"
                              style={{
                                background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                                color: active ? "white" : "var(--foreground)",
                                border: active ? "none" : "1px solid var(--border)",
                              }}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {productSizes.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {productSizes.map((s) => {
                          const active = pickedSize === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                haptic.selection();
                                setPickedSize(s);
                              }}
                              className="min-h-9 rounded-full px-3 text-[12px] font-semibold"
                              style={{
                                background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                                color: active ? "white" : "var(--foreground)",
                                border: active ? "none" : "1px solid var(--border)",
                              }}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

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
                        if (!order || walletBusy) return;
                        const okVariant = await ensureVariantOnOrder();
                        if (!okVariant) return;
                        await tryWalletPay(order);
                      }}
                      onTopUp={() => setTopupOpen(true)}
                    />
                    <button
                      type="button"
                      onClick={() => { void startCardCheckout(); }}
                      className="w-full text-left"
                    >
                      <MethodRow
                        active={cardSelected}
                        brand="card"
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
                    </button>

                    {orderCurrency === "XOF" && (
                      <>
                        {/* These are Visa cards issued by Wave/Orange/Djamo — paid via Stripe card form, not mobile-money APIs. */}
                        <button
                          type="button"
                          onClick={() => {
                            toast.message(
                              t("pay.method.useVisaCardHint", {
                                defaultValue:
                                  "Utilise ta carte Visa Wave / Orange / Djamo dans le formulaire carte ci-dessous.",
                              }),
                            );
                            void startCardCheckout();
                          }}
                          className="w-full text-left"
                        >
                          <MethodRow
                            active={cardSelected}
                            brand="wave"
                            label={t("pay.method.waveVisa")}
                            subtitle={t("pay.method.waveVisaSub")}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toast.message(
                              t("pay.method.useVisaCardHint", {
                                defaultValue:
                                  "Utilise ta carte Visa Wave / Orange / Djamo dans le formulaire carte ci-dessous.",
                              }),
                            );
                            void startCardCheckout();
                          }}
                          className="w-full text-left"
                        >
                          <MethodRow
                            active={cardSelected}
                            brand="orange"
                            label={t("pay.method.orangeVisa")}
                            subtitle={t("pay.method.orangeVisaSub")}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toast.message(
                              t("pay.method.useVisaCardHint", {
                                defaultValue:
                                  "Utilise ta carte Visa Wave / Orange / Djamo dans le formulaire carte ci-dessous.",
                              }),
                            );
                            void startCardCheckout();
                          }}
                          className="w-full text-left"
                        >
                          <MethodRow
                            active={cardSelected}
                            brand="djamo"
                            label={t("pay.method.djamo")}
                            subtitle={t("pay.method.djamoSub")}
                          />
                        </button>
                      </>
                    )}
                    {paypalSupported && (
                      <button
                        type="button"
                        onClick={() => { void startPaypalCheckout(); }}
                        disabled={paypalBusy}
                        className="w-full text-left"
                      >
                        <MethodRow
                          active={paypalBusy || state.kind === "verifying"}
                          brand="paypal"
                          label={t("pay.method.paypal", { defaultValue: "PayPal" })}
                          subtitle={
                            orderCurrency === "XOF"
                              ? t("pay.method.paypalXofSub", {
                                  defaultValue: "Paiement en euros (équivalent XOF)",
                                })
                              : t("pay.method.paypalSub", {
                                  defaultValue: "Payer cette commande avec ton compte PayPal",
                                })
                          }
                          right={
                            paypalBusy ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : undefined
                          }
                        />
                      </button>
                    )}

                  </div>
                </div>

                {/* Stripe Elements — only after user picks card */}
                <div className="mt-5 flex-1">
                  {state.kind === "idle" && !walletEnough && (
                    <p className="text-center text-[12px] text-muted-foreground">
                      {t("pay.chooseMethod", {
                        defaultValue: "Choisis une méthode de paiement ci-dessus.",
                      })}
                    </p>
                  )}
                  {state.kind === "card_loading" && (
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
                      disabled={!variantReady}
                      beforeConfirm={ensureVariantOnOrder}
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
  const wc = normalizeCurrency(walletCurrency);
  const oc = normalizeCurrency(orderCurrency);
  const crossCurrency = wc !== oc;
  const debit = crossCurrency ? convertMoney(total, oc, wc) : total;
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
          {formatMoney(balance, wc, locale)}
        </div>
        {crossCurrency && (
          <div className="mt-0.5 text-[10.5px] text-muted-foreground tabular-nums">
            {t("wallet.debitHint", {
              defaultValue: "Débit : {{amount}}",
              amount: formatMoney(debit, wc, locale),
            })}
          </div>
        )}
      </div>
      {busy ? (
        <Loader2 className="animate-spin" size={16} />
      ) : enough ? (
        <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">
          {t("pay.payNow", { total: formatMoney(total, oc, locale) })}
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
  brand,
  label,
  subtitle,
  right,
  badge,
  active,
  disabled,
}: {
  brand: BrandKey;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
  badge?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
        active ? "border-primary bg-primary/5" : "border-border"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <BrandBadge brand={brand} size={40} />
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
  beforeConfirm,
  disabled = false,
}: {
  clientSecret: string;
  stripePromise: Promise<StripeJs | null>;
  totalLabel: string;
  onSuccess: (paymentIntentId: string) => void;
  beforeConfirm?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#D4A62A",
          colorText: "#10162B",
          colorDanger: "#E11D48",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          borderRadius: "12px",
          spacingUnit: "4px",
        },
      },
    }),
    [clientSecret],
  );
  return (
    <Elements stripe={stripePromise} options={options}>
      <StripePayForm
        totalLabel={totalLabel}
        onSuccess={onSuccess}
        beforeConfirm={beforeConfirm}
        disabled={disabled}
      />
    </Elements>
  );
}

function StripePayForm({
  totalLabel,
  onSuccess,
  beforeConfirm,
  disabled = false,
}: {
  totalLabel: string;
  onSuccess: (paymentIntentId: string) => void;
  beforeConfirm?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || busy || !ready || !complete || disabled) return;
    if (beforeConfirm) {
      const ok = await beforeConfirm();
      if (!ok) return;
    }
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
      <div className="relative">
        {!ready && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        )}
        <PaymentElement
          options={{ layout: "tabs" }}
          onReady={() => setReady(true)}
          onChange={(e) => setComplete(e.complete)}
        />
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden>🔒</span>
        <span>Paiement sécurisé par</span>
        <span className="font-bold tracking-tight" style={{ color: "#635BFF" }}>Stripe</span>
      </div>
      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Press
        type="submit"
        disabled={!stripe || busy || !ready || !complete || disabled}
        className="mt-1 w-full rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="mx-auto animate-spin" size={18} /> : t("pay.payNow", { total: totalLabel })}
      </Press>
    </form>
  );
}

