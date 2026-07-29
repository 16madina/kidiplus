/**
 * Universal Links / App Links / custom-scheme helpers.
 *
 * Shared https://kidiplus.com/… URLs open the native app when installed
 * (via Associated Domains / Android App Links). Custom scheme
 * `kidiplus://…` is the fallback used by /open and /join bridge pages.
 */

export const DEEP_LINK_HOSTS = new Set(["kidiplus.com", "www.kidiplus.com"]);

/**
 * Note: Android App Links only claim the apex host `kidiplus.com`.
 * `www.kidiplus.com` 302-redirects to apex, which breaks Digital Asset Links
 * verification (Google disallows redirects for assetlinks.json).
 * Keep www here so if a www URL somehow reaches the app, we still route it.
 */

export function isAllowedDeepLinkPath(pathname: string): boolean {
  if (pathname.startsWith("/live/")) return true;
  if (pathname.startsWith("/join/")) return true;
  if (pathname === "/open" || pathname.startsWith("/open/")) return true;
  if (pathname === "/paypal-return" || pathname.startsWith("/paypal-return/")) return true;
  if (pathname === "/paypal-done" || pathname.startsWith("/paypal-done/")) return true;
  if (pathname === "/wallet" || pathname.startsWith("/wallet/")) return true;
  if (pathname === "/auth-callback" || pathname.startsWith("/auth-callback/")) return true;
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) return true;
  if (pathname === "/download" || pathname.startsWith("/download/")) return true;
  if (pathname === "/youtube-connected" || pathname.startsWith("/youtube-connected/")) return true;
  if (pathname === "/facebook-connected" || pathname.startsWith("/facebook-connected/")) return true;
  return false;
}

/**
 * Turn a Capacitor `appUrlOpen` / launch URL into an in-app path
 * (`/live/abc?x=1`). Returns null if the URL is not ours.
 *
 * Examples:
 *   https://kidiplus.com/live/abc     → /live/abc
 *   kidiplus://live/abc               → /live/abc
 *   kidiplus://auth-callback?code=…   → /auth-callback?code=…
 */
export function pathFromDeepLinkUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    if (!DEEP_LINK_HOSTS.has(url.hostname)) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return isAllowedDeepLinkPath(url.pathname) ? path : null;
  }

  // Custom scheme: kidiplus://host/path?query
  if (url.protocol === "kidiplus:") {
    const host = url.hostname; // e.g. "live" or "auth-callback"
    if (!host) return null;
    const rest = url.pathname === "/" ? "" : url.pathname;
    const pathname = `/${host}${rest}`;
    const path = `${pathname}${url.search}${url.hash}`;
    return isAllowedDeepLinkPath(pathname) ? path : null;
  }

  return null;
}

/** Public https share URL for a live (Universal Link). */
export function liveShareUrl(liveId: string): string {
  return `https://kidiplus.com/live/${encodeURIComponent(liveId)}`;
}

/** Description blurb for YouTube / Facebook Live — drives downloads. */
export function liveSocialDescription(opts: {
  title?: string | null;
  liveId: string;
}): string {
  const title = (opts.title ?? "").trim() || "Live shopping KiDi+";
  const url = liveShareUrl(opts.liveId);
  return (
    `${title}\n\n` +
    `Enchéris et achète en direct sur KiDi+ 👇\n${url}\n\n` +
    `Télécharge l’app KiDi+ pour participer aux enchères.`
  );
}
