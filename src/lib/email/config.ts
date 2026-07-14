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
  LOGO_URL: 'https://kidiplus.com/icon-192.png',
  APP_SCHEME: 'kidiplus',
  // When the native app can't be opened, send users to the store landing.
  FALLBACK_URL: 'https://kidiplus.com/download',
  // Store URLs — Play works with the package id; App Store needs the numeric
  // Apple ID once the app is on App Store Connect (replace APP_STORE_ID).
  APP_STORE_URL: 'https://apps.apple.com/app/idYOUR_APP_STORE_ID',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.kidiplus.app',
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
