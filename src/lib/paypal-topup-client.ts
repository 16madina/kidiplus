// Client-side helper for the PayPal wallet-top-up flow.
// - createPaypalTopup: authenticated POST that returns { orderId, approveUrl }.
// - capturePaypalTopup: called after the user returns from PayPal approval.
// A pending order id is stashed in localStorage so an interrupted flow
// (page reload, app kill during native browser session) can be resumed.

import { supabase } from "@/integrations/supabase/client";

const PENDING_KEY = "kidi:pendingPaypalTopupOrder";

export function markPendingPaypalOrder(orderId: string) {
  try { localStorage.setItem(PENDING_KEY, orderId); } catch { /* ignore */ }
}
export function readPendingPaypalOrder(): string | null {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
}
export function clearPendingPaypalOrder() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type CreatePaypalTopupResult =
  | {
      ok: true;
      orderId: string;
      approveUrl: string | null;
      amount: number;             // wallet currency amount (what gets credited)
      currency: string;           // wallet currency
      chargedAmount: number;      // amount PayPal charges
      chargedCurrency: string;    // currency PayPal charges (EUR bridge for XOF)
      fxRate: number;             // wallet → wire rate (1 when same currency)
      mode: "sandbox" | "live";
    }
  | { ok: false; error: string; message?: string };

export async function createPaypalTopup(amount: number): Promise<CreatePaypalTopupResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch("/api/paypal-topup/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      orderId: String(body.orderId),
      approveUrl: body.approveUrl ?? null,
      amount: Number(body.amount),
      currency: String(body.currency),
      chargedAmount: Number(body.chargedAmount ?? body.amount),
      chargedCurrency: String(body.chargedCurrency ?? body.currency),
      fxRate: Number(body.fxRate ?? 1),
      mode: body.mode === "live" ? "live" : "sandbox",
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

export type CapturePaypalTopupResult =
  | { ok: true; balance: number; amount: number; currency: string; captureId: string; duplicate: boolean }
  | { ok: false; error: string; message?: string };

export async function capturePaypalTopup(orderId: string): Promise<CapturePaypalTopupResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch("/api/paypal-topup/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      balance: Number(body.balance ?? 0),
      amount: Number(body.amount ?? 0),
      currency: String(body.currency ?? ""),
      captureId: String(body.captureId ?? ""),
      duplicate: !!body.duplicate,
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Map a raw error code from the topup endpoints to a French user-facing message. */
export function mapPaypalTopupError(code: string, fallback?: string): string {
  switch (code) {
    case "not_signed_in": return "Connecte-toi pour recharger ton portefeuille.";
    case "paypal_not_configured": return "PayPal n'est pas encore configuré côté serveur.";
    case "currency_not_supported": return "PayPal ne supporte pas cette devise — utilise la carte bancaire.";
    case "invalid_amount": return "Montant invalide.";
    case "daily_limit": return "Plafond de recharge quotidien atteint.";
    case "account_banned":
    case "account_suspended":
    case "risk_restricted": return "Ton compte ne peut pas recharger pour le moment.";
    case "paypal_oauth_failed": return "Impossible de contacter PayPal. Réessaie dans un instant.";
    case "paypal_create_failed": return fallback || "PayPal a refusé la commande. Réessaie.";
    case "paypal_capture_failed": return fallback || "PayPal n'a pas pu finaliser le paiement.";
    case "not_completed": return "Le paiement PayPal n'a pas été finalisé.";
    case "forbidden": return "Cette commande PayPal n'appartient pas à ce compte.";
    case "currency_mismatch": return "La devise du paiement ne correspond pas à ton portefeuille.";
    case "network": return "Réseau indisponible. Vérifie ta connexion.";
    case "cancelled": return "Paiement annulé.";
    default: return fallback || "Erreur PayPal. Réessaie.";
  }
}
