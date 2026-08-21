// POST /api/tiktok/restream
// Manual TikTok RTMP + LiveKit Web Egress (full KiDi+ UI → TikTok).
// No OAuth — host pastes LIVE Studio server URL + stream key.

import { egressErrorMessage } from "@/lib/egress-error-message";
import { createFileRoute } from "@tanstack/react-router";
import {
  EgressClient,
  StreamOutput,
  StreamProtocol,
} from "livekit-server-sdk";
import { signBroadcastEgressTicket } from "@/lib/broadcast-egress-token";
import { broadcastEgressOrigin } from "@/lib/broadcast-egress-origin";
import { socialRestreamEncodingOptions } from "@/lib/social-egress-encoding";
import { buildTiktokRtmpUrl } from "@/lib/tiktok-rtmp";
import {
  requireYoutubeApiUser,
  youtubeCorsHeaders,
  youtubeJson,
} from "@/lib/youtube-api-auth";

function livekitHttpHost(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/tiktok/restream")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: youtubeCorsHeaders(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const auth = await requireYoutubeApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: {
          action?: unknown;
          liveId?: unknown;
          serverUrl?: unknown;
          streamKey?: unknown;
          rtmpUrl?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return youtubeJson({ error: "Invalid JSON body" }, 400, origin);
        }

        const action =
          body.action === "stop"
            ? "stop"
            : body.action === "start"
              ? "start"
              : null;
        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!action || !liveId || !UUID_RE.test(liveId)) {
          return youtubeJson(
            { error: "Missing action or liveId" },
            400,
            origin,
          );
        }

        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return youtubeJson(
            { error: "LiveKit not configured on server" },
            500,
            origin,
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow, error: liveError } = await supabaseAdmin
          .from("lives")
          .select(
            "id, seller_id, room_name, status, title, broadcast_mode, tiktok_egress_id",
          )
          .eq("id", liveId)
          .maybeSingle();

        if (liveError || !liveRow) {
          return youtubeJson({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return youtubeJson({ error: "Not authorized" }, 403, origin);
        }

        const host = livekitHttpHost(LIVEKIT_URL);
        const egress = new EgressClient(
          host,
          LIVEKIT_API_KEY,
          LIVEKIT_API_SECRET,
        );

        if (action === "stop") {
          const egressId = (
            liveRow as { tiktok_egress_id?: string | null }
          ).tiktok_egress_id;
          if (egressId) {
            try {
              await egress.stopEgress(egressId);
            } catch (e) {
              console.warn("[tiktok-restream] stopEgress failed", e);
            }
          }
          await supabaseAdmin
            .from("lives")
            .update({ tiktok_egress_id: null })
            .eq("id", liveId);
          return youtubeJson({ ok: true }, 200, origin);
        }

        // start
        const mode = (liveRow as { broadcast_mode?: string }).broadcast_mode;
        if (mode === "rtmp") {
          return youtubeJson(
            {
              error: "tiktok_camera_only",
              message:
                "La retransmission TikTok fonctionne en live caméra KiDi+, pas en mode Restream OBS.",
            },
            400,
            origin,
          );
        }

        const existing = (liveRow as { tiktok_egress_id?: string | null })
          .tiktok_egress_id;
        if (existing) {
          return youtubeJson(
            { error: "tiktok_already_live", message: "TikTok est déjà en diffusion." },
            409,
            origin,
          );
        }

        const built = buildTiktokRtmpUrl({
          serverUrl:
            typeof body.serverUrl === "string" ? body.serverUrl : null,
          streamKey:
            typeof body.streamKey === "string" ? body.streamKey : null,
          fullUrl: typeof body.rtmpUrl === "string" ? body.rtmpUrl : null,
        });
        if (!built.ok) {
          return youtubeJson(
            { error: "tiktok_bad_rtmp", message: built.error },
            400,
            origin,
          );
        }

        const ticket = signBroadcastEgressTicket({
          liveId,
          roomName: liveRow.room_name,
          ttlSec: 5 * 3600,
        });
        if (!ticket) {
          return youtubeJson(
            {
              error: "egress_ticket_failed",
              message:
                "Impossible de signer le ticket broadcast (secret manquant).",
            },
            500,
            origin,
          );
        }

        const appOrigin = broadcastEgressOrigin();
        const compositionUrl = `${appOrigin}/broadcast/${encodeURIComponent(liveId)}?k=${encodeURIComponent(ticket)}&purpose=social`;
        console.info(
          "[tiktok-restream] web egress url",
          appOrigin + `/broadcast/${liveId}`,
        );

        let egressInfo;
        try {
          egressInfo = await egress.startWebEgress(
            compositionUrl,
            new StreamOutput({
              protocol: StreamProtocol.RTMP,
              urls: [built.rtmpUrl],
            }),
            {
              awaitStartSignal: true,
              encodingOptions: socialRestreamEncodingOptions(),
            },
          );
        } catch (e) {
          console.error("[tiktok-restream] startWebEgress failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          return youtubeJson(
            {
              error: "egress_failed",
              message: egressErrorMessage(msg),
            },
            502,
            origin,
          );
        }

        const egressId = egressInfo.egressId ?? "";
        if (!egressId) {
          return youtubeJson(
            { error: "egress_no_id", message: "Egress sans identifiant" },
            502,
            origin,
          );
        }

        const { error: updErr } = await supabaseAdmin
          .from("lives")
          .update({ tiktok_egress_id: egressId })
          .eq("id", liveId);

        if (updErr) {
          try {
            await egress.stopEgress(egressId);
          } catch {
            /* ignore */
          }
          // Column missing until migration is applied — surface a clear error.
          return youtubeJson(
            {
              error: "Failed to save TikTok restream on live",
              message:
                updErr.message?.includes("tiktok_egress_id")
                  ? "Migration TikTok manquante (colonne tiktok_egress_id)."
                  : updErr.message,
            },
            500,
            origin,
          );
        }

        return youtubeJson(
          {
            ok: true,
            egressId,
            compositionUrl: `${appOrigin}/broadcast/${liveId}`,
          },
          200,
          origin,
        );
      },
    },
  },
});
