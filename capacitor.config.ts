import type { CapacitorConfig } from "@capacitor/cli";

// KiDi+ native shell.
//
// TanStack Start renders the live app from the published URL. For native
// Android/iOS plugins to work, Capacitor must load that URL as the app's own
// `server.url`. A local launcher that redirects via `allowNavigation` looks
// visually similar, but Android can lose the Capacitor bridge after that
// redirect; then `Capacitor.isNativePlatform()` returns false and push /
// biometric features behave like the app is a normal website.
//
// Use kidiplus.com (the live domain). lovable.app can redirect and break
// bridge injection on the final origin.
// Dev hot-reload: set NATIVE_APP_URL=http://YOUR_LAN_IP:8080 before cap sync.
const nativeAppUrl = process.env.NATIVE_APP_URL || "https://kidiplus.com";

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
  server: {
    url: nativeAppUrl,
    cleartext: false,
    androidScheme: "https",
    iosScheme: "capacitor",
    // Keep trusted KiDi+ routes in the WebView. External links still leave the
    // app via the system browser / Capacitor Browser plugin.
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
      // Safety net: auto-hide after 3s so the app can NEVER get stuck on
      // the native splash if the JS-side hide call is missed. The React
      // <SplashScreen> also calls hideNativeSplash() as soon as the intro
      // video paints its first frame — that's the seamless path.
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: "#10162B", // KiDi+ deep navy
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
      backgroundColor: "#10162B",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
