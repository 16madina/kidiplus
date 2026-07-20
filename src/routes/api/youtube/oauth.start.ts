// POST /api/youtube/oauth/start
// Returns Google OAuth URL for connecting a seller's YouTube account.

import { createFileRoute } from "@tanstack/react-router";
import {
  requireYoutubeApiUser,
  youtubeCorsHeaders,
  youtubeJson,
} from "@/lib/youtube-api-auth";
import {
  buildYoutubeAuthUrl,
  getYoutubeOAuthConfig,
  signYoutubeOAuthState,
} from "@/lib/youtube.server";

export const Route = createFileRoute("/api/youtube/oauth/start")({
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

        const cfg = getYoutubeOAuthConfig();
        if (!cfg) {
          return youtubeJson(
            {
              error: "youtube_not_configured",
              message:
                "Missing GOOGLE_YOUTUBE_CLIENT_ID / GOOGLE_YOUTUBE_CLIENT_SECRET",
            },
            500,
            origin,
          );
        }

        let body: { native?: unknown; returnPath?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* empty body ok */
        }

        const native = body.native === true;
        const returnPath =
          typeof body.returnPath === "string" &&
          body.returnPath.startsWith("/") &&
          body.returnPath.length < 200
            ? body.returnPath
            : "/";

        const state = signYoutubeOAuthState(
          {
            userId,
            native,
            returnPath,
            exp: Date.now() + 15 * 60_000,
          },
          cfg,
        );

        const url = buildYoutubeAuthUrl({ cfg, state });
        return youtubeJson({ url }, 200, origin);
      },
    },
  },
});
