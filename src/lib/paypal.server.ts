// PayPal Payouts API helper — server-only.
// Reads PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE from env.
// Mode: "sandbox" (default) or "live".

export type PaypalConfig = {
  clientId: string;
  clientSecret: string;
  base: string;
  mode: "sandbox" | "live";
};

export function getPaypalConfig(): { ok: true; cfg: PaypalConfig } | { ok: false; reason: string } {
  const clientId = (process.env.PAYPAL_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET ?? "").trim();
  const mode = ((process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox") as
    | "live"
    | "sandbox";
  if (!clientId || !clientSecret) return { ok: false, reason: "paypal_not_configured" };
  const base = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  return { ok: true, cfg: { clientId, clientSecret, base, mode } };
}

/** PayPal supports these currencies for Payouts. XOF is NOT supported. */
export const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "CAD", "GBP", "AUD", "CHF", "DKK", "NOK", "SEK", "JPY",
  "HKD", "SGD", "NZD", "MXN", "PLN", "CZK", "HUF", "ILS", "PHP", "TWD",
  "THB", "BRL",
]);

export async function getPaypalAccessToken(cfg: PaypalConfig): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  // btoa is available on Workers; Buffer is not always polyfilled.
  const auth = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const res = await fetch(`${cfg.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `paypal_oauth_${res.status}: ${text.slice(0, 200)}` };
  try {
    const data = JSON.parse(text) as { access_token?: string };
    if (!data.access_token) return { ok: false, error: "paypal_oauth_no_token" };
    return { ok: true, token: data.access_token };
  } catch {
    return { ok: false, error: "paypal_oauth_bad_json" };
  }
}

export type CreatePayoutResult =
  | {
      ok: true;
      batchId: string;
      batchStatus: string;
      raw: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export async function createPaypalPayout(
  cfg: PaypalConfig,
  token: string,
  args: {
    senderBatchId: string;
    receiverEmail: string;
    amount: string; // string with 2 decimals
    currency: string;
    note?: string;
  },
): Promise<CreatePayoutResult> {
  const body = {
    sender_batch_header: {
      sender_batch_id: args.senderBatchId,
      email_subject: "Retrait KiDi+",
      email_message: "Ton retrait KiDi+ a été envoyé via PayPal.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: args.amount, currency: args.currency },
        receiver: args.receiverEmail,
        note: args.note ?? "Retrait KiDi+",
        sender_item_id: args.senderBatchId,
      },
    ],
  };

  const res = await fetch(`${cfg.base}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  if (!res.ok) {
    return { ok: false, error: mapPaypalError(res.status, parsed, text), raw: parsed ?? text };
  }
  const batchId = parsed?.batch_header?.payout_batch_id as string | undefined;
  const batchStatus = (parsed?.batch_header?.batch_status as string | undefined) ?? "PENDING";
  if (!batchId) return { ok: false, error: "paypal_no_batch_id", raw: parsed };
  return { ok: true, batchId, batchStatus, raw: parsed };
}

export type PayoutStatusResult =
  | {
      ok: true;
      batchStatus: string; // PENDING | PROCESSING | SUCCESS | DENIED | CANCELED
      itemStatus: string | null; // SUCCESS | FAILED | UNCLAIMED | RETURNED | ONHOLD | BLOCKED | REFUNDED | REVERSED | PENDING
      errors: string | null;
      raw: unknown;
    }
  | { ok: false; error: string };

export async function getPaypalPayoutStatus(
  cfg: PaypalConfig,
  token: string,
  batchId: string,
): Promise<PayoutStatusResult> {
  const res = await fetch(`${cfg.base}/v1/payments/payouts/${encodeURIComponent(batchId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) return { ok: false, error: `paypal_status_${res.status}: ${text.slice(0, 200)}` };
  const batchStatus = parsed?.batch_header?.batch_status as string | undefined;
  const item = Array.isArray(parsed?.items) && parsed.items.length > 0 ? parsed.items[0] : null;
  const itemStatus = (item?.transaction_status as string | undefined) ?? null;
  const errName = item?.errors?.name as string | undefined;
  const errMsg = item?.errors?.message as string | undefined;
  return {
    ok: true,
    batchStatus: batchStatus ?? "PENDING",
    itemStatus,
    errors: errName ? `${errName}: ${errMsg ?? ""}`.trim() : null,
    raw: parsed,
  };
}

/** Extract PayPal `details[0].issue` from an error body. */
export function paypalIssueCode(parsed: unknown): string {
  const details = Array.isArray((parsed as { details?: unknown })?.details)
    ? (parsed as { details: Array<{ issue?: string }> }).details
    : [];
  return (details[0]?.issue ?? "").toUpperCase();
}

/** Map a raw PayPal HTTP error to a French user-facing message. */
export function mapPaypalError(status: number, parsed: any, raw: string): string {
  const name = parsed?.name as string | undefined;
  const details = Array.isArray(parsed?.details) ? parsed.details : [];
  const issue = (details[0]?.issue as string | undefined) ?? "";
  const description = (details[0]?.description as string | undefined) ?? "";
  const msg = (parsed?.message as string | undefined) ?? raw.slice(0, 200);
  const issueU = issue.toUpperCase();

  if (status === 401) return "Identifiants PayPal invalides (vérifier PAYPAL_CLIENT_ID / _SECRET / _MODE).";
  if (status === 403) return "Compte PayPal non autorisé (vérifier les permissions de l'app REST).";
  if (name === "INSUFFICIENT_FUNDS" || issueU === "INSUFFICIENT_FUNDS" || /insufficient/i.test(msg)) {
    return "Solde PayPal insuffisant sur le compte émetteur.";
  }
  if (issueU === "ORDER_NOT_APPROVED") {
    return "Le paiement n'a pas été approuvé sur PayPal. Recommence la recharge et valide jusqu'au bout.";
  }
  if (issueU === "ORDER_ALREADY_CAPTURED") {
    return "Ce paiement PayPal a déjà été capturé.";
  }
  if (issueU === "DUPLICATE_INVOICE_ID") {
    return "Identifiant de facture PayPal en doublon. Réessaie.";
  }
  if (issueU === "INSTRUMENT_DECLINED" || issueU === "PAYER_CANNOT_PAY") {
    return "PayPal a refusé le moyen de paiement. Essaie un autre compte ou carte sandbox.";
  }
  if (issueU === "CURRENCY_NOT_SUPPORTED" || issueU === "CURRENCY_NOT_SUPPORTED_FOR_RECEIVER" || issueU === "CURRENCY_NOT_SUPPORTED_FOR_COUNTRY") {
    return "Devise non supportée par ce compte PayPal (EUR/CAD requis en sandbox Business).";
  }
  if (issueU === "PAYEE_ACCOUNT_RESTRICTED" || issueU === "PAYEE_ACCOUNT_LOCKED_OR_CLOSED") {
    return "Le compte Business PayPal destinataire est restreint. Vérifie le sandbox Business.";
  }
  if (name === "VALIDATION_ERROR" || status === 400) {
    if (/email/i.test(msg) || issueU === "RECEIVER_UNREGISTERED" || issueU === "RECEIVER_EMAIL_INVALID") {
      return "Email PayPal invalide.";
    }
    return `Erreur de validation PayPal: ${description || msg}`;
  }
  if (status === 422 || name === "UNPROCESSABLE_ENTITY") {
    const hint = description || issue || msg;
    return `Erreur PayPal 422${issue ? ` (${issue})` : ""}: ${hint}`;
  }
  return `Erreur PayPal (${status}): ${msg}`;
}

/** Interpret a PayPal item status into a domain outcome. */
export function classifyItemStatus(itemStatus: string | null, batchStatus: string): {
  outcome: "success" | "processing" | "failed" | "unclaimed";
  message: string;
} {
  const s = (itemStatus ?? "").toUpperCase();
  const b = batchStatus.toUpperCase();
  if (s === "SUCCESS") return { outcome: "success", message: "Payé via PayPal API" };
  if (s === "UNCLAIMED") return { outcome: "unclaimed", message: "Cet email n'a pas de compte PayPal (paiement non réclamé)." };
  if (s === "FAILED" || s === "RETURNED" || s === "BLOCKED" || s === "REFUNDED" || s === "REVERSED" || b === "DENIED" || b === "CANCELED") {
    return { outcome: "failed", message: `Échec PayPal (${s || b}).` };
  }
  return { outcome: "processing", message: "En cours de traitement chez PayPal." };
}

// ============================================================================
// PayPal Orders API v2 — used for BUYER top-ups (wallet recharge).
// ============================================================================

/** Currencies we support for PayPal top-ups. PayPal doesn't support XOF. */
export const PAYPAL_TOPUP_CURRENCIES = new Set(["EUR", "CAD", "USD"]);

export type CreatePaypalOrderResult =
  | {
      ok: true;
      orderId: string;
      approveUrl: string | null;
      status: string;
      raw: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export async function createPaypalOrder(
  cfg: PaypalConfig,
  token: string,
  args: {
    amount: string;            // 2-decimal string
    currency: string;          // EUR / CAD / USD
    customId: string;          // e.g. "topup:<userId>:<uuid>"
    returnUrl: string;
    cancelUrl: string;
    invoiceId?: string;        // idempotency at PayPal side
    description?: string;
  },
): Promise<CreatePaypalOrderResult> {
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "default",
        custom_id: args.customId,
        invoice_id: args.invoiceId ?? args.customId,
        description: args.description ?? "KiDi+ Recharge portefeuille",
        amount: { currency_code: args.currency, value: args.amount },
      },
    ],
    application_context: {
      brand_name: "KiDi+",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: args.returnUrl,
      cancel_url: args.cancelUrl,
    },
  };

  const res = await fetch(`${cfg.base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      // PayPal-Request-Id enables idempotent retries on the create call.
      "PayPal-Request-Id": args.invoiceId ?? args.customId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  if (!res.ok) {
    return { ok: false, error: mapPaypalError(res.status, parsed, text), raw: parsed ?? text };
  }
  const orderId = parsed?.id as string | undefined;
  const status = (parsed?.status as string | undefined) ?? "CREATED";
  const links = Array.isArray(parsed?.links) ? parsed.links : [];
  const approve = links.find((l: any) => l?.rel === "approve" || l?.rel === "payer-action");
  const approveUrl = (approve?.href as string | undefined) ?? null;
  if (!orderId) return { ok: false, error: "paypal_no_order_id", raw: parsed };
  return { ok: true, orderId, approveUrl, status, raw: parsed };
}

export type CapturePaypalOrderResult =
  | {
      ok: true;
      captureId: string;
      status: string;          // COMPLETED expected
      amount: string;
      currency: string;
      customId: string | null;
      payerEmail: string | null;
      raw: unknown;
      alreadyCaptured?: boolean;
    }
  | { ok: false; error: string; alreadyCaptured?: boolean; raw?: unknown };

function parseCaptureFromOrder(parsed: any, alreadyCaptured = false): CapturePaypalOrderResult {
  const pu = Array.isArray(parsed?.purchase_units) ? parsed.purchase_units[0] : null;
  const cap = pu?.payments?.captures?.[0] ?? null;
  const captureId = cap?.id as string | undefined;
  if (!captureId) return { ok: false, error: "paypal_no_capture_id", raw: parsed };
  return {
    ok: true,
    captureId,
    status: (cap?.status as string | undefined) ?? (parsed?.status as string | undefined) ?? "COMPLETED",
    amount: (cap?.amount?.value as string | undefined) ?? "",
    currency: (cap?.amount?.currency_code as string | undefined) ?? "",
    customId: (cap?.custom_id as string | undefined) ?? (pu?.custom_id as string | undefined) ?? null,
    payerEmail: (parsed?.payer?.email_address as string | undefined) ?? null,
    raw: parsed,
    ...(alreadyCaptured ? { alreadyCaptured: true } : {}),
  };
}

/**
 * Capture a PayPal order safely:
 * 1) GET status first — if already COMPLETED, reuse the capture (no 422).
 * 2) Only POST /capture when status is APPROVED.
 * 3) Do NOT send a sticky PayPal-Request-Id on capture: a prior failed capture
 *    with the same id would keep returning the same 422 forever.
 */
export async function capturePaypalOrder(
  cfg: PaypalConfig,
  token: string,
  orderId: string,
): Promise<CapturePaypalOrderResult> {
  const existing = await getPaypalOrderRaw(cfg, token, orderId);
  if (!existing.ok) return existing;

  const status = String(existing.orderStatus ?? "").toUpperCase();
  if (status === "COMPLETED") {
    const parsed = parseCaptureFromOrder(existing.raw, true);
    if (parsed.ok) return parsed;
  }
  if (
    status === "CREATED" ||
    status === "PAYER_ACTION_REQUIRED" ||
    status === "PENDING_APPROVAL"
  ) {
    return {
      ok: false,
      error: mapPaypalError(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "Order not approved",
        details: [{ issue: "ORDER_NOT_APPROVED", description: `Statut ordre: ${status}` }],
      }, ""),
      raw: existing.raw,
    };
  }

  const res = await fetch(`${cfg.base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: "{}",
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  if (!res.ok) {
    const issue = paypalIssueCode(parsed);
    // ORDER_ALREADY_CAPTURED → re-fetch the order to recover capture details.
    if (issue === "ORDER_ALREADY_CAPTURED") {
      const fetched = await getPaypalOrder(cfg, token, orderId);
      if (fetched.ok) return { ...fetched, alreadyCaptured: true };
    }
    console.error("[paypal] capture_failed", {
      orderId,
      status: res.status,
      issue,
      body: text.slice(0, 800),
    });
    return { ok: false, error: mapPaypalError(res.status, parsed, text), raw: parsed ?? text };
  }

  return parseCaptureFromOrder(parsed);
}

type PaypalOrderRawOk = { ok: true; orderStatus: string; raw: unknown };
type PaypalOrderRawErr = { ok: false; error: string; raw?: unknown };

async function getPaypalOrderRaw(
  cfg: PaypalConfig,
  token: string,
  orderId: string,
): Promise<PaypalOrderRawOk | PaypalOrderRawErr> {
  const res = await fetch(`${cfg.base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) return { ok: false, error: mapPaypalError(res.status, parsed, text), raw: parsed ?? text };
  return {
    ok: true,
    orderStatus: String(parsed?.status ?? ""),
    raw: parsed,
  };
}

/** GET an existing order (used to recover if capture returns ORDER_ALREADY_CAPTURED). */
export async function getPaypalOrder(
  cfg: PaypalConfig,
  token: string,
  orderId: string,
): Promise<CapturePaypalOrderResult> {
  const raw = await getPaypalOrderRaw(cfg, token, orderId);
  if (!raw.ok) return raw;
  return parseCaptureFromOrder(raw.raw, true);
}

