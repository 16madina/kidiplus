import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";

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

const ALLOWED_ORIGIN_SUFFIXES = [
  "lovable.app",
  "lovableproject.com",
  "localhost",
  "127.0.0.1",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin fetches often omit Origin
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
  } catch {
    return false;
  }
}

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

        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return json(
            { error: "LiveKit not configured on server" },
            500,
            origin,
          );
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
        const role = body.role === "host" ? "host" : "viewer";

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
