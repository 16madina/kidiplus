#!/usr/bin/env node
// Prepares dist/ for the native Capacitor build (iOS + Android).
//
// The real app is loaded through `server.url` in capacitor.config.ts so the
// native Capacitor bridge is injected on the first page. Do NOT redirect from
// this local page to the live site: on Android, navigating to an allowed remote
// URL can make plugins unavailable and `Capacitor.isNativePlatform()` false.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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
        display:flex;align-items:center;justify-content:center;overflow:hidden;
        text-align:center;padding:24px;box-sizing:border-box}
      .wrap{display:flex;flex-direction:column;align-items:center;gap:16px;max-width:320px}
      .brand{font-size:32px;letter-spacing:.12em;font-weight:600;opacity:.92}
      .spinner{width:22px;height:22px;border:2px solid rgba(232,196,106,.25);
        border-top-color:#E8C46A;border-radius:50%;animation:spin .9s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div id="loading" class="spinner" aria-label="Chargement"></div>
    </div>
    <script>
      try { console.log('[kidiplus-native] waiting for Capacitor server.url'); } catch(_) {}
    </script>
  </body>
</html>
`;

const dir = resolve(process.cwd(), "dist");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "index.html"), html, "utf8");
console.log("✅ dist/index.html ready for Capacitor fallback. Native app URL is configured in capacitor.config.ts server.url");

// Reminder to run capacitor-assets once icon/splash sources exist.
if (!existsSync(resolve(process.cwd(), "resources/icon.png"))) {
  console.log("ℹ️  resources/icon.png not found — see resources/README.md to generate branded app icons & splash.");
}
