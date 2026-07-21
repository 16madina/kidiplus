/**
 * Facebook OAuth + Live Video API helpers (server-only).
 * Env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_OAUTH_REDIRECT_URI,
 *      FACEBOOK_LOGIN_CONFIG_ID (required for Facebook Login for Business)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
const FB_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

/** Scopes for Page list + Live Video create (used when no Login config_id). */
export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "publish_video",
].join(",");

export type FacebookOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Facebook Login for Business configuration id — unlocks Page/Live permissions. */
  configId: string | null;
};

export function getFacebookOAuthConfig(): FacebookOAuthConfig | null {
  const appId = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  const redirectUri = (
    process.env.FACEBOOK_OAUTH_REDIRECT_URI ??
    "https://kidiplus.com/api/facebook/oauth/callback"
  ).trim();
  const configId = (process.env.FACEBOOK_LOGIN_CONFIG_ID ?? "").trim() || null;
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri, configId };
}

export type FacebookOAuthState = {
  userId: string;
  native: boolean;
  returnPath: string;
  exp: number;
};

export function signFacebookOAuthState(
  payload: FacebookOAuthState,
  cfg: FacebookOAuthConfig,
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", cfg.appSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyFacebookOAuthState(
  state: string,
  cfg: FacebookOAuthConfig,
): FacebookOAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", cfg.appSecret).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as FacebookOAuthState;
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

export function buildFacebookAuthUrl(opts: {
  cfg: FacebookOAuthConfig;
  state: string;
}): string {
  const u = new URL(FB_DIALOG);
  u.searchParams.set("client_id", opts.cfg.appId);
  u.searchParams.set("redirect_uri", opts.cfg.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("response_type", "code");
  // Always request comment-read scopes. Login for Business still needs the same
  // permissions listed on the Meta Configuration (config_id).
  u.searchParams.set("scope", FACEBOOK_OAUTH_SCOPES);
  // Force Meta to re-prompt so newly added Login Configuration permissions
  // (e.g. pages_read_user_content) are actually granted on the token.
  u.searchParams.set("auth_type", "rerequest");
  if (opts.cfg.configId) {
    u.searchParams.set("config_id", opts.cfg.configId);
    u.searchParams.set("override_default_response_type", "true");
  }
  return u.toString();
}

export async function exchangeFacebookCode(
  code: string,
  cfg: FacebookOAuthConfig,
): Promise<
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; error: string }
> {
  const u = new URL(`${GRAPH}/oauth/access_token`);
  u.searchParams.set("client_id", cfg.appId);
  u.searchParams.set("client_secret", cfg.appSecret);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("code", code);
  const res = await fetch(u.toString());
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error?.message || `facebook_token_${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
  };
}

/** Exchange short-lived user token for ~60-day long-lived token. */
export async function exchangeLongLivedUserToken(
  shortLivedToken: string,
  cfg: FacebookOAuthConfig,
): Promise<
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; error: string }
> {
  const u = new URL(`${GRAPH}/oauth/access_token`);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", cfg.appId);
  u.searchParams.set("client_secret", cfg.appSecret);
  u.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetch(u.toString());
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error?.message || `facebook_ll_token_${res.status}`,
    };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 5_184_000,
  };
}

export type FacebookPage = {
  id: string;
  name: string;
  accessToken: string;
};

export async function fetchFacebookPages(
  userAccessToken: string,
): Promise<{ ok: true; pages: FacebookPage[] } | { ok: false; error: string }> {
  const u = new URL(`${GRAPH}/me/accounts`);
  u.searchParams.set("fields", "id,name,access_token");
  u.searchParams.set("limit", "100");
  u.searchParams.set("access_token", userAccessToken);
  const res = await fetch(u.toString());
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data.error?.message || `facebook_pages_${res.status}` };
  }
  const pages = (data.data ?? [])
    .filter((p) => p.id && p.access_token)
    .map((p) => ({
      id: p.id!,
      name: (p.name ?? "Page").trim() || "Page",
      accessToken: p.access_token!,
    }));
  return { ok: true, pages };
}

export async function fetchFacebookTokenPermissions(
  accessToken: string,
): Promise<{ ok: true; granted: string[] } | { ok: false; error: string }> {
  const u = new URL(`${GRAPH}/me/permissions`);
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString());
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{ permission?: string; status?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `facebook_permissions_${res.status}`,
    };
  }
  const granted = (data.data ?? [])
    .filter((p) => p.status === "granted" && p.permission)
    .map((p) => p.permission!);
  return { ok: true, granted };
}

const REQUIRED_LIVE_PERMISSIONS = [
  "pages_read_engagement",
  "pages_manage_posts",
  "publish_video",
] as const;

/** Needed to read viewer comments on Page Live videos. */
export const REQUIRED_CHAT_PERMISSIONS = [
  "pages_read_engagement",
  "pages_read_user_content",
] as const;

export function missingLivePermissions(granted: string[]): string[] {
  const set = new Set(granted);
  return REQUIRED_LIVE_PERMISSIONS.filter((p) => !set.has(p));
}

export function missingChatPermissions(granted: string[]): string[] {
  const set = new Set(granted);
  return REQUIRED_CHAT_PERMISSIONS.filter((p) => !set.has(p));
}

/** Refresh Page token from /me/accounts (needed after reconnect / new scopes). */
export async function refreshPageAccessToken(opts: {
  userAccessToken: string;
  pageId: string;
}): Promise<
  | { ok: true; pageAccessToken: string; pageName: string }
  | { ok: false; error: string }
> {
  const pagesRes = await fetchFacebookPages(opts.userAccessToken);
  if (!pagesRes.ok) return { ok: false, error: pagesRes.error };
  const page = pagesRes.pages.find((p) => p.id === opts.pageId);
  if (!page) {
    return { ok: false, error: "page_not_found_or_no_access" };
  }
  return {
    ok: true,
    pageAccessToken: page.accessToken,
    pageName: page.name,
  };
}

export type FacebookLiveBundle = {
  liveVideoId: string;
  watchUrl: string;
  rtmpUrl: string;
};

export async function createFacebookLiveVideo(opts: {
  pageId: string;
  pageAccessToken: string;
  title: string;
}): Promise<{ ok: true; live: FacebookLiveBundle } | { ok: false; error: string }> {
  const title = opts.title.trim().slice(0, 100) || "KiDi+ Live";
  const u = new URL(`${GRAPH}/${encodeURIComponent(opts.pageId)}/live_videos`);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      title,
      description: "Live shopping on KiDi+",
      status: "LIVE_NOW",
      access_token: opts.pageAccessToken,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    stream_url?: string;
    secure_stream_url?: string;
    permalink_url?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!res.ok || !data.id) {
    const raw = data.error?.message || `facebook_live_${res.status}`;
    const lower = raw.toLowerCase();
    if (
      lower.includes("permission") ||
      lower.includes("pages_manage_posts") ||
      lower.includes("pages_read_engagement") ||
      data.error?.code === 200
    ) {
      return {
        ok: false,
        error:
          `${raw} — Déconnecte Facebook dans KiDi+, reconnecte en acceptant toutes les permissions (pages_manage_posts, pages_read_engagement, publish_video), puis réessaie.`,
      };
    }
    return { ok: false, error: raw };
  }
  const rtmpUrl = (data.secure_stream_url || data.stream_url || "").trim();
  if (!rtmpUrl) {
    return { ok: false, error: "facebook_live_missing_rtmp" };
  }
  const watchUrl =
    data.permalink_url?.startsWith("http")
      ? data.permalink_url
      : `https://www.facebook.com/${opts.pageId}/videos/${data.id}/`;

  return {
    ok: true,
    live: {
      liveVideoId: data.id,
      watchUrl,
      rtmpUrl,
    },
  };
}

export async function endFacebookLiveVideo(
  liveVideoId: string,
  pageAccessToken: string,
): Promise<void> {
  if (!liveVideoId) return;
  try {
    await fetch(`${GRAPH}/${encodeURIComponent(liveVideoId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        end_live_video: "true",
        access_token: pageAccessToken,
      }),
    });
  } catch (e) {
    console.warn("[facebook] end live video failed", e);
  }
}

export type FacebookChatMessage = {
  id: string;
  authorName: string;
  text: string;
  createdTime: string;
};

type FbCommentRow = {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { name?: string; id?: string };
};

function mapFbCommentRows(rows: FbCommentRow[] | undefined): FacebookChatMessage[] {
  const messages: FacebookChatMessage[] = [];
  for (const row of rows ?? []) {
    const text = (row.message ?? "").trim();
    if (!row.id || !text) continue;
    messages.push({
      id: row.id,
      authorName: row.from?.name?.trim() || "Facebook",
      text: text.slice(0, 500),
      createdTime: row.created_time || new Date().toISOString(),
    });
  }
  return messages;
}

function facebookPermissionError(raw: string, code?: number): string {
  const lower = raw.toLowerCase();
  if (
    code === 200 ||
    code === 283 ||
    lower.includes("permission") ||
    lower.includes("pages_read") ||
    lower.includes("(#10)")
  ) {
    return (
      `${raw} — Dans Meta (app KiDi+), ajoute pages_read_user_content à la Login Configuration, ` +
      `puis déconnecte / reconnecte Facebook dans KiDi+. En mode Dev, le commentateur doit être ` +
      `Admin/Développeur/Testeur de l'app Meta.`
    );
  }
  return raw;
}

async function fetchCommentsOnObject(opts: {
  objectId: string;
  pageAccessToken: string;
  includeFrom: boolean;
}): Promise<
  | { ok: true; messages: FacebookChatMessage[] }
  | { ok: false; error: string; code?: number }
> {
  const u = new URL(
    `${GRAPH}/${encodeURIComponent(opts.objectId)}/comments`,
  );
  u.searchParams.set("order", "reverse_chronological");
  u.searchParams.set("live_filter", "no_filter");
  u.searchParams.set("filter", "toplevel");
  u.searchParams.set(
    "fields",
    opts.includeFrom
      ? "id,from{name,id},message,created_time"
      : "id,message,created_time",
  );
  u.searchParams.set("limit", "50");
  u.searchParams.set("summary", "true");
  u.searchParams.set("access_token", opts.pageAccessToken);

  const res = await fetch(u.toString());
  const data = (await res.json().catch(() => ({}))) as {
    data?: FbCommentRow[];
    summary?: { total_count?: number };
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `facebook_comments_${res.status}`,
      code: data.error?.code,
    };
  }
  return { ok: true, messages: mapFbCommentRows(data.data) };
}

async function resolveFacebookCommentTargets(
  liveVideoId: string,
  pageAccessToken: string,
): Promise<string[]> {
  const ids = [liveVideoId];
  try {
    const u = new URL(`${GRAPH}/${encodeURIComponent(liveVideoId)}`);
    u.searchParams.set("fields", "id,video");
    u.searchParams.set("access_token", pageAccessToken);
    const res = await fetch(u.toString());
    const data = (await res.json().catch(() => ({}))) as {
      video?: { id?: string } | string;
    };
    const videoId =
      typeof data.video === "string"
        ? data.video
        : data.video?.id?.trim() || "";
    if (videoId && videoId !== liveVideoId) ids.push(videoId);
  } catch (e) {
    console.warn("[facebook] resolve video id failed", e);
  }
  return ids;
}

/**
 * Comments on a Live Video (+ underlying Video when different).
 * Meta defaults to live_filter=filter_low_quality which hides short tests.
 * Client dedupes by id.
 */
export async function pollFacebookLiveComments(opts: {
  liveVideoId: string;
  pageAccessToken: string;
}): Promise<
  | { ok: true; messages: FacebookChatMessage[]; hint?: string }
  | { ok: false; error: string }
> {
  const targets = await resolveFacebookCommentTargets(
    opts.liveVideoId,
    opts.pageAccessToken,
  );
  const byId = new Map<string, FacebookChatMessage>();
  let lastError: string | null = null;

  for (const objectId of targets) {
    let polled = await fetchCommentsOnObject({
      objectId,
      pageAccessToken: opts.pageAccessToken,
      includeFrom: true,
    });
    // Some Page tokens can list messages but not `from` — retry without it.
    if (!polled.ok) {
      const retry = await fetchCommentsOnObject({
        objectId,
        pageAccessToken: opts.pageAccessToken,
        includeFrom: false,
      });
      if (retry.ok) {
        polled = retry;
      } else {
        lastError = facebookPermissionError(polled.error, polled.code);
        continue;
      }
    }
    for (const m of polled.messages) byId.set(m.id, m);
  }

  if (byId.size === 0 && lastError) {
    return { ok: false, error: lastError };
  }

  const messages = Array.from(byId.values()).sort((a, b) =>
    a.createdTime.localeCompare(b.createdTime),
  );

  // Empty but successful: often Dev-mode / missing Advanced Access.
  const hint =
    messages.length === 0
      ? "Aucun commentaire Graph. Vérifie pages_read_user_content + rôles Meta (Admin/Testeur), et commente bien sur CE live Facebook."
      : undefined;

  return { ok: true, messages, hint };
}

export async function postFacebookLiveComment(opts: {
  /** Live video id, or a parent comment id to reply. */
  objectId: string;
  pageAccessToken: string;
  text: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const text = opts.text.trim().slice(0, 8000);
  if (!text) return { ok: false, error: "empty_message" };

  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(opts.objectId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: text,
        access_token: opts.pageAccessToken,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    return {
      ok: false,
      error: data.error?.message || `facebook_comment_post_${res.status}`,
    };
  }
  return { ok: true, id: data.id };
}

export async function getFacebookConnection(userId: string): Promise<
  | {
      ok: true;
      userAccessToken: string;
      pageId: string | null;
      pageName: string | null;
      pageAccessToken: string | null;
      needsPageSelection: boolean;
    }
  | { ok: false; error: string }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("seller_facebook_connections")
    .select(
      "user_access_token, page_id, page_name, page_access_token",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "facebook_not_connected" };

  const needsPageSelection = !data.page_id || !data.page_access_token;
  return {
    ok: true,
    userAccessToken: data.user_access_token,
    pageId: data.page_id,
    pageName: data.page_name,
    pageAccessToken: data.page_access_token,
    needsPageSelection,
  };
}
