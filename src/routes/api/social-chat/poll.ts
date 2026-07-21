// POST /api/social-chat/poll
// Host polls YouTube Live Chat + Facebook Live comments for an active restream.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getFacebookConnection,
  pollFacebookLiveComments,
  refreshPageAccessToken,
  fetchFacebookTokenPermissions,
  getFacebookOAuthConfig,
  missingChatPermissions,
} from "@/lib/facebook.server";
import {
  fetchYoutubeLiveChatId,
  getValidYoutubeAccessToken,
  pollYoutubeLiveChat,
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

export const Route = createFileRoute("/api/social-chat/poll")({
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
          youtubePageToken?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400, origin);
        }

        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!liveId || !UUID_RE.test(liveId)) {
          return json({ error: "Missing liveId" }, 400, origin);
        }
        const youtubePageToken =
          typeof body.youtubePageToken === "string"
            ? body.youtubePageToken
            : null;

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

        const out: {
          youtube: {
            messages: Array<{
              id: string;
              authorName: string;
              text: string;
              publishedAt: string;
            }>;
            nextPageToken: string | null;
            pollingIntervalMs: number;
            error?: string;
          } | null;
          facebook: {
            messages: Array<{
              id: string;
              authorName: string;
              text: string;
              createdTime: string;
            }>;
            error?: string;
            hint?: string;
          } | null;
        } = { youtube: null, facebook: null };

        if (live.youtube_broadcast_id) {
          const tok = await getValidYoutubeAccessToken(userId);
          if (!tok.ok) {
            out.youtube = {
              messages: [],
              nextPageToken: youtubePageToken,
              pollingIntervalMs: 8000,
              error: tok.error,
            };
          } else {
            const chatId = await fetchYoutubeLiveChatId(
              tok.accessToken,
              live.youtube_broadcast_id,
            );
            if (!chatId) {
              out.youtube = {
                messages: [],
                nextPageToken: youtubePageToken,
                pollingIntervalMs: 8000,
                error: "live_chat_not_ready",
              };
            } else {
              const polled = await pollYoutubeLiveChat({
                accessToken: tok.accessToken,
                liveChatId: chatId,
                pageToken: youtubePageToken,
              });
              if (!polled.ok) {
                out.youtube = {
                  messages: [],
                  nextPageToken: youtubePageToken,
                  pollingIntervalMs: 8000,
                  error: polled.error,
                };
              } else {
                out.youtube = {
                  messages: polled.messages,
                  nextPageToken: polled.nextPageToken,
                  pollingIntervalMs: polled.pollingIntervalMs,
                };
              }
            }
          }
        }

        if (live.facebook_live_video_id) {
          const conn = await getFacebookConnection(userId);
          if (!conn.ok || !conn.pageId) {
            out.facebook = {
              messages: [],
              error: conn.ok ? "facebook_page_required" : conn.error,
            };
          } else {
            const refreshed = await refreshPageAccessToken({
              userAccessToken: conn.userAccessToken,
              pageId: conn.pageId,
            });
            if (!refreshed.ok) {
              out.facebook = { messages: [], error: refreshed.error };
            } else {
              const polled = await pollFacebookLiveComments({
                liveVideoId: live.facebook_live_video_id,
                pageAccessToken: refreshed.pageAccessToken,
              });
              if (!polled.ok) {
                let error = polled.error;
                const looksLikePerm =
                  /#200|permission|pages_read|Missing Permissions/i.test(
                    error,
                  );
                if (looksLikePerm) {
                  const cfg = getFacebookOAuthConfig();
                  const suffix = cfg?.configId
                    ? `…${cfg.configId.slice(-6)}`
                    : "(aucun FACEBOOK_LOGIN_CONFIG_ID)";
                  const perms = await fetchFacebookTokenPermissions(
                    conn.userAccessToken,
                  );
                  if (perms.ok) {
                    const missing = missingChatPermissions(perms.granted);
                    error =
                      `${error} | Sur ton token KiDi+ : [${perms.granted.join(", ") || "aucune"}]` +
                      ` | Manque pour le chat : [${missing.join(", ") || "rien"}]` +
                      ` | Login config utilisée : ${suffix}. ` +
                      `Dans Meta, ouvre EXACTEMENT cette config, coche pages_read_user_content, Save, puis Déconnecter → Connecter Facebook.`;
                  } else {
                    error =
                      `${error} | Login config utilisée : ${suffix}. Impossible de lire /me/permissions (${perms.error}).`;
                  }
                }
                out.facebook = { messages: [], error };
              } else {
                out.facebook = {
                  messages: polled.messages,
                  ...(polled.hint ? { hint: polled.hint } : {}),
                };
              }
            }
          }
        }

        return json(out, 200, origin);
      },
    },
  },
});
