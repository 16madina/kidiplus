// POST /api/public/paypal-webhook
// --------------------------------
// PayPal webhook receiver — supports BOTH sandbox and live in one endpoint.
// PayPal's environment is inferred from the current PAYPAL_MODE server config.
// Signature is verified via PayPal's /v1/notifications/verify-webhook-signature
// API using PAYPAL_WEBHOOK_ID_SANDBOX / PAYPAL_WEBHOOK_ID_LIVE.
//
// Handled events (idempotent):
//   PAYMENT.CAPTURE.COMPLETED         → credit wallet (top-up safety net)
//   PAYMENT.CAPTURE.DENIED/REFUNDED/REVERSED → log only
//   PAYMENT.PAYOUTS-ITEM.SUCCEEDED    → mark payout paid
//   PAYMENT.PAYOUTS-ITEM.FAILED/DENIED/RETURNED/BLOCKED/REFUNDED → mark failed
//   PAYMENT.PAYOUTSBATCH.DENIED       → mark payout failed
//
// Public route (bypasses auth) — security = PayPal signature verification.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getPaypalAccessToken, getPaypalConfig } from "@/lib/paypal.server";
import { convertMoney } from "@/lib/money";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function verifyPaypalSignature(
  base: string,
  token: string,
  webhookId: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const payload = {
    auth_algo: headers.get("paypal-auth-algo") ?? "",
    cert_url: headers.get("paypal-cert-url") ?? "",
    transmission_id: headers.get("paypal-transmission-id") ?? "",
    transmission_sig: headers.get("paypal-transmission-sig") ?? "",
    transmission_time: headers.get("paypal-transmission-time") ?? "",
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  };
  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return false;
  try {
    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500);
        }

        const cfg = getPaypalConfig();
        if (!cfg.ok) return json({ error: "paypal_not_configured" }, 503);

        // Pick the webhook id matching the current PayPal mode.
        const webhookId =
          cfg.cfg.mode === "live"
            ? (process.env.PAYPAL_WEBHOOK_ID_LIVE ?? "").trim()
            : (process.env.PAYPAL_WEBHOOK_ID_SANDBOX ?? "").trim();
        if (!webhookId) {
          console.error("[paypal-webhook] no webhook id configured for mode", cfg.cfg.mode);
          return json({ error: "webhook_id_missing" }, 503);
        }

        const rawBody = await request.text();

        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) {
          console.error("[paypal-webhook] OAuth failed:", tk.error);
          return json({ error: "oauth_failed" }, 502);
        }

        const verified = await verifyPaypalSignature(
          cfg.cfg.base,
          tk.token,
          webhookId,
          request.headers,
          rawBody,
        );
        if (!verified) {
          console.error("[paypal-webhook] signature verification FAILED", {
            mode: cfg.cfg.mode,
            id: request.headers.get("paypal-transmission-id"),
          });
          return new Response("invalid signature", { status: 401 });
        }

        let event: {
          id?: string;
          event_type?: string;
          resource_type?: string;
          resource?: Record<string, unknown>;
        };
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const type = String(event.event_type ?? "");
        const resource = (event.resource ?? {}) as Record<string, unknown>;
        console.log("[paypal-webhook]", type, "id:", event.id);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        try {
          // ================= TOP-UP CAPTURES =================
          if (type === "PAYMENT.CAPTURE.COMPLETED") {
            const captureId = String((resource as { id?: string }).id ?? "");
            const customId = String((resource as { custom_id?: string }).custom_id ?? "");
            const amountVal = Number(
              (resource as { amount?: { value?: string } }).amount?.value ?? "0",
            );
            const currency = String(
              (resource as { amount?: { currency_code?: string } }).amount?.currency_code ?? "",
            ).toUpperCase();

            // custom_id shapes:
            //   "topup:<userId>:<invoiceId>"                 → same-currency
            //   "topup:<userId>:<invoiceId>:xof:<xofAmount>" → bridged XOF→EUR
            const parts = customId.split(":");
            if (parts[0] !== "topup" || !parts[1] || !captureId) {
              return json({ received: true, ignored: "not_a_topup_capture" }, 200);
            }
            const userId = parts[1];
            const isBridgedXof = parts[3] === "xof";
            const bridgedXofAmount = isBridgedXof ? Number(parts[4]) : 0;

            const { data: wallet } = await admin
              .from("wallets")
              .select("currency")
              .eq("user_id", userId)
              .maybeSingle();
            const walletCur = String(wallet?.currency ?? "EUR").toUpperCase();

            let creditAmount = amountVal;
            if (isBridgedXof) {
              if (walletCur !== "XOF" || !Number.isFinite(bridgedXofAmount) || bridgedXofAmount <= 0) {
                console.error("[paypal-webhook] bridge mismatch", { customId, walletCur });
                return json({ received: true, ignored: "bridge_mismatch" }, 200);
              }
              const expectedEur = convertMoney(bridgedXofAmount, "XOF", "EUR");
              if (Math.abs(expectedEur - amountVal) > 0.02 || currency !== "EUR") {
                console.error("[paypal-webhook] bridged EUR mismatch", { expectedEur, amountVal });
                return json({ received: true, ignored: "amount_mismatch" }, 200);
              }
              creditAmount = bridgedXofAmount;
            } else if (walletCur !== currency) {
              console.error("[paypal-webhook] currency mismatch", { walletCur, currency });
              return json({ received: true, ignored: "currency_mismatch" }, 200);
            }

            const { error: rpcErr } = await admin.rpc("credit_wallet_topup", {
              _user_id: userId,
              _amount: creditAmount,
              _payment_intent_id: `paypal:${captureId}`,
            });
            if (rpcErr) console.error("[paypal-webhook] credit_wallet_topup error:", rpcErr.message);
            return json({ received: true }, 200);
          }

          // ================= PAYOUTS (single item) =================
          if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
            // sender_item_id and sender_batch_id are both set to our payout row id.
            const senderItemId = String(
              (resource as { sender_item_id?: string }).sender_item_id ?? "",
            );
            const transactionStatus = String(
              (resource as { transaction_status?: string }).transaction_status ?? "",
            ).toUpperCase();
            const errors = (resource as { errors?: { name?: string; message?: string } }).errors;

            if (!senderItemId) {
              return json({ received: true, ignored: "no_sender_item_id" }, 200);
            }

            // Success events → SUCCESS. Any other terminal event → failed.
            const isSuccess = type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" && transactionStatus === "SUCCESS";
            const isTerminal =
              type === "PAYMENT.PAYOUTS-ITEM.FAILED" ||
              type === "PAYMENT.PAYOUTS-ITEM.DENIED" ||
              type === "PAYMENT.PAYOUTS-ITEM.RETURNED" ||
              type === "PAYMENT.PAYOUTS-ITEM.BLOCKED" ||
              type === "PAYMENT.PAYOUTS-ITEM.REFUNDED";

            if (isSuccess) {
              const { error: uerr } = await admin
                .from("payouts")
                .update({
                  status: "paid",
                  processed_at: new Date().toISOString(),
                  paypal_error: null,
                })
                .eq("id", senderItemId)
                .neq("status", "paid");
              if (uerr) console.error("[paypal-webhook] payout update SUCCESS err:", uerr.message);
            } else if (isTerminal) {
              const errMsg = errors
                ? `${errors.name ?? type}: ${errors.message ?? ""}`.trim()
                : `${type} (${transactionStatus})`;
              const { error: uerr } = await admin
                .from("payouts")
                .update({
                  status: "failed",
                  paypal_error: errMsg.slice(0, 500),
                })
                .eq("id", senderItemId)
                .not("status", "in", "(paid,failed)");
              if (uerr) console.error("[paypal-webhook] payout update FAIL err:", uerr.message);
            }
            return json({ received: true }, 200);
          }

          // ================= PAYOUT BATCH (whole batch denied/cancelled) =================
          if (
            type === "PAYMENT.PAYOUTSBATCH.DENIED" ||
            type === "PAYMENT.PAYOUTSBATCH.PROCESSING" ||
            type === "PAYMENT.PAYOUTSBATCH.SUCCESS"
          ) {
            const senderBatchId = String(
              ((resource as { batch_header?: { sender_batch_header?: { sender_batch_id?: string } } })
                .batch_header?.sender_batch_header?.sender_batch_id ?? ""),
            );
            if (senderBatchId && type === "PAYMENT.PAYOUTSBATCH.DENIED") {
              await admin
                .from("payouts")
                .update({ status: "failed", paypal_error: "BATCH_DENIED" })
                .eq("id", senderBatchId)
                .not("status", "in", "(paid,failed)");
            }
            return json({ received: true }, 200);
          }

          // Dispute / refund events — log only for now.
          if (
            type === "PAYMENT.CAPTURE.REFUNDED" ||
            type === "PAYMENT.CAPTURE.REVERSED" ||
            type === "PAYMENT.CAPTURE.DENIED" ||
            type.startsWith("CUSTOMER.DISPUTE.")
          ) {
            console.log("[paypal-webhook] noted", type, event.id);
            return json({ received: true }, 200);
          }

          // Any other event: acknowledge and move on.
          return json({ received: true, ignored: type }, 200);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[paypal-webhook] handler error:", msg);
          // Return 200 so PayPal doesn't retry forever on transient DB blips.
          return json({ received: true, error: msg }, 200);
        }
      },
    },
  },
});
