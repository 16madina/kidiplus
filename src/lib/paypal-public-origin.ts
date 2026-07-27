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
