/**
 * Central email configuration.
 *
 * Change these values to update every email template + deep-link at once:
 * - APP_NAME       → displayed brand name in emails
 * - WEB_URL        → base URL of the website (also used as fallback when the
 *                    mobile app isn't installed)
 * - LOGO_URL       → absolute URL of the logo shown in email headers
 * - APP_SCHEME     → custom URL scheme used to open the native app
 *                    (e.g. "kidiplus" → kidiplus://path)
 * - FALLBACK_URL   → where users land when the native app can't be opened
 *                    (defaults to the download page so we surface store links)
 */
export const EMAIL_CONFIG = {
  APP_NAME: 'KIDI+',
  WEB_URL: 'https://kidiplus.com',
  LOGO_URL: 'https://kidiplus.com/kidi-plus-logo.png',
  APP_SCHEME: 'kidiplus',
  FALLBACK_URL: 'https://kidiplus.com/download',
} as const

/**
 * Build a bridge link used inside emails. The `/open` route on the web app
 * attempts to launch the native app via the custom scheme on mobile, and
 * falls back to `EMAIL_CONFIG.FALLBACK_URL` (download page) when the app is
 * absent — so recipients on desktop or without the app always have a path
 * forward.
 */
export function buildOpenLink(path: string, webUrl: string = EMAIL_CONFIG.WEB_URL) {
  const safePath = path.startsWith('/') ? path : `/${path}`
  return `${webUrl}/open?path=${encodeURIComponent(safePath)}`
}
