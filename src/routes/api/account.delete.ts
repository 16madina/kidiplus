// POST /api/account/delete — permanently delete the caller's account.
// Requires bearer token. Anonymises profile as the user (RPC), then calls
// supabase.auth.admin.deleteUser with the service role.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGIN_SUFFIXES = ["lovable.app", "lovableproject.com", "localhost", "127.0.0.1", "kidiplus.com"];
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch { return false; }
}
function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) base["Access-Control-Allow-Origin"] = origin;
  return base;
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export const Route = createFileRoute("/api/account/delete")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }

        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        let body: { confirm?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        if (body?.confirm !== "DELETE") {
          return json({ error: "confirm_required" }, 400, origin);
        }

        // Guard: block deletion if the user has money or activity at stake.
        const { data: checkData, error: checkErr } = await supaAuth.rpc("account_deletion_check");
        if (checkErr) return json({ error: checkErr.message }, 500, origin);
        const c = checkData as { has_blockers: boolean; wallet_balance: number; pending_payouts: number; pending_orders: number; live_now: number };
        if (c?.has_blockers) {
          return json({ error: "has_blockers", ...c }, 409, origin);
        }

        // Step 1 (as user): anonymise profile + end active lives
        const { error: rpcErr } = await supaAuth.rpc("anonymize_my_account");
        if (rpcErr) return json({ error: rpcErr.message }, 500, origin);

        // Step 2 (service role): remove auth.users → cascades to profiles + everything.
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { error: delErr } = await admin.auth.admin.deleteUser(userId);
        if (delErr) return json({ error: delErr.message }, 500, origin);

        return json({ ok: true }, 200, origin);
      },
    },
  },
});
