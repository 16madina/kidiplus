/**
 * YouTube OAuth + Live Streaming API helpers (server-only).
 * Env: GOOGLE_YOUTUBE_CLIENT_ID, GOOGLE_YOUTUBE_CLIENT_SECRET,
 *      YOUTUBE_OAUTH_REDIRECT_URI (optional, defaults to kidiplus.com callback).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const YT_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const YT_TOKEN = "https://oauth2.googleapis.com/token";
const YT_API = "https://www.googleapis.com/youtube/v3";

/** Full YouTube scope — required for Live Streaming API. */
export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube";

export type YoutubeOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getYoutubeOAuthConfig(): YoutubeOAuthConfig | null {
  const clientId = (process.env.GOOGLE_YOUTUBE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_YOUTUBE_CLIENT_SECRET ?? "").trim();
  const redirectUri = (
    process.env.YOUTUBE_OAUTH_REDIRECT_URI ??
    "https://kidiplus.com/api/youtube/oauth/callback"
  ).trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export type YoutubeOAuthState = {
  userId: string;
  native: boolean;
  returnPath: string;
  exp: number;
};

function stateSecret(cfg: YoutubeOAuthConfig): string {
  return cfg.clientSecret;
}

export function signYoutubeOAuthState(
  payload: YoutubeOAuthState,
  cfg: YoutubeOAuthConfig,
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateSecret(cfg)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyYoutubeOAuthState(
  state: string,
  cfg: YoutubeOAuthConfig,
): YoutubeOAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret(cfg)).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as YoutubeOAuthState;
    if (!parsed?.userId || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return {
      userId: String(parsed.userId),
      native: !!parsed.native,
      returnPath:
        typeof parsed.returnPath === "string" && parsed.returnPath.startsWith("/")
          ? parsed.returnPath
          : "/",
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function buildYoutubeAuthUrl(opts: {
  cfg: YoutubeOAuthConfig;
  state: string;
}): string {
  const u = new URL(YT_AUTH);
  u.searchParams.set("client_id", opts.cfg.clientId);
  u.searchParams.set("redirect_uri", opts.cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YOUTUBE_OAUTH_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export type YoutubeTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};

export async function exchangeYoutubeCode(
  code: string,
  cfg: YoutubeOAuthConfig,
): Promise<{ ok: true; tokens: YoutubeTokenSet } | { ok: false; error: string }> {
  const res = await fetch(YT_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  let data: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { ok: false, error: `youtube_token_bad_json_${res.status}` };
  }
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error_description || data.error || `youtube_token_${res.status}`,
    };
  }
  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
    },
  };
}

export async function refreshYoutubeAccessToken(
  refreshToken: string,
  cfg: YoutubeOAuthConfig,
): Promise<{ ok: true; tokens: YoutubeTokenSet } | { ok: false; error: string }> {
  const res = await fetch(YT_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  let data: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return { ok: false, error: `youtube_refresh_bad_json_${res.status}` };
  }
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error_description || data.error || `youtube_refresh_${res.status}`,
    };
  }
  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
    },
  };
}

export async function fetchYoutubeChannel(
  accessToken: string,
): Promise<
  | { ok: true; channelId: string; channelTitle: string }
  | { ok: false; error: string }
> {
  const u = new URL(`${YT_API}/channels`);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("mine", "true");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data.error?.message || `youtube_channels_${res.status}` };
  }
  const item = data.items?.[0];
  if (!item?.id) return { ok: false, error: "youtube_no_channel" };
  return {
    ok: true,
    channelId: item.id,
    channelTitle: item.snippet?.title?.trim() || "YouTube",
  };
}

export type YoutubeLiveBundle = {
  broadcastId: string;
  streamId: string;
  watchUrl: string;
  rtmpUrl: string;
};

/**
 * Create a YouTube live broadcast + RTMP stream, bind them, enable auto-start.
 */
export async function createYoutubeLiveBroadcast(opts: {
  accessToken: string;
  title: string;
  liveId?: string;
  privacyStatus?: "public" | "unlisted" | "private";
}): Promise<{ ok: true; live: YoutubeLiveBundle } | { ok: false; error: string }> {
  const title = opts.title.trim().slice(0, 100) || "KiDi+ Live";
  const privacyStatus = opts.privacyStatus ?? "public";
  const scheduledStartTime = new Date(Date.now() - 60_000).toISOString();
  const { liveSocialDescription } = await import("@/lib/deep-links");
  const description = opts.liveId
    ? liveSocialDescription({ title, liveId: opts.liveId }).slice(0, 5000)
    : "Live shopping on KiDi+ — télécharge l’app pour enchérir.";

  const broadcastRes = await fetch(
    `${YT_API}/liveBroadcasts?part=snippet,status,contentDetails`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title,
          scheduledStartTime,
          description,
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true,
          // Prefer lower viewer delay (ultraLow ≈ interactive; may limit some YT features).
          latencyPreference: "ultraLow",
          monitorStream: { enableMonitorStream: false },
        },
      }),
    },
  );
  const broadcast = (await broadcastRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!broadcastRes.ok || !broadcast.id) {
    return {
      ok: false,
      error: broadcast.error?.message || `youtube_broadcast_${broadcastRes.status}`,
    };
  }

  const streamRes = await fetch(`${YT_API}/liveStreams?part=snippet,cdn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: { title: `${title} · stream` },
      cdn: {
        frameRate: "variable",
        ingestionType: "rtmp",
        resolution: "variable",
      },
    }),
  });
  const stream = (await streamRes.json().catch(() => ({}))) as {
    id?: string;
    cdn?: {
      ingestionInfo?: {
        ingestionAddress?: string;
        streamName?: string;
      };
    };
    error?: { message?: string };
  };
  if (!streamRes.ok || !stream.id) {
    return {
      ok: false,
      error: stream.error?.message || `youtube_stream_${streamRes.status}`,
    };
  }

  const ingestionAddress = stream.cdn?.ingestionInfo?.ingestionAddress ?? "";
  const streamName = stream.cdn?.ingestionInfo?.streamName ?? "";
  if (!ingestionAddress || !streamName) {
    return { ok: false, error: "youtube_stream_missing_rtmp" };
  }

  const bindRes = await fetch(
    `${YT_API}/liveBroadcasts/bind?id=${encodeURIComponent(broadcast.id)}&part=id,contentDetails&streamId=${encodeURIComponent(stream.id)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    },
  );
  if (!bindRes.ok) {
    const bindErr = (await bindRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    return {
      ok: false,
      error: bindErr.error?.message || `youtube_bind_${bindRes.status}`,
    };
  }

  const base = ingestionAddress.replace(/\/$/, "");
  const rtmpUrl = `${base}/${streamName}`;

  return {
    ok: true,
    live: {
      broadcastId: broadcast.id,
      streamId: stream.id,
      watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`,
      rtmpUrl,
    },
  };
}

export async function completeYoutubeBroadcast(
  accessToken: string,
  broadcastId: string,
): Promise<void> {
  if (!broadcastId) return;
  try {
    await fetch(
      `${YT_API}/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(broadcastId)}&part=status`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (e) {
    console.warn("[youtube] complete broadcast failed", e);
  }
}

/**
 * Wait until the bound liveStream is receiving, then transition broadcast → live.
 * enableAutoStart often fails on Web Egress; without this viewers stay on "À venir".
 *
 * Returns quickly once live (or when maxWaitMs elapses) so serverless + client
 * polling can drive promotion reliably.
 */
export async function promoteYoutubeBroadcastWhenStreamActive(opts: {
  accessToken: string;
  broadcastId: string;
  streamId: string;
  maxWaitMs?: number;
}): Promise<{
  ok: boolean;
  lifeCycleStatus: string | null;
  streamStatus: string | null;
}> {
  const maxWaitMs = opts.maxWaitMs ?? 90_000;
  const started = Date.now();

  const readBroadcastStatus = async (): Promise<string | null> => {
    const u = new URL(`${YT_API}/liveBroadcasts`);
    u.searchParams.set("part", "status");
    u.searchParams.set("id", opts.broadcastId);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ status?: { lifeCycleStatus?: string } }>;
    };
    return data.items?.[0]?.status?.lifeCycleStatus ?? null;
  };

  const readStreamStatus = async (): Promise<string | null> => {
    const u = new URL(`${YT_API}/liveStreams`);
    u.searchParams.set("part", "status");
    u.searchParams.set("id", opts.streamId);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{ status?: { streamStatus?: string } }>;
    };
    return data.items?.[0]?.status?.streamStatus ?? null;
  };

  const transition = async (status: "testing" | "live"): Promise<boolean> => {
    const tr = await fetch(
      `${YT_API}/liveBroadcasts/transition?broadcastStatus=${status}&id=${encodeURIComponent(opts.broadcastId)}&part=status`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      },
    );
    if (!tr.ok) {
      const err = (await tr.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      const reason = err.error?.errors?.[0]?.reason;
      // Already in that state / redundant transition — treat as soft ok.
      if (
        reason === "invalidTransition" ||
        reason === "redundantTransition" ||
        /already|live/i.test(err.error?.message ?? "")
      ) {
        return true;
      }
      console.warn(
        `[youtube] transition ${status} failed`,
        err.error?.message || tr.status,
        reason,
      );
      return false;
    }
    return true;
  };

  let lifeCycleStatus = await readBroadcastStatus();
  if (lifeCycleStatus === "live" || lifeCycleStatus === "liveStarting") {
    return { ok: true, lifeCycleStatus, streamStatus: await readStreamStatus() };
  }

  let streamStatus: string | null = null;
  while (Date.now() - started < maxWaitMs) {
    try {
      lifeCycleStatus = await readBroadcastStatus();
      if (lifeCycleStatus === "live" || lifeCycleStatus === "liveStarting") {
        return { ok: true, lifeCycleStatus, streamStatus };
      }

      streamStatus = await readStreamStatus();
      // active / good = ingesting. "ready" is bound but not receiving yet.
      if (streamStatus === "active" || streamStatus === "good") {
        // monitorStream is off → prefer direct → live (testing often invalid).
        await transition("live");
        await new Promise((r) => setTimeout(r, 600));
        lifeCycleStatus = await readBroadcastStatus();
        if (lifeCycleStatus === "live" || lifeCycleStatus === "liveStarting") {
          return { ok: true, lifeCycleStatus, streamStatus };
        }
        await transition("testing");
        await new Promise((r) => setTimeout(r, 800));
        await transition("live");
        await new Promise((r) => setTimeout(r, 600));
        lifeCycleStatus = await readBroadcastStatus();
        if (lifeCycleStatus === "live" || lifeCycleStatus === "liveStarting") {
          return { ok: true, lifeCycleStatus, streamStatus };
        }
      }
    } catch (e) {
      console.warn("[youtube] promote poll failed", e);
    }
    await new Promise((r) => setTimeout(r, 2_500));
  }

  lifeCycleStatus = await readBroadcastStatus().catch(() => lifeCycleStatus);
  streamStatus = await readStreamStatus().catch(() => streamStatus);
  console.warn("[youtube] promote timed out", { lifeCycleStatus, streamStatus });
  return {
    ok: lifeCycleStatus === "live" || lifeCycleStatus === "liveStarting",
    lifeCycleStatus,
    streamStatus,
  };
}

export type YoutubeChatMessage = {
  id: string;
  authorName: string;
  text: string;
  publishedAt: string;
};

export async function fetchYoutubeLiveChatId(
  accessToken: string,
  broadcastId: string,
): Promise<string | null> {
  const u = new URL(`${YT_API}/liveBroadcasts`);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("id", broadcastId);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{ snippet?: { liveChatId?: string } }>;
  };
  return data.items?.[0]?.snippet?.liveChatId ?? null;
}

export async function pollYoutubeLiveChat(opts: {
  accessToken: string;
  liveChatId: string;
  pageToken?: string | null;
}): Promise<
  | {
      ok: true;
      messages: YoutubeChatMessage[];
      nextPageToken: string | null;
      pollingIntervalMs: number;
    }
  | { ok: false; error: string }
> {
  const u = new URL(`${YT_API}/liveChat/messages`);
  u.searchParams.set("liveChatId", opts.liveChatId);
  u.searchParams.set("part", "snippet,authorDetails");
  u.searchParams.set("maxResults", "50");
  if (opts.pageToken) u.searchParams.set("pageToken", opts.pageToken);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      id?: string;
      snippet?: {
        type?: string;
        displayMessage?: string;
        publishedAt?: string;
        textMessageDetails?: { messageText?: string };
      };
      authorDetails?: { displayName?: string };
    }>;
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `youtube_chat_${res.status}`,
    };
  }

  const messages: YoutubeChatMessage[] = [];
  for (const item of data.items ?? []) {
    if (!item.id) continue;
    const type = item.snippet?.type;
    // Keep plain text (+ treat missing type as text); skip stickers / memberships.
    if (type && type !== "textMessageEvent" && type !== "superChatEvent") {
      continue;
    }
    const text = (
      item.snippet?.textMessageDetails?.messageText ||
      item.snippet?.displayMessage ||
      ""
    ).trim();
    if (!text) continue;
    messages.push({
      id: item.id,
      authorName: item.authorDetails?.displayName?.trim() || "YouTube",
      text: text.slice(0, 500),
      publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
    });
  }

  return {
    ok: true,
    messages,
    nextPageToken: data.nextPageToken ?? null,
    pollingIntervalMs:
      typeof data.pollingIntervalMillis === "number"
        ? Math.max(3000, data.pollingIntervalMillis)
        : 5000,
  };
}

export async function postYoutubeLiveChatMessage(opts: {
  accessToken: string;
  liveChatId: string;
  text: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const text = opts.text.trim().slice(0, 200);
  if (!text) return { ok: false, error: "empty_message" };

  const res = await fetch(`${YT_API}/liveChat/messages?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId: opts.liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text },
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    return {
      ok: false,
      error: data.error?.message || `youtube_chat_post_${res.status}`,
    };
  }
  return { ok: true, id: data.id };
}

/** Load connection + ensure a valid access token (refresh if needed). */
export async function getValidYoutubeAccessToken(
  userId: string,
): Promise<
  | {
      ok: true;
      accessToken: string;
      channelTitle: string | null;
      refreshToken: string;
    }
  | { ok: false; error: string }
> {
  const cfg = getYoutubeOAuthConfig();
  if (!cfg) return { ok: false, error: "youtube_not_configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("seller_youtube_connections")
    .select(
      "refresh_token, access_token, access_token_expires_at, channel_title",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "youtube_not_connected" };
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;
  const stillValid =
    !!row.access_token && expiresAt > Date.now() + 60_000;

  if (stillValid && row.access_token) {
    return {
      ok: true,
      accessToken: row.access_token,
      channelTitle: row.channel_title,
      refreshToken: row.refresh_token,
    };
  }

  const refreshed = await refreshYoutubeAccessToken(row.refresh_token, cfg);
  if (!refreshed.ok) return { ok: false, error: refreshed.error };

  const newExpires = new Date(
    Date.now() + refreshed.tokens.expiresIn * 1000,
  ).toISOString();
  await supabaseAdmin
    .from("seller_youtube_connections")
    .update({
      access_token: refreshed.tokens.accessToken,
      access_token_expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    ok: true,
    accessToken: refreshed.tokens.accessToken,
    channelTitle: row.channel_title,
    refreshToken: row.refresh_token,
  };
}
