// Client-side wrappers around the /api/paypal-payout* server routes.
// Bearer-authenticated as the current user (must be admin server-side).

import { supabase } from "@/integrations/supabase/client";

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type PaypalConfigResponse = { configured: boolean; mode: "sandbox" | "live" | null };

let cachedConfig: PaypalConfigResponse | null = null;
export async function fetchPaypalConfig(): Promise<PaypalConfigResponse> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch("/api/paypal-payout/config", { method: "GET" });
    const j = (await res.json()) as PaypalConfigResponse;
    cachedConfig = j;
    return j;
  } catch {
    return { configured: false, mode: null };
  }
}

export type SendPaypalPayoutResult =
  | { ok: true; batchId: string; batchStatus: string; mode: "sandbox" | "live"; alreadySent?: boolean }
  | { ok: false; error: string; message?: string };

export async function sendPaypalPayout(payoutId: string): Promise<SendPaypalPayoutResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "unauthorized" };
  try {
    const res = await fetch("/api/paypal-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payoutId }),
    });
    const j = (await res.json()) as any;
    if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "unknown", message: j.message };
    return { ok: true, batchId: j.batchId, batchStatus: j.batchStatus ?? "PENDING", mode: j.mode ?? "sandbox", alreadySent: !!j.alreadySent };
  } catch (e) {
    return { ok: false, error: "network_error", message: (e as Error).message };
  }
}

export type PaypalStatusResult =
  | {
      ok: true;
      outcome: "success" | "processing" | "failed" | "unclaimed";
      message: string;
      batchStatus: string;
      itemStatus: string | null;
      errors: string | null;
    }
  | { ok: false; error: string; message?: string };

export async function checkPaypalPayoutStatus(payoutId: string): Promise<PaypalStatusResult> {
  const token = await bearer();
  if (!token) return { ok: false, error: "unauthorized" };
  try {
    const res = await fetch("/api/paypal-payout/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payoutId }),
    });
    const j = (await res.json()) as any;
    if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "unknown", message: j.message };
    return { ok: true, outcome: j.outcome, message: j.message, batchStatus: j.batchStatus, itemStatus: j.itemStatus, errors: j.errors };
  } catch (e) {
    return { ok: false, error: "network_error", message: (e as Error).message };
  }
}
