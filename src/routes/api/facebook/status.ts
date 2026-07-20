// GET /api/facebook/status

import { createFileRoute } from "@tanstack/react-router";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";

export const Route = createFileRoute("/api/facebook/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: facebookCorsHeaders(
            request.headers.get("origin"),
            "GET, OPTIONS",
          ),
        }),

      GET: async ({ request }) => {
        const auth = await requireFacebookApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("seller_facebook_connections")
          .select("page_id, page_name, connected_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (!data) {
          return facebookJson(
            { connected: false, needsPageSelection: false },
            200,
            origin,
            "GET, OPTIONS",
          );
        }

        const needsPageSelection = !data.page_id;
        return facebookJson(
          {
            connected: true,
            needsPageSelection,
            pageId: data.page_id,
            pageName: data.page_name,
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
