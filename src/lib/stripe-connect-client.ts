// Client wrappers for /api/connect/* (Stripe Connect Express, Western sellers).

import { supabase } from "@/integrations/supabase/client";
import { paymentsEnvHeaders } from "@/lib/stripe-publishable";
import { isNative } from "@/lib/native";

export type ConnectStatus = "none" | "pending" | "active" | "restricted";

export type ConnectStatusResult =
  | {
      ok: true;
      status: ConnectStatus;
      eligible: boolean;
      currency: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted?: boolean;
      connectUnavailable?: boolean;
      disabledReason?: string | null;
      currentlyDue?: string[];
      pastDue?: string[];
    }
  | { ok: false; error: string; message?: string };

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function post(path: string, body?: unknown): Promise<any> {
  const token = await bearer();
  if (!token) return { error: "unauthorized" };
  const envHeaders = paymentsEnvHeaders();
  if (path === "/api/connect/onboard") {
    console.info("[connect/client] onboarding payments env", envHeaders["X-Payments-Env"]);
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...envHeaders,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    const timedOut =
      (e as { name?: string }).name === "TimeoutError" ||
      (e as { name?: string }).name === "AbortError";
    return {
      error: timedOut ? "timeout" : "network_error",
      message: (e as Error).message,
    };
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok && !j?.error) return { error: "http_error", message: `HTTP ${res.status}` };
  return j;
}

export async function fetchConnectStatus(): Promise<ConnectStatusResult> {
  try {
    const j = await post("/api/connect/status");
    if (!j?.ok) return { ok: false, error: j?.error ?? "unknown", message: j?.message };
    return {
      ok: true,
      status: j.status as ConnectStatus,
      eligible: Boolean(j.eligible),
      currency: String(j.currency ?? "EUR"),
      chargesEnabled: Boolean(j.chargesEnabled),
      payoutsEnabled: Boolean(j.payoutsEnabled),
      detailsSubmitted: Boolean(j.detailsSubmitted),
      connectUnavailable: Boolean(j.connectUnavailable),
      disabledReason: j.disabledReason ?? null,
      currentlyDue: Array.isArray(j.currentlyDue) ? j.currentlyDue : [],
      pastDue: Array.isArray(j.pastDue) ? j.pastDue : [],
    };
  } catch (e) {
    return { ok: false, error: "network_error", message: (e as Error).message };
  }
}

/** Create/reuse the Express account and open the Stripe onboarding page. */
export async function startConnectOnboarding(
  country?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string; message?: string }> {
  try {
    const j = await post("/api/connect/onboard", country ? { country } : {});
    if (!j?.ok || !j.url) return { ok: false, error: j?.error ?? "unknown", message: j?.message };
    const url = String(j.url);
    if (isNative()) {
      // Native shell: open the hosted onboarding in the in-app browser; the
      // /connect-return page re-checks status when Stripe redirects back.
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
    } else {
      window.location.href = url;
    }
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: "network_error", message: (e as Error).message };
  }
}

/** Settle a `stripe_connect` payout row with an automated Stripe Transfer. */
export async function sendConnectPayout(
  payoutId: string,
): Promise<{ ok: true; transferId: string } | { ok: false; error: string; message?: string }> {
  try {
    const j = await post("/api/connect/payout", { payoutId });
    if (!j?.ok) return { ok: false, error: j?.error ?? "unknown", message: j?.message };
    return { ok: true, transferId: String(j.transferId ?? "") };
  } catch (e) {
    return { ok: false, error: "network_error", message: (e as Error).message };
  }
}

/** One-time Stripe Express dashboard link (only when the account is active). */
export async function openExpressDashboard(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  try {
    const j = await post("/api/connect/login-link");
    if (!j?.ok || !j.url) return { ok: false, error: j?.error ?? "unknown" };
    const url = String(j.url);
    if (isNative()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
