# Native icon & splash sources

`@capacitor/assets` regenerates every iOS/Android icon and splash from the
two source images below.

## Files to drop in this folder

| File | Size | Notes |
| --- | --- | --- |
| `resources/icon.png` | **1024 × 1024 px** | Full-bleed KiDi+ logo on the deep-navy background (`#0C1122`). No transparency, no rounded corners — iOS masks the icon. |
| `resources/icon-foreground.png` | 1024 × 1024 px (optional) | Android adaptive icon foreground (transparent). |
| `resources/icon-background.png` | 1024 × 1024 px (optional) | Android adaptive icon background — flat `#0C1122`. |
| `resources/splash.png` | **2732 × 2732 px** | KiDi+ logo centered on `#0C1122`. Center-cropped on all devices. |
| `resources/splash-dark.png` | 2732 × 2732 px (optional) | Dark-mode splash (same visual is fine). |

If you only have `public/logo.png` (lower-res), export a 1024² and 2732²
version from the original SVG/PSD — upscaling a small PNG will look blurry
in the App Store.

## Generate

```bash
# One-off: install the generator
npm install --save-dev @capacitor/assets

# Regenerate icons + splash for both platforms
npx @capacitor/assets generate --iconBackgroundColor "#0C1122" \
                               --iconBackgroundColorDark "#0C1122" \
                               --splashBackgroundColor "#0C1122" \
                               --splashBackgroundColorDark "#0C1122"

# Sync into the native projects
npx cap sync ios
npx cap sync android
```

The generator writes into `ios/App/App/Assets.xcassets/` and
`android/app/src/main/res/` — commit those alongside this folder.
