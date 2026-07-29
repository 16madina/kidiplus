// POST /api/live-replay/start
// Start LiveKit RoomComposite MP4 recording for a seller's live.

import { createFileRoute } from "@tanstack/react-router";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  S3Upload,
} from "livekit-server-sdk";
import {
  LIVE_ID_UUID_RE,
  liveReplayCorsHeaders,
  liveReplayJson,
  liveReplayLivekitEnv,
  requireLiveReplayApiUser,
} from "@/lib/live-replay-api-auth";
import {
  liveReplayEgressTemplateBaseUrl,
  liveReplayObjectPath,
  liveReplayS3Config,
} from "@/lib/live-replay-s3";

export const Route = createFileRoute("/api/live-replay/start")({
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

        const s3cfg = liveReplayS3Config();
        if (!s3cfg) {
          return liveReplayJson(
            {
              error: "replay_storage_not_configured",
              message: "LIVE_REPLAY_S3_* env vars manquantes",
            },
            503,
            origin,
          );
        }

        const lk = liveReplayLivekitEnv();
        if (!lk.ok) {
          return liveReplayJson({ error: lk.error }, 500, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow, error: liveError } = await supabaseAdmin
          .from("lives")
          .select(
            "id, seller_id, room_name, status, replay_egress_id, replay_status",
          )
          .eq("id", liveId)
          .maybeSingle();

        if (liveError || !liveRow) {
          return liveReplayJson({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return liveReplayJson({ error: "Not authorized" }, 403, origin);
        }
        if (liveRow.status !== "live") {
          return liveReplayJson(
            { error: "live_not_active", message: "Le live n’est pas en cours" },
            409,
            origin,
          );
        }

        if (
          liveRow.replay_egress_id &&
          (liveRow.replay_status === "recording" ||
            liveRow.replay_status === "processing")
        ) {
          return liveReplayJson(
            {
              ok: true,
              already: true,
              egressId: liveRow.replay_egress_id,
            },
            200,
            origin,
          );
        }

        const storagePath = liveReplayObjectPath(liveId);
        const egress = new EgressClient(lk.host, lk.apiKey, lk.apiSecret);

        let egressInfo;
        try {
          egressInfo = await egress.startRoomCompositeEgress(
            liveRow.room_name,
            new EncodedFileOutput({
              fileType: EncodedFileType.MP4,
              filepath: storagePath,
              disableManifest: true,
              output: {
                case: "s3",
                value: new S3Upload({
                  accessKey: s3cfg.accessKey,
                  secret: s3cfg.secret,
                  bucket: s3cfg.bucket,
                  region: s3cfg.region,
                  endpoint: s3cfg.endpoint,
                  forcePathStyle: s3cfg.forcePathStyle,
                }),
              },
            }),
            {
              layout: "speaker",
              encodingOptions: EncodingOptionsPreset.PORTRAIT_H264_720P_30,
              // Custom page with large top-right KiDi+ watermark burned into the MP4.
              customBaseUrl: liveReplayEgressTemplateBaseUrl(),
            },
          );
        } catch (e) {
          console.error("[live-replay/start] startRoomCompositeEgress failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin
            .from("lives")
            .update({
              replay_status: "failed",
              replay_egress_id: null,
              replay_storage_path: null,
            } as never)
            .eq("id", liveId);
          return liveReplayJson(
            {
              error: "egress_failed",
              message: msg.includes("egress") || msg.includes("Egress")
                ? msg
                : "Impossible de démarrer l’enregistrement LiveKit",
            },
            502,
            origin,
          );
        }

        const egressId = egressInfo.egressId ?? "";
        if (!egressId) {
          await supabaseAdmin
            .from("lives")
            .update({ replay_status: "failed" } as never)
            .eq("id", liveId);
          return liveReplayJson(
            { error: "egress_no_id", message: "Egress sans identifiant" },
            502,
            origin,
          );
        }

        await supabaseAdmin
          .from("lives")
          .update({
            replay_egress_id: egressId,
            replay_status: "recording",
            replay_storage_path: storagePath,
            replay_url: null,
            replay_ready_at: null,
            replay_expires_at: null,
          } as never)
          .eq("id", liveId);

        return liveReplayJson(
          { ok: true, egressId, storagePath },
          200,
          origin,
        );
      },
    },
  },
});
