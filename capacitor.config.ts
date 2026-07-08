import type { CapacitorConfig } from "@capacitor/cli";

// KiDi+ native shell config. Adjust appId to your registered bundle before store submission.
const config: CapacitorConfig = {
  appId: "com.kidiplus.app",
  appName: "KiDi+",
  webDir: "dist",
  bundledWebRuntime: false,
  // KiDi+ est une app web SSR : iOS doit charger l'URL dans le WebView Capacitor,
  // pas via une redirection depuis dist/index.html, sinon Safari s'ouvre.
  server: {
    url: "https://kidiplus.lovable.app",
    allowNavigation: ["kidiplus.lovable.app", "kidiplus.com", "www.kidiplus.com"],
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: false, // we hide manually with a short fade
      backgroundColor: "#10162B",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DEFAULT",
      backgroundColor: "#00000000",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
