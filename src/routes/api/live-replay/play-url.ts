// GET /api/live-replay/play-url?liveId=
// Owner-only: returns a playable public replay URL (repairs private R2 links).

import { createFileRoute } from "@tanstack/react-router";
import {
  LIVE_ID_UUID_RE,
  liveReplayCorsHeaders,
  liveReplayJson,
  requireLiveReplayApiUser,
} from "@/lib/live-replay-api-auth";
import { repairLiveReplayPublicUrl } from "@/lib/live-replay-finalize";

export const Route = createFileRoute("/api/live-replay/play-url")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: liveReplayCorsHeaders(
            request.headers.get("origin"),
            "GET, OPTIONS",
          ),
        }),

      GET: async ({ request }) => {
        const auth = await requireLiveReplayApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        const liveId =
          new URL(request.url).searchParams.get("liveId")?.trim() ?? "";
        if (!liveId || !LIVE_ID_UUID_RE.test(liveId)) {
          return liveReplayJson({ error: "Missing liveId" }, 400, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow } = await supabaseAdmin
          .from("lives")
          .select("id, seller_id")
          .eq("id", liveId)
          .maybeSingle();

        if (!liveRow) {
          return liveReplayJson({ error: "not_found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return liveReplayJson({ error: "Not authorized" }, 403, origin);
        }

        const repaired = await repairLiveReplayPublicUrl(liveId);
        if (!repaired.ok || !repaired.url) {
          return liveReplayJson(
            { error: repaired.error || "unavailable" },
            repaired.error === "not_found" ? 404 : 409,
            origin,
          );
        }

        return liveReplayJson({ ok: true, url: repaired.url }, 200, origin);
      },
    },
  },
});
