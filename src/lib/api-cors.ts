// Shared CORS allowlist for KiDi+ API routes.
//
// The KiDi+ WebView loads under these origins in the native app:
//   - iOS Capacitor: `capacitor://localhost` (scheme `capacitor:`, host `localhost`)
//   - iOS legacy:    `ionic://localhost`
//   - Android:       `http://localhost`
//
// These are ADDED to the existing web allowlist so fetch() calls from the
// native WebView aren't rejected by the API's Origin check.
//
// Web origins are matched by hostname suffix (subdomains allowed). Native
// origins are matched by URL scheme.

export const ALLOWED_ORIGIN_SUFFIXES = [
  "lovable.app",
  "lovableproject.com",
  "localhost",
  "127.0.0.1",
  "kidiplus.com",
];

export const ALLOWED_NATIVE_SCHEMES = ["capacitor:", "ionic:"];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin fetches often omit Origin
  try {
    const u = new URL(origin);
    if (ALLOWED_NATIVE_SCHEMES.includes(u.protocol)) return true;
    const host = u.hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
  } catch {
    return false;
  }
}
