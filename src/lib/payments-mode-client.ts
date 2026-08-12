// Admin-only client wrapper for /api/admin/payments-mode.

import { supabase } from "@/integrations/supabase/client";
import { paymentsEnvHeaders } from "@/lib/stripe-publishable";

export type PaymentsModeReport = {
  ok: true;
  effective: "test" | "live";
  stripe: {
    gatewayEnv: "sandbox" | "live";
    configured: boolean;
    legacySecretKey: "test" | "live" | "missing" | "unknown";
    publishableKey: "test" | "live" | "missing" | "unknown";
    webhookSecretConfigured: boolean;
    sandboxGatewayKey: boolean;
    liveGatewayKey: boolean;
  };
  paypal: { mode: "sandbox" | "live"; configured: boolean };
};

export async function fetchPaymentsMode(): Promise<PaymentsModeReport | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/admin/payments-mode", {
      headers: { Authorization: `Bearer ${token}`, ...paymentsEnvHeaders() },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as PaymentsModeReport;
    return j?.ok ? j : null;
  } catch {
    return null;
  }
}
