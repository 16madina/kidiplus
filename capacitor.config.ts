import type { CapacitorConfig } from "@capacitor/cli";

// KiDi+ native shell config. Adjust appId to your registered bundle before store submission.
const config: CapacitorConfig = {
  appId: "com.kidiplus.app",
  appName: "KiDi+",
  webDir: "dist",
  bundledWebRuntime: false,
  // L'app native embarque le build web statique (dossier `dist`).
  // Pour tester en live-reload sur ton réseau local, décommente `server.url`
  // et mets l'IP LAN de ta machine qui fait tourner `npm run dev`.
  // server: {
  //   url: "http://192.168.1.10:8080",
  //   cleartext: true,
  // },
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
