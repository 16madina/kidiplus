// PayDunya helper — server-only.
// Handles mobile-money pay-in (Wave / Orange Money / card) via the
// Checkout Invoice API, and pay-out (disbursement) via the Disburse API.
//
// Env:
//   PAYDUNYA_MODE          "test" (default) | "live"
//   PAYDUNYA_MASTER_KEY
//   PAYDUNYA_PRIVATE_KEY   (test_private_... / live_private_...)
//   PAYDUNYA_PUBLIC_KEY    (test_public_...  / live_public_...)
//   PAYDUNYA_TOKEN

export type PaydunyaMode = "test" | "live";

export type PaydunyaConfig = {
  mode: PaydunyaMode;
  base: string;
  masterKey: string;
  privateKey: string;
  publicKey: string;
  token: string;
};

const LIVE_BASE = "https://app.paydunya.com/api/v1";
const TEST_BASE = "https://app.paydunya.com/sandbox-api/v1";

export function getPaydunyaConfig():
  | { ok: true; cfg: PaydunyaConfig }
  | { ok: false; reason: string } {
  const mode: PaydunyaMode =
    (process.env.PAYDUNYA_MODE ?? "test").trim().toLowerCase() === "live" ? "live" : "test";
  const masterKey = (process.env.PAYDUNYA_MASTER_KEY ?? "").trim();
  const privateKey = (process.env.PAYDUNYA_PRIVATE_KEY ?? "").trim();
  const publicKey = (process.env.PAYDUNYA_PUBLIC_KEY ?? "").trim();
  const token = (process.env.PAYDUNYA_TOKEN ?? "").trim();
  if (!masterKey || !privateKey || !token) {
    return { ok: false, reason: "paydunya_not_configured" };
  }
  return {
    ok: true,
    cfg: {
      mode,
      base: mode === "live" ? LIVE_BASE : TEST_BASE,
      masterKey,
      privateKey,
      publicKey,
      token,
    },
  };
}

function headers(cfg: PaydunyaConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "PAYDUNYA-MASTER-KEY": cfg.masterKey,
    "PAYDUNYA-PRIVATE-KEY": cfg.privateKey,
    "PAYDUNYA-PUBLIC-KEY": cfg.publicKey,
    "PAYDUNYA-TOKEN": cfg.token,
  };
}

/** PayDunya settles in XOF only. */
export const PAYDUNYA_CURRENCY = "XOF";

/** Mobile-money channels we expose to users. */
export type PaydunyaChannel = "wave" | "orange_money" | "card";

/** PayDunya `disburse` withdraw modes, per channel + country. */
export function withdrawModeFor(channel: Exclude<PaydunyaChannel, "card">, country: string): string {
  const c = (country || "SN").toUpperCase();
  if (channel === "wave") return c === "CI" ? "wave-ci" : "wave-senegal";
  return c === "CI" ? "orange-money-ci" : "orange-money-senegal";
}

async function post(
  cfg: PaydunyaConfig,
  path: string,
  body: unknown,
): Promise<{ status: number; data: any; text: string }> {
  const res = await fetch(`${cfg.base}${path}`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { status: res.status, data, text };
}

// ---------------------------------------------------------------- pay-in ----

export type CreateInvoiceResult =
  | { ok: true; token: string; checkoutUrl: string }
  | { ok: false; error: string; detail?: string };

/**
 * Creates a hosted PayDunya checkout invoice. The buyer is redirected to
 * `checkoutUrl` and picks Wave / Orange Money / card there.
 */
export async function createPaydunyaInvoice(
  cfg: PaydunyaConfig,
  args: {
    amountXof: number;
    description: string;
    itemName: string;
    returnUrl: string;
    cancelUrl: string;
    callbackUrl: string;
    channel?: PaydunyaChannel;
    customData: Record<string, string>;
  },
): Promise<CreateInvoiceResult> {
  const amount = Math.round(args.amountXof);
  const channels =
    args.channel === "wave"
      ? ["wave-senegal", "wave-ci"]
      : args.channel === "orange_money"
        ? ["orange-money-senegal", "orange-money-ci"]
        : args.channel === "card"
          ? ["card"]
          : undefined;

  const body: Record<string, unknown> = {
    invoice: {
      total_amount: amount,
      description: args.description,
      items: {
        item_0: {
          name: args.itemName,
          quantity: 1,
          unit_price: String(amount),
          total_price: String(amount),
          description: args.description,
        },
      },
    },
    store: { name: "KiDi+", website_url: "https://kidiplus.com" },
    custom_data: args.customData,
    actions: {
      cancel_url: args.cancelUrl,
      return_url: args.returnUrl,
      callback_url: args.callbackUrl,
    },
  };
  if (channels) (body as any).channels = channels;

  const { status, data, text } = await post(cfg, "/checkout-invoice/create", body);
  if (status < 200 || status >= 300) {
    return { ok: false, error: `paydunya_http_${status}`, detail: text.slice(0, 300) };
  }
  if (data?.response_code !== "00" || !data?.token) {
    return {
      ok: false,
      error: "paydunya_invoice_refused",
      detail: String(data?.response_text ?? text).slice(0, 300),
    };
  }
  return { ok: true, token: String(data.token), checkoutUrl: String(data.response_text) };
}

export type InvoiceStatus = "pending" | "completed" | "cancelled" | "failed";

export type ConfirmInvoiceResult =
  | {
      ok: true;
      status: InvoiceStatus;
      amount: number;
      customData: Record<string, unknown>;
      receiptUrl: string | null;
      raw: unknown;
    }
  | { ok: false; error: string; detail?: string };

export async function confirmPaydunyaInvoice(
  cfg: PaydunyaConfig,
  invoiceToken: string,
): Promise<ConfirmInvoiceResult> {
  const res = await fetch(`${cfg.base}/checkout-invoice/confirm/${encodeURIComponent(invoiceToken)}`, {
    method: "GET",
    headers: headers(cfg),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "paydunya_bad_json", detail: text.slice(0, 200) };
  }
  if (!res.ok) return { ok: false, error: `paydunya_http_${res.status}`, detail: text.slice(0, 300) };

  const rawStatus = String(data?.status ?? "").toLowerCase();
  const status: InvoiceStatus =
    rawStatus === "completed"
      ? "completed"
      : rawStatus === "cancelled" || rawStatus === "canceled"
        ? "cancelled"
        : rawStatus === "failed"
          ? "failed"
          : "pending";
  return {
    ok: true,
    status,
    amount: Number(data?.invoice?.total_amount ?? 0),
    customData: (data?.custom_data ?? {}) as Record<string, unknown>,
    receiptUrl: (data?.receipt_url as string | undefined) ?? null,
    raw: data,
  };
}

// --------------------------------------------------------------- pay-out ----

export type DisburseResult =
  | { ok: true; disburseToken: string; transactionId: string | null; raw: unknown }
  | { ok: false; error: string; detail?: string };

/**
 * Two-step PayDunya disbursement: reserve an invoice, then submit it.
 * `accountAlias` is the recipient's mobile-money number (e.g. 771234567).
 */
export async function paydunyaDisburse(
  cfg: PaydunyaConfig,
  args: {
    accountAlias: string;
    amountXof: number;
    withdrawMode: string;
    callbackUrl?: string;
  },
): Promise<DisburseResult> {
  const amount = Math.round(args.amountXof);
  const alias = args.accountAlias.replace(/[^\d]/g, "");
  if (!alias) return { ok: false, error: "invalid_phone" };

  const get = await post(cfg, "/disburse/get-invoice", {
    account_alias: alias,
    amount,
    withdraw_mode: args.withdrawMode,
    callback_url: args.callbackUrl,
  });
  if (get.data?.response_code !== "00" || !get.data?.disburse_token) {
    return {
      ok: false,
      error: "disburse_invoice_refused",
      detail: String(get.data?.response_text ?? get.text).slice(0, 300),
    };
  }
  const disburseToken = String(get.data.disburse_token);

  const submit = await post(cfg, "/disburse/submit-invoice", {
    disburse_invoice: disburseToken,
    disburse_id: alias,
  });
  if (submit.data?.response_code !== "00") {
    return {
      ok: false,
      error: "disburse_failed",
      detail: String(submit.data?.response_text ?? submit.text).slice(0, 300),
    };
  }
  return {
    ok: true,
    disburseToken,
    transactionId: (submit.data?.transaction_id as string | undefined) ?? null,
    raw: submit.data,
  };
}

/** PayDunya IPN authenticity: sha512(master_key) must equal the posted hash. */
export async function verifyPaydunyaHash(cfg: PaydunyaConfig, hash: string): Promise<boolean> {
  if (!hash) return false;
  const bytes = new TextEncoder().encode(cfg.masterKey);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.toLowerCase() === hash.trim().toLowerCase();
}
