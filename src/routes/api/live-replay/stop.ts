// POST /api/live-replay/stop
// Stop LiveKit RoomComposite recording; webhook will finalize replay_url.

import { createFileRoute } from "@tanstack/react-router";
import { EgressClient } from "livekit-server-sdk";
import {
  LIVE_ID_UUID_RE,
  liveReplayCorsHeaders,
  liveReplayJson,
  liveReplayLivekitEnv,
  requireLiveReplayApiUser,
} from "@/lib/live-replay-api-auth";

export const Route = createFileRoute("/api/live-replay/stop")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: liveReplayCorsHeaders(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const auth = await requireLiveReplayApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: { liveId?: unknown };
        try {
          body = await request.json();
        } catch {
          return liveReplayJson({ error: "Invalid JSON body" }, 400, origin);
        }

        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!liveId || !LIVE_ID_UUID_RE.test(liveId)) {
          return liveReplayJson({ error: "Missing liveId" }, 400, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow, error: liveError } = await supabaseAdmin
          .from("lives")
          .select("id, seller_id, replay_egress_id, replay_status")
          .eq("id", liveId)
          .maybeSingle();

        if (liveError || !liveRow) {
          return liveReplayJson({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return liveReplayJson({ error: "Not authorized" }, 403, origin);
        }

        const egressId = liveRow.replay_egress_id;
        if (!egressId) {
          return liveReplayJson({ ok: true, already: true }, 200, origin);
        }

        if (
          liveRow.replay_status === "ready" ||
          liveRow.replay_status === "processing"
        ) {
          return liveReplayJson({ ok: true, already: true }, 200, origin);
        }

        const lk = liveReplayLivekitEnv();
        if (lk.ok) {
          const egress = new EgressClient(lk.host, lk.apiKey, lk.apiSecret);
          try {
            await egress.stopEgress(egressId);
          } catch (e) {
            console.warn("[live-replay/stop] stopEgress failed", e);
          }
        }

        await supabaseAdmin
          .from("lives")
          .update({ replay_status: "processing" } as never)
          .eq("id", liveId)
          .eq("replay_egress_id", egressId);

        return liveReplayJson({ ok: true }, 200, origin);
      },
    },
  },
});
