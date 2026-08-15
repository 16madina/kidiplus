// Client helper for PayPal commerce-order checkout (not wallet top-up).

import { supabase } from "@/integrations/supabase/client";

const PENDING_KEY = "kidi:pendingPaypalCheckoutOrder";

export function markPendingPaypalCheckout(paypalOrderId: string, kidiOrderId: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ paypalOrderId, kidiOrderId }));
  } catch {
    /* ignore */
  }
}
export function readPendingPaypalCheckout(): { paypalOrderId: string; kidiOrderId: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { paypalOrderId?: string; kidiOrderId?: string };
    if (!parsed?.paypalOrderId || !parsed?.kidiOrderId) return null;
    return { paypalOrderId: parsed.paypalOrderId, kidiOrderId: parsed.kidiOrderId };
  } catch {
    return null;
  }
}
export function clearPendingPaypalCheckout() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type CreatePaypalCheckoutResult =
  | {
      ok: true;
      paypalOrderId: string;
      approveUrl: string | null;
      orderId: string;
      amount: number;
      currency: string;
      chargedAmount: number;
      chargedCurrency: string;
      fxRate: number;
      mode: "sandbox" | "live";
    }
  | { ok: false; error: string; message?: string };

export async function createPaypalCheckout(
  kidiOrderId: string,
  opts?: { native?: boolean },
): Promise<CreatePaypalCheckoutResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch("/api/paypal-checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        orderId: kidiOrderId,
        native: !!opts?.native,
        // Return to the origin the session lives on (avoids landing signed-out).
        returnOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      paypalOrderId: String(body.paypalOrderId),
      approveUrl: body.approveUrl ?? null,
      orderId: String(body.orderId),
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

export type CapturePaypalCheckoutResult =
  | { ok: true; orderId: string; captureId: string; duplicate: boolean }
  | { ok: false; error: string; message?: string };

export async function capturePaypalCheckout(paypalOrderId: string): Promise<CapturePaypalCheckoutResult> {
  const token = await bearer();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/paypal-checkout/capture", {
      method: "POST",
      headers,
      body: JSON.stringify({ paypalOrderId }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: String(body?.error ?? `http_${res.status}`), message: body?.message };
    }
    return {
      ok: true,
      orderId: String(body.orderId ?? ""),
      captureId: String(body.captureId ?? ""),
      duplicate: !!body.duplicate,
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function mapPaypalCheckoutError(code: string, fallback?: string): string {
  switch (code) {
    case "not_signed_in":
    case "unauthorized":
      return "Connecte-toi pour payer avec PayPal.";
    case "paypal_not_configured":
      return "PayPal n'est pas encore configuré côté serveur.";
    case "currency_not_supported":
      return "PayPal ne supporte pas cette devise — utilise la carte ou le portefeuille.";
    case "invalid_amount":
      return "Montant invalide.";
    case "order_not_found":
      return "Commande introuvable.";
    case "order_expired":
      return "Le délai de paiement est dépassé.";
    case "already_paid":
      return "Cette commande est déjà payée.";
    case "order_not_pending":
      return "Cette commande ne peut plus être payée.";
    case "daily_limit":
      return "Plafond de dépenses quotidien atteint.";
    case "paypal_oauth_failed":
      return "Impossible de contacter PayPal. Réessaie dans un instant.";
    case "paypal_create_failed":
      return fallback || "PayPal a refusé la commande. Réessaie.";
    case "paypal_capture_failed":
      return fallback || "PayPal n'a pas pu finaliser le paiement.";
    case "not_completed":
    case "not_approved":
      return "Le paiement PayPal n'a pas été finalisé.";
    case "forbidden":
      return "Cette commande PayPal n'appartient pas à ce compte.";
    case "currency_mismatch":
    case "amount_mismatch":
      return "Le montant PayPal ne correspond pas à la commande.";
    case "network":
      return "Réseau indisponible. Vérifie ta connexion.";
    case "cancelled":
      return "Paiement annulé.";
    default:
      return fallback || "Erreur PayPal. Réessaie.";
  }
}
