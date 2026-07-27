// GET /api/facebook/pages — list Pages for the connected seller
// POST /api/facebook/pages — select a Page { pageId }

import { createFileRoute } from "@tanstack/react-router";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";
import { fetchFacebookPages } from "@/lib/facebook.server";

export const Route = createFileRoute("/api/facebook/pages")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: facebookCorsHeaders(
            request.headers.get("origin"),
            "GET, POST, OPTIONS",
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
          .select("user_access_token, page_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!data) {
          return facebookJson(
            { error: "facebook_not_connected" },
            400,
            origin,
            "GET, POST, OPTIONS",
          );
        }

        const pagesRes = await fetchFacebookPages(data.user_access_token);
        if (!pagesRes.ok) {
          return facebookJson(
            { error: pagesRes.error },
            502,
            origin,
            "GET, POST, OPTIONS",
          );
        }

        return facebookJson(
          {
            pages: pagesRes.pages.map((p) => ({ id: p.id, name: p.name })),
            selectedPageId: data.page_id,
          },
          200,
          origin,
          "GET, POST, OPTIONS",
        );
      },

      POST: async ({ request }) => {
        const auth = await requireFacebookApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: { pageId?: unknown };
        try {
          body = await request.json();
        } catch {
          return facebookJson({ error: "Invalid JSON body" }, 400, origin);
        }
        const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
        if (!pageId) {
          return facebookJson({ error: "Missing pageId" }, 400, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("seller_facebook_connections")
          .select("user_access_token")
          .eq("user_id", userId)
          .maybeSingle();

        if (!data) {
          return facebookJson({ error: "facebook_not_connected" }, 400, origin);
        }

        const pagesRes = await fetchFacebookPages(data.user_access_token);
        if (!pagesRes.ok) {
          return facebookJson({ error: pagesRes.error }, 502, origin);
        }
        const page = pagesRes.pages.find((p) => p.id === pageId);
        if (!page) {
          return facebookJson({ error: "page_not_found" }, 404, origin);
        }

        const { error } = await supabaseAdmin
          .from("seller_facebook_connections")
          .update({
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.accessToken,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (error) {
          return facebookJson({ error: "Failed to save page" }, 500, origin);
        }

        return facebookJson(
          { ok: true, pageId: page.id, pageName: page.name },
          200,
          origin,
        );
      },
    },
  },
});
