// Shared CORS allowlist for KiDi+ API routes.
//
// The KiDi+ WebView loads under these origins in the native app:
//   - iOS Capacitor:  `capacitor://localhost` (scheme `capacitor:`, host `localhost`)
//   - iOS legacy:     `ionic://localhost`
//   - Android:        `https://localhost` (default `androidScheme: "https"`).
//                     Older Capacitor configs use `http://localhost`.
//
// All of the above satisfy the hostname suffix `localhost` below, so both
// `http://localhost` and `https://localhost` are accepted without needing
// a scheme entry. The native scheme list only covers non-http(s) schemes.
//
// Web origins are matched by hostname suffix (subdomains allowed). Native
// custom-scheme origins are matched by URL scheme.

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
