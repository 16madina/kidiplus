import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";
import { isAllowedOrigin } from "@/lib/api-cors";

// LiveKit token issuer — server-only.
//
// Security model:
// - The API secret NEVER leaves the server. It is read from
//   process.env inside the handler (never at module scope, never with a
//   VITE_ prefix, never returned in the response). Only a short-lived
//   signed JWT + the public wss:// URL are sent to the client.
// - This endpoint is same-origin (called by the app itself). We do NOT
//   emit `Access-Control-Allow-Origin: *`; cross-origin browsers get
//   blocked by the browser at preflight. Server-to-server callers with a
//   forged Origin are also rejected by the allowlist below.
// - Server never trusts the client for role escalation beyond the two
//   documented values ("host" | "viewer"); anything else falls back to
//   the least-privileged "viewer" grant.

// Origin allowlist (web + native WebView schemes) lives in @/lib/api-cors.

function corsHeaders(origin: string | null): HeadersInit {
  // Echo the caller's origin only when it's on the allowlist. No wildcard.
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...corsHeaders(origin),
    },
  });
}

export const Route = createFileRoute("/api/livekit-token")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");

        // Reject browsers on non-allowlisted origins outright.
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        // Secrets — read inside the handler (env is per-request on the Worker).
        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return json(
            { error: "LiveKit not configured on server" },
            500,
            origin,
          );
        }
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json(
            { error: "Auth backend not configured on server" },
            500,
            origin,
          );
        }

        // Two-tier auth model:
        //  - Signed-in caller (any Supabase user) → normal viewer token.
        //    A host token additionally requires the caller to be the room
        //    owner OR a live_moderator.
        //  - Anonymous caller (no Bearer) → strict view-only guest token:
        //    canPublish=false, canPublishData=false, viewer role ONLY,
        //    guest_* identity, short TTL. Host requests without a Bearer
        //    are rejected outright — no anonymous publishing is possible.
        const authHeader = request.headers.get("authorization") ?? "";
        let callerId: string | null = null;
        if (authHeader.startsWith("Bearer ")) {
          const bearer = authHeader.slice("Bearer ".length).trim();
          if (!bearer || bearer.split(".").length !== 3) {
            return json({ error: "Unauthorized" }, 401, origin);
          }
          const { createClient } = await import("@supabase/supabase-js");
          const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          });
          const { data: claimsData, error: claimsError } =
            await supabaseAuth.auth.getClaims(bearer);
          callerId = claimsData?.claims?.sub ?? null;
          if (claimsError || !callerId) {
            return json({ error: "Unauthorized" }, 401, origin);
          }
        }


        let body: {
          room?: unknown;
          identity?: unknown;
          name?: unknown;
          role?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, origin);
        }

        const room = typeof body.room === "string" ? body.room.trim() : "";
        const identity =
          typeof body.identity === "string" ? body.identity.trim() : "";
        const name =
          typeof body.name === "string"
            ? body.name.trim().slice(0, 64)
            : undefined;
        // Default to least-privileged viewer role for anything unexpected.
        const requestedRole = body.role === "host" ? "host" : "viewer";

        if (!room || !identity) {
          return json({ error: "Missing room or identity" }, 400, origin);
        }
        // Enforce a safe character set + length on user-controlled fields.
        const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
        if (!idPattern.test(room) || !idPattern.test(identity)) {
          return json(
            { error: "Invalid room or identity format" },
            400,
            origin,
          );
        }

        // Authorize host (publish-capable) tokens against the room owner
        // and its live moderators. Everyone else is downgraded to viewer.
        let role: "host" | "viewer" = "viewer";
        if (requestedRole === "host") {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data: liveRow, error: liveError } = await supabaseAdmin
            .from("lives")
            .select("id, seller_id")
            .eq("room_name", room)
            .maybeSingle();
          if (liveError || !liveRow) {
            return json({ error: "Room not found" }, 404, origin);
          }
          let allowed = liveRow.seller_id === callerId;
          if (!allowed) {
            const { data: modRow } = await supabaseAdmin
              .from("live_moderators")
              .select("user_id")
              .eq("live_id", liveRow.id)
              .eq("user_id", callerId)
              .maybeSingle();
            allowed = !!modRow;
          }
          if (!allowed) {
            return json(
              { error: "Not authorized to publish to this room" },
              403,
              origin,
            );
          }
          role = "host";
        }

        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
          identity,
          name,
          // Shorter TTL for viewers; hosts may need longer sessions.
          ttl: role === "host" ? "3h" : "1h",
        });

        at.addGrant({
          roomJoin: true,
          room,
          canPublish: role === "host",
          canSubscribe: true,
          canPublishData: true,
        });

        const token = await at.toJwt();
        // Only the signed JWT + the public wss URL leave the server.
        return json({ token, url: LIVEKIT_URL }, 200, origin);
      },

    },
  },
});
