// POST /api/facebook/oauth/start

import { createFileRoute } from "@tanstack/react-router";
import {
  facebookCorsHeaders,
  facebookJson,
  requireFacebookApiUser,
} from "@/lib/facebook-api-auth";
import {
  buildFacebookAuthUrl,
  getFacebookOAuthConfig,
  signFacebookOAuthState,
} from "@/lib/facebook.server";

export const Route = createFileRoute("/api/facebook/oauth/start")({
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

        const cfg = getFacebookOAuthConfig();
        if (!cfg) {
          return facebookJson(
            {
              error: "facebook_not_configured",
              message:
                "Missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET",
            },
            500,
            origin,
          );
        }

        let body: { native?: unknown; returnPath?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* empty ok */
        }

        const native = body.native === true;
        const returnPath =
          typeof body.returnPath === "string" &&
          body.returnPath.startsWith("/") &&
          body.returnPath.length < 200
            ? body.returnPath
            : "/";

        const state = signFacebookOAuthState(
          {
            userId,
            native,
            returnPath,
            exp: Date.now() + 15 * 60_000,
          },
          cfg,
        );

        return facebookJson(
          { url: buildFacebookAuthUrl({ cfg, state }) },
          200,
          origin,
        );
      },
    },
  },
});
