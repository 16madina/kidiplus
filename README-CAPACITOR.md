# Capacitor — iOS & Android

This app ships with a native shell via Capacitor 8. All plugin calls are
guarded by `Capacitor.isNativePlatform()` so the app runs identically in the
browser.

## Config

- `appId`: `com.deedigital.liveshop` (placeholder — change before store submission)
- `appName`: `LiveShop`
- `webDir`: `dist`
- Portrait-locked (set in the generated Xcode / Android Studio projects)
- Splash: dark `#0B0B0F`, manually hidden with a short fade after boot
- Status bar: overlays webview, style follows dark/light theme; live viewer forces light content

## Plugins in use

| Plugin | Where |
| --- | --- |
| `@capacitor/haptics` | `src/lib/haptics.ts`, wired into `<Press>`, bids, hearts, buy confirm, countdown ≤10 |
| `@capacitor/status-bar` | `src/lib/native.ts` (theme sync + live viewer override) |
| `@capacitor/keyboard` | Resize mode `native`; dismissed on feed scroll |
| `@capacitor/splash-screen` | Hidden with fade from `bootstrapNative()` |
| `@capacitor/push-notifications` | `src/lib/push.tsx` (pre-prompt sheet, permission state, token handler) |
| `@capacitor/app` | Android back button + foreground/background pause of live simulations |

## Build & run

```bash
# 1. Build the web bundle
bun run build

# 2. First-time only — add the native projects
bunx cap add ios
bunx cap add android

# 3. Sync the built web assets + plugins into the native projects
bunx cap sync

# 4. Open in the respective IDE
bunx cap open ios      # requires Xcode + CocoaPods (macOS)
bunx cap open android  # requires Android Studio + JDK 17
```

## Portrait lock

- **iOS**: Xcode → target → General → Deployment Info → check only *Portrait*.
- **Android**: `android/app/src/main/AndroidManifest.xml` → add
  `android:screenOrientation="portrait"` on the main `<activity>`.

## Live reload against dev server

Uncomment `server.url` in `capacitor.config.ts` and set your machine's LAN IP:

```ts
server: { url: "http://192.168.1.10:8080", cleartext: true }
```

Then `bunx cap sync` and run from Xcode / Android Studio.

## Push notifications

- iOS: enable *Push Notifications* capability in Xcode; upload APNs key to your provider.
- Android: add `google-services.json` to `android/app/` and follow the Firebase setup.
- The device token is logged from `src/lib/push.tsx` (`registration` listener) — forward it to your backend there.
