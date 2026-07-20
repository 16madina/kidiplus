// GET /api/youtube/status

import { createFileRoute } from "@tanstack/react-router";
import {
  requireYoutubeApiUser,
  youtubeCorsHeaders,
  youtubeJson,
} from "@/lib/youtube-api-auth";

export const Route = createFileRoute("/api/youtube/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: youtubeCorsHeaders(
            request.headers.get("origin"),
            "GET, OPTIONS",
          ),
        }),

      GET: async ({ request }) => {
        const auth = await requireYoutubeApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("seller_youtube_connections")
          .select("channel_title, channel_id, connected_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (!data) {
          return youtubeJson(
            { connected: false },
            200,
            origin,
            "GET, OPTIONS",
          );
        }

        return youtubeJson(
          {
            connected: true,
            channelTitle: data.channel_title,
            channelId: data.channel_id,
            connectedAt: data.connected_at,
          },
          200,
          origin,
          "GET, OPTIONS",
        );
      },
    },
  },
});
