// GET /api/live-replay/play-url?liveId=
// Returns a browser-playable public replay URL and repairs private R2/S3
// locations that were incorrectly stored as replay_url.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { repairLiveReplayPublicUrl } from "@/lib/live-replay-finalize";

function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      ...corsHeaders(origin),
    },
  });
}

const LIVE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/live-replay/play-url")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        }),

      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        const liveId = new URL(request.url).searchParams.get("liveId")?.trim() ?? "";
        if (!liveId || !LIVE_ID_UUID_RE.test(liveId)) {
          return json({ error: "Missing liveId" }, 400, origin);
        }

        const repaired = await repairLiveReplayPublicUrl(liveId);
        if (!repaired.ok || !repaired.url) {
          return json(
            { error: repaired.error || "unavailable" },
            repaired.error === "not_found" ? 404 : 409,
            origin,
          );
        }

        return json({ ok: true, url: repaired.url }, 200, origin);
      },
    },
  },
});
