import type { CapacitorConfig } from "@capacitor/cli";

// KiDi+ native shell config. Adjust appId to your registered bundle before store submission.
const config: CapacitorConfig = {
  appId: "com.kidiplus.app",
  appName: "KiDi+",
  webDir: "dist",
  bundledWebRuntime: false,
  // KiDi+ tourne sur TanStack Start (SSR) — il n'y a pas de build SPA statique
  // à embarquer dans l'APK. Le WebView natif charge donc directement l'app
  // publiée. Pour tester une build locale, commente `url` et mets ton IP LAN.
  server: {
    url: "https://kidiplus.lovable.app",
    // url: "http://192.168.1.10:8080", // dev local (Vite sur ta machine)
    cleartext: true,
    androidScheme: "https",
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: true,
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
