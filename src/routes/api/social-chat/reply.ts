// POST /api/social-chat/reply
// Host replies on YouTube Live Chat and/or Facebook Live from KiDi+.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getFacebookConnection,
  postFacebookLiveComment,
  refreshPageAccessToken,
} from "@/lib/facebook.server";
import {
  fetchYoutubeLiveChatId,
  getValidYoutubeAccessToken,
  postYoutubeLiveChatMessage,
} from "@/lib/youtube.server";

function cors(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...cors(origin),
    },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUser(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return {
      ok: false as const,
      response: json({ error: "Origin not allowed" }, 403, origin),
    };
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false as const,
      response: json({ error: "Auth not configured" }, 500, origin),
    };
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: json({ error: "Unauthorized" }, 401, origin),
    };
  }
  const bearer = authHeader.slice("Bearer ".length).trim();
  if (!bearer || bearer.split(".").length !== 3) {
    return {
      ok: false as const,
      response: json({ error: "Unauthorized" }, 401, origin),
    };
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: claimsData, error: claimsError } =
    await supabaseAuth.auth.getClaims(bearer);
  const userId = claimsData?.claims?.sub ?? null;
  if (claimsError || !userId || typeof userId !== "string") {
    return {
      ok: false as const,
      response: json({ error: "Unauthorized" }, 401, origin),
    };
  }
  return { ok: true as const, userId, origin };
}

export const Route = createFileRoute("/api/social-chat/reply")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: cors(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: {
          liveId?: unknown;
          text?: unknown;
          /** Reply only on this platform; omit to post on every active restream. */
          source?: unknown;
          /** Facebook parent comment id (optional). */
          parentExternalId?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400, origin);
        }

        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const source =
          body.source === "youtube" || body.source === "facebook"
            ? body.source
            : "all";
        const parentExternalId =
          typeof body.parentExternalId === "string"
            ? body.parentExternalId.trim()
            : "";

        if (!liveId || !UUID_RE.test(liveId) || !text) {
          return json({ error: "Missing liveId or text" }, 400, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: live, error } = await supabaseAdmin
          .from("lives")
          .select(
            "id, seller_id, youtube_broadcast_id, facebook_live_video_id",
          )
          .eq("id", liveId)
          .maybeSingle();

        if (error || !live) {
          return json({ error: "Live not found" }, 404, origin);
        }
        if (live.seller_id !== userId) {
          return json({ error: "Not authorized" }, 403, origin);
        }

        const results: {
          youtube?: { ok: true; id: string } | { ok: false; error: string };
          facebook?: { ok: true; id: string } | { ok: false; error: string };
        } = {};

        if (
          (source === "all" || source === "youtube") &&
          live.youtube_broadcast_id
        ) {
          const tok = await getValidYoutubeAccessToken(userId);
          if (!tok.ok) {
            results.youtube = { ok: false, error: tok.error };
          } else {
            const chatId = await fetchYoutubeLiveChatId(
              tok.accessToken,
              live.youtube_broadcast_id,
            );
            if (!chatId) {
              results.youtube = { ok: false, error: "live_chat_not_ready" };
            } else {
              results.youtube = await postYoutubeLiveChatMessage({
                accessToken: tok.accessToken,
                liveChatId: chatId,
                text,
              });
            }
          }
        }

        if (
          (source === "all" || source === "facebook") &&
          live.facebook_live_video_id
        ) {
          const conn = await getFacebookConnection(userId);
          if (!conn.ok || !conn.pageId) {
            results.facebook = {
              ok: false,
              error: conn.ok ? "facebook_page_required" : conn.error,
            };
          } else {
            const refreshed = await refreshPageAccessToken({
              userAccessToken: conn.userAccessToken,
              pageId: conn.pageId,
            });
            if (!refreshed.ok) {
              results.facebook = { ok: false, error: refreshed.error };
            } else {
              const objectId =
                source === "facebook" && parentExternalId
                  ? parentExternalId
                  : live.facebook_live_video_id;
              results.facebook = await postFacebookLiveComment({
                objectId,
                pageAccessToken: refreshed.pageAccessToken,
                text,
              });
            }
          }
        }

        const anyOk =
          results.youtube?.ok === true || results.facebook?.ok === true;
        if (!anyOk && (results.youtube || results.facebook)) {
          return json(
            {
              error: "social_reply_failed",
              results,
              message:
                results.youtube && !results.youtube.ok
                  ? results.youtube.error
                  : results.facebook && !results.facebook.ok
                    ? results.facebook.error
                    : "Reply failed",
            },
            502,
            origin,
          );
        }

        return json({ ok: true, results }, 200, origin);
      },
    },
  },
});
