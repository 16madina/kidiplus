# Native icon & splash sources

`@capacitor/assets` regenerates every iOS/Android icon and splash from the
source images below.

> **Why the splash is plain navy:** The web app already shows the KiDi+
> animated splash once the WebView loads. The native splash is intentionally
> a flat `#0C1122` background with **no logo at all** — this removes the
> default Capacitor logo that otherwise appears before the app starts, and
> makes the hand-off to the web splash seamless.

## Files in this folder

| File | Size | Notes |
| --- | --- | --- |
| `resources/icon.png` | **1024 × 1024 px** | Centered KiDi+ icon on `#0C1122`. No transparency, no rounded corners — iOS masks the icon. |
| `resources/icon-foreground.png` | 1024 × 1024 px (optional) | Android adaptive icon foreground (transparent). |
| `resources/icon-background.png` | 1024 × 1024 px (optional) | Android adaptive icon background — flat `#0C1122`. |
| `resources/splash.png` | **2732 × 2732 px** | **Plain flat `#0C1122`**, no logo. Center-cropped on all devices. |
| `resources/splash-dark.png` | 2732 × 2732 px | Same plain `#0C1122` for dark mode. |

## Regenerate native assets

```bash
npm run native:assets
```

This is the same as:

```bash
npx @capacitor/assets generate --iconBackgroundColor "#0C1122" \
                               --iconBackgroundColorDark "#0C1122" \
                               --splashBackgroundColor "#0C1122" \
                               --splashBackgroundColorDark "#0C1122"
```

Then sync the new assets into the native projects:

```bash
npx cap sync ios
npx cap sync android
```

The generator writes into `ios/App/App/Assets.xcassets/` and
`android/app/src/main/res/` — commit those alongside this folder.

