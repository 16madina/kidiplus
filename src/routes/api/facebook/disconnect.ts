// POST /api/facebook/disconnect

import { createFileRoute } from "@tanstack/react-router";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";

export const Route = createFileRoute("/api/facebook/disconnect")({
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

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        await supabaseAdmin
          .from("seller_facebook_connections")
          .delete()
          .eq("user_id", userId);

        return facebookJson({ ok: true }, 200, origin);
      },
    },
  },
});
