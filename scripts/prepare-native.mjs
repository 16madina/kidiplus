#!/usr/bin/env node
// Prepares dist/ for the native Capacitor build.
//
// TanStack Start is an SSR framework and does not emit a static SPA bundle
// that a WebView can run offline. For the native shell we ship a tiny
// branded launcher page in dist/index.html that loads the live SSR app
// INSIDE the WebView (allowed by `server.allowNavigation` in
// capacitor.config.ts, so it never bounces to Safari).
//
// If/when the app is refactored to a static export, replace this script
// with the real Vite build output.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const APP_URL = process.env.NATIVE_APP_URL || "https://kidiplus.lovable.app";

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0C1122" />
    <title>KiDi+</title>
    <style>
      html,body{margin:0;height:100%;background:#0C1122;color:#E8C46A;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        display:flex;align-items:center;justify-content:center;overflow:hidden}
      .brand{font-size:32px;letter-spacing:.12em;font-weight:600;opacity:.92}
    </style>
  </head>
  <body>
    <div class="brand">KiDi+</div>
    <script>
      // Navigate in-WebView to the live app. Because kidiplus.lovable.app is
      // in capacitor.config.ts > server.allowNavigation, the WebView keeps
      // the request internal (no Safari hand-off, no browser chrome).
      window.location.replace(${JSON.stringify(APP_URL)});
    </script>
  </body>
</html>
`;

const dir = resolve(process.cwd(), "dist");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "index.html"), html, "utf8");
console.log(`✅ dist/index.html ready for Capacitor (target: ${APP_URL})`);

// Reminder to run capacitor-assets once icon/splash sources exist.
if (!existsSync(resolve(process.cwd(), "resources/icon.png"))) {
  console.log("ℹ️  resources/icon.png not found — see resources/README.md to generate branded app icons & splash.");
}
