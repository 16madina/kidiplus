// Shared auth/CORS plumbing for the /api/connect/* routes.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";

export function corsHeaders(origin: string | null): HeadersInit {
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Payments-Env",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export type Authed = {
  userId: string;
  admin: SupabaseClient;
};

/** Verify the caller's Supabase bearer token and return a service-role client. */
export async function authenticate(
  request: Request,
): Promise<{ ok: true; ctx: Authed } | { ok: false; error: string; status: number }> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "backend_not_configured", status: 500 };
  }
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };

  const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await supaAuth.auth.getUser(token);
  if (error || !data.user) return { ok: false, error: "unauthorized", status: 401 };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  return { ok: true, ctx: { userId: data.user.id, admin } };
}
