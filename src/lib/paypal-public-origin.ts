// Resolve a public https origin for PayPal return/cancel URLs.
// Must NOT be capacitor://localhost — PayPal redirects there fail, and the
// session is lost if the page opens in Safari outside the Capacitor WebView.

const FALLBACK = "https://kidiplus.com";

function isUsablePublicOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Prefer APP_URL / PUBLIC_APP_URL, then a real request Origin, else kidiplus.com. */
export function publicAppOrigin(request: Request): string {
  for (const raw of [
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.VITE_APP_URL,
  ]) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    try {
      const origin = new URL(v).origin;
      if (isUsablePublicOrigin(origin)) return origin;
    } catch {
      /* ignore */
    }
  }

  const headerOrigin = request.headers.get("origin");
  if (headerOrigin && isUsablePublicOrigin(headerOrigin)) return headerOrigin;

  try {
    const fromUrl = new URL(request.url).origin;
    if (isUsablePublicOrigin(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }

  return FALLBACK;
}

/**
 * Origin for Stripe Connect Account Link return/refresh URLs.
 * Unlike PayPal, Stripe accepts http://localhost — and local onboarding
 * must return to the local app, not kidiplus.com (different backend).
 */
export function connectReturnOrigin(request: Request): string {
  const headerOrigin = request.headers.get("origin");
  if (headerOrigin) {
    try {
      const u = new URL(headerOrigin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    } catch {
      /* ignore */
    }
  }
  try {
    const fromUrl = new URL(request.url).origin;
    if (fromUrl.startsWith("http")) return fromUrl;
  } catch {
    /* ignore */
  }
  return publicAppOrigin(request);
}

/**
 * Same as connectReturnOrigin, but Stripe livemode rejects non-HTTPS
 * return/refresh URLs — fall back to the public https origin then.
 */
export function connectReturnOriginForMode(request: Request, live: boolean): string {
  const origin = connectReturnOrigin(request);
  if (live && !origin.startsWith("https:")) return publicAppOrigin(request);
  return origin;
}
