// Android App Links — assetlinks.json.
//
// Google verifies this file when the app is installed (or updated) to grant
// the `android:autoVerify="true"` intent-filter, so https://kidiplus.com
// links open the KiDi+ app directly instead of the browser.
//
// The SHA-256 fingerprints below MUST match the certificate that signs the
// APK/AAB the user actually installs:
//
//   • Play Store (Internal test / Prod)  → use the "App signing key
//     certificate" SHA-256 from Play Console → Release → Setup → App
//     integrity → App signing.
//   • Local debug builds                  → use the SHA-256 of ~/.android/debug.keystore
//     (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey
//     -storepass android -keypass android`).
//
// You can list several fingerprints — add both the Play signing key AND the
// upload key so the file works on Play Store builds and on your own signed
// APKs.
import { createFileRoute } from '@tanstack/react-router'

const ASSETLINKS = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'com.kidiplus.app',
      sha256_cert_fingerprints: [
        // Play App Signing SHA-256 (Play Console → App integrity → App signing).
        '2D:75:59:2A:FC:48:91:07:9C:64:1B:6B:50:47:C5:1A:0F:BC:ED:81:CB:E3:ED:07:CF:18:E9:3D:0E:84:D3:F8',
      ],
    },
  },
]

export const Route = createFileRoute('/.well-known/assetlinks.json')({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(ASSETLINKS), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
