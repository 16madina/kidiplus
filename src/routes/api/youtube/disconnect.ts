// POST /api/youtube/disconnect

import { createFileRoute } from "@tanstack/react-router";
import {
  requireYoutubeApiUser,
  youtubeCorsHeaders,
  youtubeJson,
} from "@/lib/youtube-api-auth";

export const Route = createFileRoute("/api/youtube/disconnect")({
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

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        await supabaseAdmin
          .from("seller_youtube_connections")
          .delete()
          .eq("user_id", userId);

        return youtubeJson({ ok: true }, 200, origin);
      },
    },
  },
});
