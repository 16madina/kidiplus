import type { CapacitorConfig } from "@capacitor/cli";

// KiDi+ native shell — TRUE NATIVE PRODUCTION BUILD.
//
// The WebView loads the BUNDLED assets from `dist/` (webDir below).
// `server.url` is INTENTIONALLY DISABLED for production: setting it makes
// Capacitor load a remote URL, which surfaces browser-style chrome and
// breaks the "native app" feel (this is what shipped the Safari-looking
// build to the device).
//
// ─── Dev hot-reload ONLY (LAN reload against Vite) ────────────────────────
// Uncomment the `server` block below, set your Mac's LAN IP, then run:
//   npx cap sync ios && npx cap run ios
// Do NOT commit an active `server.url`.
//
// server: {
//   url: "http://192.168.1.10:8080",
//   cleartext: true,
// },
// ──────────────────────────────────────────────────────────────────────────
const config: CapacitorConfig = {
  appId: "com.kidiplus.app",
  appName: "KiDi+",
  webDir: "dist",
  bundledWebRuntime: false,
  ios: {
    contentInset: "never",
    // Keep app-route navigation inside the WebView. External links (privacy,
    // Stripe, etc.) still open in Safari via Capacitor's Browser plugin or
    // <a target="_blank"> — that's intentional.
    limitsNavigationsToAppBoundDomains: false,
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  // Only in-webview navigation to these hosts is permitted. Everything else
  // is handed off to the system browser (correct for external links).
  server: {
    // NOTE: `url` is intentionally omitted (see banner above).
    androidScheme: "https",
    iosScheme: "capacitor",
    allowNavigation: [
      "kidiplus.lovable.app",
      "kidiplus.com",
      "www.kidiplus.com",
      "*.stripe.com",
      "*.livekit.cloud",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true, // safety net — bootstrapNative() also fades it
      launchFadeOutDuration: 250,
      backgroundColor: "#0C1122", // KiDi+ deep navy
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      iosSpinnerStyle: "small",
    },
    Keyboard: {
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT", // light content over navy splash
      backgroundColor: "#0C1122",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
