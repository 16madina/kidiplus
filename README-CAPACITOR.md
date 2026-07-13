# Capacitor — iOS & Android

KiDi+ ships with a native shell via Capacitor 8. All plugin calls are guarded
by `Capacitor.isNativePlatform()` so the app runs identically in the browser.

## Config summary

- `appId`: `com.kidiplus.app`
- `appName`: `KiDi+`
- `webDir`: `dist` (bundled launcher — see `scripts/prepare-native.mjs`)
- **No `server.url` in production** — the WebView loads the bundled
  `dist/index.html`, which navigates in-WebView to the live SSR app
  (`kidiplus.lovable.app`) via `server.allowNavigation`. This keeps native
  chrome hidden and prevents Safari hand-off for internal routes.
- Splash: `#0C1122` deep navy, auto-hides after ~1.2 s (plus a manual fade
  from `bootstrapNative()`).
- Status bar: light content over navy splash.

## Production build & run (macOS + Xcode)

```bash
# 1. Install deps
npm install

# 2. Build the native launcher into dist/
npm run build            # runs prepare-native under the hood if configured;
                         # otherwise: node scripts/prepare-native.mjs
node scripts/prepare-native.mjs

# 3. Sync Capacitor config + plugins into the native iOS project
npx cap sync ios

# 4. Open Xcode, pick your device, press ▶
npx cap open ios
```

Android is the same with `npx cap sync android` / `npx cap open android`.

### First-time only (per platform)

```bash
npx cap add ios
npx cap add android
```

## Branded icons & splash

See `resources/README.md`. Drop `icon.png` (1024²) and `splash.png` (2732²)
into `resources/`, then:

```bash
npm i -D @capacitor/assets
npx @capacitor/assets generate \
  --iconBackgroundColor "#0C1122" \
  --splashBackgroundColor "#0C1122"
npx cap sync
```

## Dev hot-reload (optional)

Edit `capacitor.config.ts` and uncomment the `server` block with your Mac's
LAN IP (see the banner in that file). Then:

```bash
bun run dev            # start Vite on 0.0.0.0:8080
npx cap sync ios
npx cap run ios
```

Revert the change (or set the env `NATIVE_APP_URL`) before shipping.

## Portrait lock

- **iOS**: Xcode → target → General → Deployment Info → check only *Portrait*.
- **Android**: `android/app/src/main/AndroidManifest.xml` → add
  `android:screenOrientation="portrait"` on the main `<activity>`.

## Allowed API origins (native WebView)

The API routes (`/api/livekit-token`, `/api/checkout`, `/api/checkout/confirm`,
`/api/wallet-topup`, `/api/wallet-topup/confirm`, `/api/account/delete`) share
one CORS allowlist. It permits, in addition to web origins:

- `capacitor://localhost` (iOS WebView origin)
- `ionic://localhost`     (legacy iOS scheme)
- `https://localhost`     (Android WebView origin — default `androidScheme: "https"`)
- `http://localhost`      (Android WebView if `androidScheme: "http"`)

All four match via the `localhost` hostname suffix in `src/lib/api-cors.ts`,
so both http and https on `localhost` are accepted automatically.

## Push notifications

- iOS: enable *Push Notifications* capability in Xcode; upload APNs key.
- Android: add `google-services.json` to `android/app/`.
- Device token is logged from `src/lib/push.tsx` (`registration` listener) —
  forward it to your backend there.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| App shows Safari-style bottom bar | `server.url` is set → WebView loaded a remote origin as a "web app" | Ensure `server.url` is commented out in `capacitor.config.ts`; rebuild + `cap sync` |
| Stuck on default blue Capacitor splash | JS never boots (missing bundled `dist/`) or API allowlist blocks `capacitor://localhost` startup fetch | Run `node scripts/prepare-native.mjs`, confirm `dist/index.html` exists, then `cap sync`. Verify the origin allowlist includes `capacitor://localhost`. |
| Tapping an in-app link opens Safari | Target host missing from `server.allowNavigation` | Add the host to the array in `capacitor.config.ts` |
| Android splash video shows a large play button | Android WebView default video poster overlay | Apply the `MainActivity.java` patch below, then run `npx cap sync android` and Run in Android Studio |

## Android — production build & run (Windows + Android Studio)

```bat
git pull
npm install
node scripts/prepare-native.mjs
npx cap sync android
npx cap open android
```

Then in Android Studio: pick your device (or emulator) → press ▶ Run.

### Android system Picture-in-Picture (live viewer)

While watching a live on Android, pressing **Home** (or leaving the app)
enters system PiP so the live keeps playing over other apps. Tap the PiP
window to return to KiDi+ full screen. Closing the system PiP window (or
the host ending the live) ends the viewer session.

Requires a native rebuild after pulling:

```bat
npx cap sync android
```

Then Run in Android Studio. Key pieces:

- `AndroidManifest` — `supportsPictureInPicture="true"`
- `PipPlugin` + `MainActivity` — auto-enter / dismiss PiP
- JS `LivePipController` — keeps LiveKit connected during PiP

### iOS system Picture-in-Picture (native LiveKit)

iOS cannot PiP the Capacitor WebView. Instead, while a live is open the app
opens a **second native LiveKit viewer** and feeds frames into
`AVPictureInPictureController` (same pattern as LiveKit’s `minimal-pip` sample).

**On your Mac:**

```bash
git fetch origin
git checkout feature/ios-native-pip
git pull origin feature/ios-native-pip
npm install
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Wait for SPM to resolve **LiveKit** (`client-sdk-swift`) — first open may take a few minutes.
2. Select your Team under Signing & Capabilities.
3. Confirm **Background Modes** includes *Audio* and *Voice over IP* (Info.plist already lists them).
4. Run on a **physical iPhone** (PiP is unreliable / unavailable on many simulators).

**Test:** open a live → Home → system PiP bubble with the host video. Tap to restore; X on the bubble closes the live.

Key files:

- `ios/App/App/LivePipSession.swift` — LiveKit room + PiP controllers
- `ios/App/App/LivePipPlugin.swift` — Capacitor `LivePip` bridge
- `src/lib/pip-native.ts` / `LivePipController` — shared JS with Android

### Splash video sound (“qui dit plus ?”)


The React splash tries **unmuted** autoplay first, then falls back to muted if the
OS blocks audible media — so the intro never gets stuck.

Native shells must allow media without a tap:

- **Android** — already in `MainActivity.java`:
  `settings.setMediaPlaybackRequiresUserGesture(false);`
- **iOS** — Capacitor sets `mediaTypesRequiringUserActionForPlayback = []` by
  default. To also hear the splash when the hardware Silent switch is on, set
  the audio session at launch in `AppDelegate.swift` / `AppDelegate.m`:

```swift
import AVFoundation

// inside application(_:didFinishLaunchingWithOptions:)
try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
try? AVAudioSession.sharedInstance().setActive(true)
```

Then rebuild the native app (`npx cap sync` + Run). The web splash change ships
with the usual deploy to `kidiplus.com` (Capacitor loads that URL).

### Android — remove the native video play overlay

If the intro splash video shows a large Android play button, edit this native file on your machine:

`android/app/src/main/java/com/kidiplus/app/MainActivity.java`

Use this exact content:

```java
package com.kidiplus.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebSettings settings = this.bridge.getWebView().getSettings();
    settings.setMediaPlaybackRequiresUserGesture(false);

    this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
      @Override
      public Bitmap getDefaultVideoPoster() {
        Bitmap bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawARGB(0, 0, 0, 0);
        return bitmap;
      }
    });
  }
}
```

Then run:

```bat
node scripts/prepare-native.mjs
npx cap sync android
```

Finally press ▶ Run in Android Studio.

### Debugging a black / stuck screen on Android

The bundled `dist/index.html` is a defensive launcher: it fires a JS
`location.replace`, a `<meta http-equiv="refresh">` fallback, and a 6-second
watchdog that surfaces a "Réessayer" button if the WebView is stuck. If you
still see nothing:

1. Enable USB debugging on the device, plug it in, launch the app.
2. On the same computer, open Chrome → visit `chrome://inspect/#devices`.
3. Under "Remote Target", find `com.kidiplus.app` → click **inspect**.
4. The DevTools that open give you the WebView's console, network, and
   elements — same as debugging a normal web page.

Look for:
- `net::ERR_CLEARTEXT_NOT_PERMITTED` → the launcher target is `http://…`.
  We use `https://kidiplus.lovable.app`, so this shouldn't happen; if it
  does, check `NATIVE_APP_URL` env when running `prepare-native`.
- SSL / certificate errors → the device clock is wrong, or a corporate
  proxy is intercepting HTTPS.
- CORS / 403 on `/api/*` → the Origin allowlist in `src/lib/api-cors.ts`
  must include the `localhost` hostname suffix (it does by default).
