import type { CapacitorConfig } from "@capacitor/cli";

// NOTE: appId is a placeholder — replace before submitting to app stores.
const config: CapacitorConfig = {
  appId: "com.deedigital.liveshop",
  appName: "LiveShop",
  webDir: "dist",
  bundledWebRuntime: false,
  // Local dev: point the native shell at the Vite dev server on your LAN.
  // Uncomment `url` and set your machine's LAN IP to hot-reload on device.
  server: {
    // url: "http://192.168.1.10:8080",
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
      backgroundColor: "#0B0B0F",
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
