/**
 * Facebook OAuth + Live Video API helpers (server-only).
 * Env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_OAUTH_REDIRECT_URI
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
const FB_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

/** Scopes for Page list + Live Video create. */
export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "publish_video",
].join(",");

export type FacebookOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getFacebookOAuthConfig(): FacebookOAuthConfig | null {
  const appId = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  const redirectUri = (
    process.env.FACEBOOK_OAUTH_REDIRECT_URI ??
    "https://kidiplus.com/api/facebook/oauth/callback"
  ).trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri };
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
  u.searchParams.set("scope", FACEBOOK_OAUTH_SCOPES);
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
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    return {
      ok: false,
      error: data.error?.message || `facebook_live_${res.status}`,
    };
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
