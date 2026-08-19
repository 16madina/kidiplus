// POST /api/youtube/restream
// Orchestrates YouTube Live create + LiveKit Web Egress (full KiDi+ UI → RTMP).

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
import {
  requireYoutubeApiUser,
  youtubeCorsHeaders,
  youtubeJson,
} from "@/lib/youtube-api-auth";
import {
  completeYoutubeBroadcast,
  createYoutubeLiveBroadcast,
  getValidYoutubeAccessToken,
  promoteYoutubeBroadcastWhenStreamActive,
} from "@/lib/youtube.server";

function livekitHttpHost(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/youtube/restream")({
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

        let body: { action?: unknown; liveId?: unknown };
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
              : body.action === "promote"
                ? "promote"
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
            "id, seller_id, room_name, status, title, broadcast_mode, egress_id, youtube_broadcast_id, youtube_stream_id, youtube_watch_url",
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
        const egress = new EgressClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        if (action === "stop") {
          const egressId = (liveRow as { egress_id?: string | null }).egress_id;
          const broadcastId = (liveRow as { youtube_broadcast_id?: string | null })
            .youtube_broadcast_id;

          if (egressId) {
            try {
              await egress.stopEgress(egressId);
            } catch (e) {
              console.warn("[youtube-restream] stopEgress failed", e);
            }
          }

          if (broadcastId) {
            const tok = await getValidYoutubeAccessToken(userId);
            if (tok.ok) {
              await completeYoutubeBroadcast(tok.accessToken, broadcastId);
            }
          }

          await supabaseAdmin
            .from("lives")
            .update({
              egress_id: null,
              youtube_broadcast_id: null,
              youtube_stream_id: null,
              youtube_watch_url: null,
            })
            .eq("id", liveId);

          return youtubeJson({ ok: true }, 200, origin);
        }

        // Host polls this after start — serverless often kills the fire-and-forget
        // promote on the start response, which left YouTube stuck on "À venir".
        if (action === "promote") {
          const broadcastId = (liveRow as { youtube_broadcast_id?: string | null })
            .youtube_broadcast_id;
          const streamId = (liveRow as { youtube_stream_id?: string | null })
            .youtube_stream_id;
          if (!broadcastId || !streamId) {
            return youtubeJson(
              {
                error: "youtube_not_streaming",
                message: "Aucun live YouTube actif pour ce live KiDi+.",
              },
              400,
              origin,
            );
          }
          const tok = await getValidYoutubeAccessToken(userId);
          if (!tok.ok) {
            return youtubeJson(
              { error: tok.error, message: tok.error },
              tok.error === "youtube_not_connected" ? 400 : 502,
              origin,
            );
          }
          const result = await promoteYoutubeBroadcastWhenStreamActive({
            accessToken: tok.accessToken,
            broadcastId,
            streamId,
            maxWaitMs: 12_000,
          });
          return youtubeJson(
            {
              ok: result.ok,
              live: result.ok,
              lifeCycleStatus: result.lifeCycleStatus,
              streamStatus: result.streamStatus,
            },
            200,
            origin,
          );
        }

        // start
        const mode = (liveRow as { broadcast_mode?: string }).broadcast_mode;
        if (mode === "rtmp") {
          return youtubeJson(
            {
              error: "youtube_camera_only",
              message:
                "La retransmission YouTube fonctionne en live caméra KiDi+, pas en mode Restream.",
            },
            400,
            origin,
          );
        }

        const existingEgress = (liveRow as { egress_id?: string | null }).egress_id;
        if (existingEgress) {
          return youtubeJson(
            {
              error: "youtube_already_live",
              watchUrl: (liveRow as { youtube_watch_url?: string | null })
                .youtube_watch_url,
            },
            409,
            origin,
          );
        }

        const tok = await getValidYoutubeAccessToken(userId);
        if (!tok.ok) {
          return youtubeJson(
            {
              error: tok.error,
              message:
                tok.error === "youtube_not_connected"
                  ? "Connecte d’abord ton compte YouTube."
                  : tok.error,
            },
            tok.error === "youtube_not_connected" ? 400 : 502,
            origin,
          );
        }

        const title =
          (liveRow as { title?: string }).title?.trim() || "KiDi+ Live";
        const created = await createYoutubeLiveBroadcast({
          accessToken: tok.accessToken,
          title,
          liveId,
          privacyStatus: "public",
        });
        if (!created.ok) {
          return youtubeJson(
            { error: "youtube_create_failed", message: created.error },
            502,
            origin,
          );
        }

        const ticket = signBroadcastEgressTicket({
          liveId,
          roomName: liveRow.room_name,
          ttlSec: 5 * 3600,
        });
        if (!ticket) {
          await completeYoutubeBroadcast(
            tok.accessToken,
            created.live.broadcastId,
          );
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
        const compositionUrl = `${appOrigin}/broadcast/${encodeURIComponent(liveId)}?k=${encodeURIComponent(ticket)}`;
        console.info("[youtube-restream] web egress url", appOrigin + `/broadcast/${liveId}`);

        let egressInfo;
        try {
          // Web Egress captures the full KiDi+ shopping UI (video + auctions + chat).
          // awaitStartSignal waits for console.log("START_RECORDING") on the page.
          egressInfo = await egress.startWebEgress(
            compositionUrl,
            new StreamOutput({
              protocol: StreamProtocol.RTMP,
              urls: [created.live.rtmpUrl],
            }),
            {
              awaitStartSignal: true,
              encodingOptions: socialRestreamEncodingOptions(),
            },
          );
        } catch (e) {
          console.error("[youtube-restream] startWebEgress failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          await completeYoutubeBroadcast(
            tok.accessToken,
            created.live.broadcastId,
          );
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
          await completeYoutubeBroadcast(
            tok.accessToken,
            created.live.broadcastId,
          );
          return youtubeJson(
            { error: "egress_no_id", message: "Egress sans identifiant" },
            502,
            origin,
          );
        }

        const { error: updErr } = await supabaseAdmin
          .from("lives")
          .update({
            egress_id: egressId,
            youtube_broadcast_id: created.live.broadcastId,
            youtube_stream_id: created.live.streamId,
            youtube_watch_url: created.live.watchUrl,
          })
          .eq("id", liveId);

        if (updErr) {
          try {
            await egress.stopEgress(egressId);
          } catch {
            /* ignore */
          }
          await completeYoutubeBroadcast(
            tok.accessToken,
            created.live.broadcastId,
          );
          return youtubeJson(
            { error: "Failed to save restream on live" },
            500,
            origin,
          );
        }

        // Best-effort on long-lived servers. Host also polls action=promote
        // because serverless often kills this promise after the response.
        void promoteYoutubeBroadcastWhenStreamActive({
          accessToken: tok.accessToken,
          broadcastId: created.live.broadcastId,
          streamId: created.live.streamId,
          maxWaitMs: 90_000,
        }).catch((e) => console.warn("[youtube-restream] background promote", e));

        return youtubeJson(
          {
            ok: true,
            egressId,
            broadcastId: created.live.broadcastId,
            watchUrl: created.live.watchUrl,
            channelTitle: tok.channelTitle,
            compositionUrl: `${appOrigin}/broadcast/${liveId}`,
          },
          200,
          origin,
        );
      },
    },
  },
});
