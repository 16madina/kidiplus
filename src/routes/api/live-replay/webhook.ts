// POST /api/live-replay/webhook
// LiveKit webhook: finalize replay URL when RoomComposite egress completes.

import { createFileRoute } from "@tanstack/react-router";
import { EgressStatus, WebhookReceiver } from "livekit-server-sdk";
import {
  liveReplayExpiresAt,
  liveReplayPublicUrl,
  liveReplayS3Config,
} from "@/lib/live-replay-s3";

function extractStoragePath(filepath: string | undefined | null): string | null {
  if (!filepath) return null;
  // LiveKit may return s3://bucket/path or plain path
  const trimmed = filepath.trim();
  if (!trimmed) return null;
  const s3Match = /^s3:\/\/[^/]+\/(.+)$/i.exec(trimmed);
  if (s3Match?.[1]) return s3Match[1];
  return trimmed.replace(/^\//, "");
}

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
          // Not a replay egress (restream / other).
          return Response.json({ ok: true, ignored: "not_replay" });
        }

        const failed =
          status === EgressStatus.EGRESS_FAILED ||
          status === EgressStatus.EGRESS_ABORTED ||
          status === EgressStatus.EGRESS_LIMIT_REACHED;

        if (failed) {
          await supabaseAdmin
            .from("lives")
            .update({
              replay_status: "failed",
              replay_url: null,
            } as never)
            .eq("id", liveRow.id)
            .eq("replay_egress_id", egressId);
          return Response.json({ ok: true, status: "failed" });
        }

        if (status !== EgressStatus.EGRESS_COMPLETE) {
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
          return Response.json({ ok: true, status: "pending" });
        }

        // Prefer filepath from egress result; fall back to stored path.
        const fileResult = info.fileResults?.[0];
        const resultFile =
          fileResult?.filename || fileResult?.location || null;
        const storagePath =
          extractStoragePath(resultFile) ??
          liveRow.replay_storage_path ??
          null;

        if (!storagePath) {
          await supabaseAdmin
            .from("lives")
            .update({ replay_status: "failed" } as never)
            .eq("id", liveRow.id)
            .eq("replay_egress_id", egressId);
          return Response.json({ ok: false, error: "no_path" });
        }

        const s3cfg = liveReplayS3Config();
        const replayUrl = s3cfg
          ? liveReplayPublicUrl(s3cfg, storagePath)
          : null;

        if (!replayUrl) {
          await supabaseAdmin
            .from("lives")
            .update({
              replay_status: "failed",
              replay_storage_path: storagePath,
            } as never)
            .eq("id", liveRow.id)
            .eq("replay_egress_id", egressId);
          return Response.json({ ok: false, error: "no_public_url" });
        }

        const baseDate = liveRow.ended_at
          ? new Date(liveRow.ended_at)
          : new Date();
        const expiresAt = liveReplayExpiresAt(
          Number.isFinite(baseDate.getTime()) ? baseDate : new Date(),
        );

        await supabaseAdmin
          .from("lives")
          .update({
            replay_status: "ready",
            replay_storage_path: storagePath,
            replay_url: replayUrl,
            replay_ready_at: new Date().toISOString(),
            replay_expires_at: expiresAt,
          } as never)
          .eq("id", liveRow.id)
          .eq("replay_egress_id", egressId);

        return Response.json({ ok: true, status: "ready", liveId: liveRow.id });
      },
    },
  },
});
