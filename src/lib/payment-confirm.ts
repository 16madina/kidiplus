// Client-side helper: verifying Stripe PaymentIntents against our own
// server so wallet credits / order marks don't depend solely on the webhook.
// Keeps a pending PI id in localStorage so a page reload can retry.

import { supabase } from "@/integrations/supabase/client";
import { paymentsEnvHeaders } from "@/lib/stripe-publishable";
import { walletPaymentsEnvHeaders } from "@/lib/force-stripe-test";


const TOPUP_KEY = "kidi:pendingTopupPI";
const ORDER_KEY_PREFIX = "kidi:pendingOrderPI:";

export function markPendingTopup(pi: string) {
  try { localStorage.setItem(TOPUP_KEY, pi); } catch { /* ignore */ }
}
export function readPendingTopup(): string | null {
  try { return localStorage.getItem(TOPUP_KEY); } catch { return null; }
}
export function clearPendingTopup() {
  try { localStorage.removeItem(TOPUP_KEY); } catch { /* ignore */ }
}

export function markPendingOrder(orderId: string, pi: string) {
  try { localStorage.setItem(ORDER_KEY_PREFIX + orderId, pi); } catch { /* ignore */ }
}
export function readPendingOrder(orderId: string): string | null {
  try { return localStorage.getItem(ORDER_KEY_PREFIX + orderId); } catch { return null; }
}
export function clearPendingOrder(orderId: string) {
  try { localStorage.removeItem(ORDER_KEY_PREFIX + orderId); } catch { /* ignore */ }
}

/** Extract "pi_xxx" from a client_secret like "pi_xxx_secret_yyy". */
export function paymentIntentIdFromClientSecret(cs: string): string | null {
  const m = cs.match(/^(pi_[^_]+)_secret_/);
  return m ? m[1] : null;
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postWithRetry(
  url: string,
  paymentIntentId: string,
  envHeaders: Record<string, string> = paymentsEnvHeaders(),
): Promise<{ ok: boolean; body: any; status: number }> {
  const token = await bearer();
  if (!token) return { ok: false, body: { error: "not_signed_in" }, status: 401 };
  let last: { ok: boolean; body: any; status: number } = { ok: false, body: {}, status: 0 };
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...envHeaders },
        body: JSON.stringify({ paymentIntentId }),
      });
      const body = await res.json().catch(() => ({}));
      last = { ok: res.ok && body?.ok === true, body, status: res.status };
      if (last.ok) return last;
      // Retry only on 409 (Stripe eventually-consistent status) or 5xx / network.
      if (res.status !== 409 && res.status < 500) return last;
    } catch (e) {
      last = { ok: false, body: { error: "network" }, status: 0 };
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return last;
}

export type ConfirmTopupResult = { ok: true; balance: number; duplicate: boolean } | { ok: false; error: string };
export async function confirmWalletTopup(pi: string): Promise<ConfirmTopupResult> {
  const r = await postWithRetry("/api/wallet-topup/confirm", pi, walletPaymentsEnvHeaders());
  if (r.ok) return { ok: true, balance: Number(r.body.balance ?? 0), duplicate: !!r.body.duplicate };
  return { ok: false, error: String(r.body?.error ?? `http_${r.status}`) };
}

export type ConfirmOrderResult = { ok: true; orderId: string } | { ok: false; error: string };
export async function confirmOrderPayment(pi: string): Promise<ConfirmOrderResult> {
  const r = await postWithRetry("/api/checkout/confirm", pi);
  if (r.ok) return { ok: true, orderId: String(r.body.orderId) };
  return { ok: false, error: String(r.body?.error ?? `http_${r.status}`) };
}

/** Cancel a leftover Stripe PI after wallet payment (best-effort). */
export async function cancelOrderPaymentIntent(orderId: string): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    await fetch("/api/checkout/cancel-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...paymentsEnvHeaders(),
      },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    /* ignore — webhook refund is the backstop */
  }
}
