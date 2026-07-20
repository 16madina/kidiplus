/**
 * Public origin for LiveKit Web Egress Chrome to load /broadcast pages.
 * Must be a stable public https host (never Capacitor / localhost / ephemeral
 * preview origins that egress cannot reliably open).
 */

const FALLBACK = "https://kidiplus.com";

function isUsableHttpsOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Prefer production APP_URL, else kidiplus.com. */
export function broadcastEgressOrigin(): string {
  for (const raw of [
    process.env.BROADCAST_EGRESS_ORIGIN,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
  ]) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    try {
      const origin = new URL(v).origin;
      if (isUsableHttpsOrigin(origin)) return origin;
    } catch {
      /* ignore */
    }
  }
  return FALLBACK;
}
