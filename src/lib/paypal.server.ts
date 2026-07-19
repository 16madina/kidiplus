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
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
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

/** Map a raw PayPal HTTP error to a French user-facing message. */
export function mapPaypalError(status: number, parsed: any, raw: string): string {
  const name = parsed?.name as string | undefined;
  const details = Array.isArray(parsed?.details) ? parsed.details : [];
  const issue = (details[0]?.issue as string | undefined) ?? "";
  const msg = (parsed?.message as string | undefined) ?? raw.slice(0, 200);

  if (status === 401) return "Identifiants PayPal invalides (vérifier PAYPAL_CLIENT_ID / _SECRET / _MODE).";
  if (status === 403) return "Compte PayPal non autorisé à effectuer des Payouts (activer Payouts sur le compte business).";
  if (name === "INSUFFICIENT_FUNDS" || issue === "INSUFFICIENT_FUNDS" || /insufficient/i.test(msg)) {
    return "Solde PayPal insuffisant sur le compte émetteur.";
  }
  if (name === "VALIDATION_ERROR" || status === 400) {
    if (/currency/i.test(msg) || issue === "CURRENCY_NOT_SUPPORTED_FOR_RECEIVER" || issue === "CURRENCY_NOT_SUPPORTED_FOR_COUNTRY") {
      return "Devise non supportée par PayPal pour ce destinataire.";
    }
    if (/email/i.test(msg) || issue === "RECEIVER_UNREGISTERED" || issue === "RECEIVER_EMAIL_INVALID") {
      return "Email PayPal invalide.";
    }
    return `Erreur de validation PayPal: ${msg}`;
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
