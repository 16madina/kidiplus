// POST /api/live-replay/webhook
// LiveKit webhook: finalize replay URL when RoomComposite egress completes.

import { createFileRoute } from "@tanstack/react-router";
import { EgressStatus, WebhookReceiver } from "livekit-server-sdk";
import { applyEgressInfoToLive } from "@/lib/live-replay-finalize";

export const Route = createFileRoute("/api/live-replay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        if (!apiKey || !apiSecret) {
          return new Response("LiveKit not configured", { status: 500 });
        }

        const body = await request.text();
        const authHeader =
          request.headers.get("Authorization") ??
          request.headers.get("authorization") ??
          "";

        let event;
        try {
          const receiver = new WebhookReceiver(apiKey, apiSecret);
          event = await receiver.receive(body, authHeader);
        } catch (e) {
          console.warn("[live-replay/webhook] invalid signature", e);
          return new Response("Unauthorized", { status: 401 });
        }

        const eventName = event.event ?? "";
        if (eventName !== "egress_ended" && eventName !== "egress_updated") {
          return Response.json({ ok: true, ignored: eventName });
        }

        const info = event.egressInfo;
        if (!info?.egressId) {
          return Response.json({ ok: true, ignored: "no_egress" });
        }

        const egressId = info.egressId;
        const status = info.status;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow } = await supabaseAdmin
          .from("lives")
          .select(
            "id, replay_egress_id, replay_storage_path, replay_status, ended_at",
          )
          .eq("replay_egress_id", egressId)
          .maybeSingle();

        if (!liveRow) {
          return Response.json({ ok: true, ignored: "not_replay" });
        }

        if (
          status === EgressStatus.EGRESS_ENDING &&
          liveRow.replay_status === "recording"
        ) {
          await supabaseAdmin
            .from("lives")
            .update({ replay_status: "processing" } as never)
            .eq("id", liveRow.id)
            .eq("replay_egress_id", egressId);
        }

        const result = await applyEgressInfoToLive({
          liveId: liveRow.id,
          egressId,
          endedAt: liveRow.ended_at,
          storedPath: liveRow.replay_storage_path,
          info,
        });

        return Response.json({
          ok: true,
          status: result,
          liveId: liveRow.id,
        });
      },
    },
  },
});
