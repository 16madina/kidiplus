import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";

// LiveKit token issuer. Reads three secrets from the runtime env:
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
// POST { room, identity, name?, role: "host" | "viewer" } -> { token, url }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/livekit-token")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return json(
            { error: "LiveKit not configured on server" },
            500,
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
          return json({ error: "Invalid JSON body" }, 400);
        }

        const room = typeof body.room === "string" ? body.room.trim() : "";
        const identity =
          typeof body.identity === "string" ? body.identity.trim() : "";
        const name =
          typeof body.name === "string" ? body.name.trim() : undefined;
        const role = body.role === "host" ? "host" : "viewer";

        if (!room || !identity) {
          return json({ error: "Missing room or identity" }, 400);
        }
        if (room.length > 128 || identity.length > 128) {
          return json({ error: "room/identity too long" }, 400);
        }

        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
          identity,
          name,
          ttl: "3h",
        });

        at.addGrant({
          roomJoin: true,
          room,
          canPublish: role === "host",
          canSubscribe: true,
          canPublishData: true,
        });

        const token = await at.toJwt();
        return json({ token, url: LIVEKIT_URL });
      },
    },
  },
});
