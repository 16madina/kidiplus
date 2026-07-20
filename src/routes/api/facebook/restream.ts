// POST /api/facebook/restream — start/stop Facebook Live + LiveKit Egress

import { createFileRoute } from "@tanstack/react-router";
import { EgressClient, StreamOutput, StreamProtocol } from "livekit-server-sdk";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";
import {
  createFacebookLiveVideo,
  endFacebookLiveVideo,
  fetchFacebookTokenPermissions,
  getFacebookConnection,
  missingLivePermissions,
  refreshPageAccessToken,
} from "@/lib/facebook.server";

function livekitHttpHost(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/facebook/restream")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: facebookCorsHeaders(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const auth = await requireFacebookApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: { action?: unknown; liveId?: unknown };
        try {
          body = await request.json();
        } catch {
          return facebookJson({ error: "Invalid JSON body" }, 400, origin);
        }

        const action =
          body.action === "stop"
            ? "stop"
            : body.action === "start"
              ? "start"
              : null;
        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!action || !liveId || !UUID_RE.test(liveId)) {
          return facebookJson(
            { error: "Missing action or liveId" },
            400,
            origin,
          );
        }

        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return facebookJson(
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
            "id, seller_id, room_name, status, title, broadcast_mode, facebook_egress_id, facebook_live_video_id, facebook_watch_url",
          )
          .eq("id", liveId)
          .maybeSingle();

        if (liveError || !liveRow) {
          return facebookJson({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return facebookJson({ error: "Not authorized" }, 403, origin);
        }

        const host = livekitHttpHost(LIVEKIT_URL);
        const egress = new EgressClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        if (action === "stop") {
          const egressId = liveRow.facebook_egress_id;
          const liveVideoId = liveRow.facebook_live_video_id;
          const conn = await getFacebookConnection(userId);

          if (egressId) {
            try {
              await egress.stopEgress(egressId);
            } catch (e) {
              console.warn("[facebook-restream] stopEgress failed", e);
            }
          }
          if (liveVideoId && conn.ok && conn.pageAccessToken) {
            await endFacebookLiveVideo(liveVideoId, conn.pageAccessToken);
          }

          await supabaseAdmin
            .from("lives")
            .update({
              facebook_egress_id: null,
              facebook_live_video_id: null,
              facebook_watch_url: null,
            })
            .eq("id", liveId);

          return facebookJson({ ok: true }, 200, origin);
        }

        // start
        if (liveRow.broadcast_mode === "rtmp") {
          return facebookJson(
            {
              error: "facebook_camera_only",
              message:
                "La retransmission Facebook fonctionne en live caméra KiDi+, pas en mode Restream.",
            },
            400,
            origin,
          );
        }

        if (liveRow.facebook_egress_id) {
          return facebookJson(
            {
              error: "facebook_already_live",
              watchUrl: liveRow.facebook_watch_url,
            },
            409,
            origin,
          );
        }

        const conn = await getFacebookConnection(userId);
        if (!conn.ok) {
          return facebookJson(
            {
              error: conn.error,
              message: "Connecte d’abord ton compte Facebook.",
            },
            400,
            origin,
          );
        }
        if (conn.needsPageSelection || !conn.pageId || !conn.pageAccessToken) {
          return facebookJson(
            {
              error: "facebook_page_required",
              message: "Choisis une Page Facebook avant de diffuser.",
            },
            400,
            origin,
          );
        }

        const perms = await fetchFacebookTokenPermissions(conn.userAccessToken);
        if (perms.ok) {
          const missing = missingLivePermissions(perms.granted);
          if (missing.length > 0) {
            return facebookJson(
              {
                error: "facebook_missing_permissions",
                message:
                  `Permissions Facebook manquantes : ${missing.join(", ")}. ` +
                  `Dans Meta (KiDi+2), ajoute-les en Ready for testing, puis Déconnecte / Connecte Facebook dans KiDi+ en acceptant tout.`,
                missing,
              },
              400,
              origin,
            );
          }
        }

        // Always refresh Page token so new OAuth scopes apply.
        const refreshed = await refreshPageAccessToken({
          userAccessToken: conn.userAccessToken,
          pageId: conn.pageId,
        });
        if (!refreshed.ok) {
          return facebookJson(
            {
              error: "facebook_page_token_refresh_failed",
              message:
                refreshed.error === "page_not_found_or_no_access"
                  ? "Cette Page n’est plus accessible avec ton compte. Reconnecte Facebook et choisis la Page."
                  : refreshed.error,
            },
            400,
            origin,
          );
        }

        await supabaseAdmin
          .from("seller_facebook_connections")
          .update({
            page_access_token: refreshed.pageAccessToken,
            page_name: refreshed.pageName,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        const title = liveRow.title?.trim() || "KiDi+ Live";
        const created = await createFacebookLiveVideo({
          pageId: conn.pageId,
          pageAccessToken: refreshed.pageAccessToken,
          title,
        });
        if (!created.ok) {
          return facebookJson(
            { error: "facebook_create_failed", message: created.error },
            502,
            origin,
          );
        }

        let egressInfo;
        try {
          egressInfo = await egress.startRoomCompositeEgress(
            liveRow.room_name,
            new StreamOutput({
              protocol: StreamProtocol.RTMP,
              urls: [created.live.rtmpUrl],
            }),
          );
        } catch (e) {
          console.error("[facebook-restream] egress failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          await endFacebookLiveVideo(
            created.live.liveVideoId,
            refreshed.pageAccessToken,
          );
          return facebookJson(
            {
              error: "egress_failed",
              message:
                msg.includes("egress") || msg.includes("Egress")
                  ? msg
                  : "Impossible de démarrer l’Egress LiveKit — Egress est-il activé ?",
            },
            502,
            origin,
          );
        }

        const egressId = egressInfo.egressId ?? "";
        if (!egressId) {
          await endFacebookLiveVideo(
            created.live.liveVideoId,
            refreshed.pageAccessToken,
          );
          return facebookJson(
            { error: "egress_no_id", message: "Egress sans identifiant" },
            502,
            origin,
          );
        }

        const { error: updErr } = await supabaseAdmin
          .from("lives")
          .update({
            facebook_egress_id: egressId,
            facebook_live_video_id: created.live.liveVideoId,
            facebook_watch_url: created.live.watchUrl,
          })
          .eq("id", liveId);

        if (updErr) {
          try {
            await egress.stopEgress(egressId);
          } catch {
            /* ignore */
          }
          await endFacebookLiveVideo(
            created.live.liveVideoId,
            refreshed.pageAccessToken,
          );
          return facebookJson(
            { error: "Failed to save restream on live" },
            500,
            origin,
          );
        }

        return facebookJson(
          {
            ok: true,
            egressId,
            liveVideoId: created.live.liveVideoId,
            watchUrl: created.live.watchUrl,
            pageName: conn.pageName,
          },
          200,
          origin,
        );
      },
    },
  },
});
