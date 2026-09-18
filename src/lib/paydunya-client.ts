// Client-side helper for the PayDunya flows (Wave / Orange Money / card).
// - createPaydunyaTopup: authenticated POST → { invoiceToken, checkoutUrl }.
// - confirmPaydunyaTopup: called while polling / after returning from PayDunya.
// - sendPaydunyaPayout: seller settles their own mobile-money payout row.
// A pending invoice token is stashed in localStorage so an interrupted flow
// (page reload, app kill during native browser session) can be resumed.

import { supabase } from "@/integrations/supabase/client";

const PENDING_KEY = "kidi:pendingPaydunyaTopup";

export function markPendingPaydunya(invoiceToken: string) {
  try { localStorage.setItem(PENDING_KEY, invoiceToken); } catch { /* ignore */ }
}
export function readPendingPaydunya(): string | null {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
}
export function clearPendingPaydunya() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type PaydunyaChannelChoice = "wave" | "orange_money" | "card";

export type CreatePaydunyaTopupResult =
  | { ok: true; invoiceToken: string; checkoutUrl: string; amount: number; currency: string; mode: "test" | "live" }
  | { ok: false; error: string; message?: string };

export async function createPaydunyaTopup(
  amount: number,
  channel: PaydunyaChannelChoice,
  opts?: { native?: boolean },
): Promise<CreatePaydunyaTopupResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch("/api/paydunya-topup/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amount,
        channel,
        native: !!opts?.native,
        returnOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      invoiceToken: String(body.invoiceToken),
      checkoutUrl: String(body.checkoutUrl),
      amount: Number(body.amount),
      currency: String(body.currency ?? "XOF"),
      mode: body.mode === "live" ? "live" : "test",
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

export type ConfirmPaydunyaTopupResult =
  | { ok: true; balance: number; amount: number; currency: string; duplicate: boolean }
  | { ok: false; error: string; message?: string };

export async function confirmPaydunyaTopup(invoiceToken: string): Promise<ConfirmPaydunyaTopupResult> {
  const token = await bearer();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/paydunya-topup/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({ invoiceToken }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      balance: Number(body.balance ?? 0),
      amount: Number(body.amount ?? 0),
      currency: String(body.currency ?? "XOF"),
      duplicate: !!body.duplicate,
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Settle a wave / orange_money payout row with an automated PayDunya disbursement. */
export async function sendPaydunyaPayout(
  payoutId: string,
): Promise<{ ok: true; disburseToken: string } | { ok: false; error: string; message?: string }> {
  const token = await bearer();
  if (!token) return { ok: false, error: "unauthorized" };
  try {
    const res = await fetch("/api/paydunya-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payoutId }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      return { ok: false, error: String(j?.error ?? `http_${res.status}`), message: j?.message };
    }
    return { ok: true, disburseToken: String(j.disburseToken ?? "") };
  } catch (e) {
    const timedOut =
      (e as { name?: string }).name === "TimeoutError" || (e as { name?: string }).name === "AbortError";
    return { ok: false, error: timedOut ? "timeout" : "network_error", message: (e as Error).message };
  }
}

/** Map a raw error code from the PayDunya endpoints to a French user-facing message. */
export function mapPaydunyaError(code: string, fallback?: string): string {
  switch (code) {
    case "not_signed_in":
    case "unauthorized":
      return "Connecte-toi pour continuer.";
    case "paydunya_not_configured": return "Le paiement mobile money n'est pas encore configuré côté serveur.";
    case "currency_not_supported": return "Wave / Orange Money ne fonctionnent qu'avec un portefeuille en FCFA.";
    case "invalid_amount": return "Montant invalide.";
    case "invalid_phone": return "Numéro mobile money manquant ou invalide.";
    case "daily_limit": return "Plafond de recharge quotidien atteint.";
    case "account_banned":
    case "account_suspended":
    case "risk_restricted": return "Ton compte ne peut pas faire cette opération pour le moment.";
    case "paydunya_create_failed":
    case "paydunya_invoice_refused": return fallback || "PayDunya a refusé la demande. Réessaie.";
    case "not_completed": return "Le paiement n'a pas encore été finalisé.";
    case "cancelled": return "Paiement annulé.";
    case "forbidden": return "Cette opération n'appartient pas à ce compte.";
    case "amount_mismatch":
    case "currency_mismatch": return "Le paiement ne correspond pas à la demande. Contacte le support.";
    case "disburse_invoice_refused":
    case "disburse_failed": return fallback || "Le transfert mobile money a échoué. Réessaie.";
    case "timeout":
    case "network":
    case "network_error": return "Réseau indisponible. Vérifie ta connexion.";
    default: return fallback || "Erreur PayDunya. Réessaie.";
  }
}
