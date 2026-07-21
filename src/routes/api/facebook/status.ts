// GET /api/facebook/status

import { createFileRoute } from "@tanstack/react-router";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";
import {
  fetchFacebookTokenPermissions,
  getFacebookOAuthConfig,
  missingChatPermissions,
  missingLivePermissions,
} from "@/lib/facebook.server";

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

        const cfg = getFacebookOAuthConfig();
        const configId = cfg?.configId ?? null;
        const configIdSuffix = configId ? configId.slice(-6) : null;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("seller_facebook_connections")
          .select(
            "page_id, page_name, connected_at, user_access_token",
          )
          .eq("user_id", userId)
          .maybeSingle();

        if (!data) {
          return facebookJson(
            {
              connected: false,
              needsPageSelection: false,
              configIdSuffix,
              hasLoginConfig: !!configId,
            },
            200,
            origin,
            "GET, OPTIONS",
          );
        }

        const needsPageSelection = !data.page_id;
        let granted: string[] = [];
        let missingChat: string[] = [];
        let missingLive: string[] = [];
        let permissionsError: string | null = null;

        if (data.user_access_token) {
          const perms = await fetchFacebookTokenPermissions(
            data.user_access_token,
          );
          if (perms.ok) {
            granted = perms.granted;
            missingChat = missingChatPermissions(granted);
            missingLive = missingLivePermissions(granted);
          } else {
            permissionsError = perms.error;
          }
        }

        return facebookJson(
          {
            connected: true,
            needsPageSelection,
            pageId: data.page_id,
            pageName: data.page_name,
            connectedAt: data.connected_at,
            configIdSuffix,
            hasLoginConfig: !!configId,
            grantedPermissions: granted,
            missingChatPermissions: missingChat,
            missingLivePermissions: missingLive,
            canReadComments: missingChat.length === 0,
            permissionsError,
          },
          200,
          origin,
          "GET, OPTIONS",
        );
      },
    },
  },
});
