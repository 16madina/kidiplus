#!/usr/bin/env node
// Prepares dist/ for the native Capacitor build (iOS + Android).
//
// TanStack Start is an SSR framework and does not emit a static SPA bundle
// that a WebView can run offline. For the native shell we ship a tiny
// branded launcher page in dist/index.html that loads the live SSR app
// INSIDE the WebView (allowed by `server.allowNavigation` in
// capacitor.config.ts, so it never bounces to Safari/Chrome).
//
// The launcher is defensive:
//   - <meta http-equiv="refresh"> fires even if JS is disabled/slow.
//   - JS location.replace() runs on DOMContentLoaded as the primary path.
//   - A 6s watchdog surfaces a visible retry UI if the WebView is stuck
//     (Android black-screen symptom when the remote nav silently fails).
//
// If/when the app is refactored to a static export, replace this script
// with the real Vite build output.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const APP_URL = process.env.NATIVE_APP_URL || "https://kidiplus.lovable.app";
const APP_URL_JSON = JSON.stringify(APP_URL);

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0C1122" />
    <meta http-equiv="refresh" content="0; url=${APP_URL}" />
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
      .retry{display:none;flex-direction:column;gap:12px;align-items:center}
      .retry p{margin:0;font-size:14px;color:#fff;opacity:.85;line-height:1.4}
      .retry a{display:inline-block;padding:12px 20px;border-radius:12px;
        background:#E8C46A;color:#0C1122;text-decoration:none;font-weight:700;font-size:15px}
      .err{font-size:11px;color:#fff;opacity:.5;word-break:break-all;max-width:280px}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div id="loading" class="spinner" aria-label="Chargement"></div>
      <div id="retry" class="retry" role="alert">
        <p>Impossible de charger l'application. Vérifie ta connexion.</p>
        <a id="retryLink" href="${APP_URL}">Réessayer</a>
        <div id="err" class="err"></div>
      </div>
    </div>
    <script>
      (function(){
        var APP = ${APP_URL_JSON};
        var launched = false;
        function launch(){
          if (launched) return;
          launched = true;
          try { window.location.replace(APP); }
          catch (e) {
            try { window.location.href = APP; }
            catch (e2) { showRetry(String(e2 && e2.message || e2)); }
          }
        }
        function showRetry(msg){
          var l = document.getElementById('loading');
          var r = document.getElementById('retry');
          var e = document.getElementById('err');
          if (l) l.style.display = 'none';
          if (r) r.style.display = 'flex';
          if (e && msg) e.textContent = msg;
        }
        // Primary: fire as soon as the DOM is ready.
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', launch, { once: true });
        } else {
          launch();
        }
        // Backup: fire on window load in case DOMContentLoaded raced.
        window.addEventListener('load', launch, { once: true });
        // Watchdog: if we're still here after 6s, surface a retry UI so the
        // user is never staring at a black screen (Android WebView symptom
        // when the remote navigation is silently blocked).
        setTimeout(function(){
          try {
            if (document.visibilityState !== 'hidden') {
              showRetry('Chargement trop long. Appuie sur Réessayer.');
            }
          } catch (_) {}
        }, 6000);
        // Log to native console (visible via chrome://inspect on Android
        // and Safari > Develop on iOS).
        try { console.log('[kidiplus-launcher] target=' + APP + ' origin=' + location.origin); } catch(_) {}
      })();
    </script>
  </body>
</html>
`;

const dir = resolve(process.cwd(), "dist");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "index.html"), html, "utf8");
console.log(`✅ dist/index.html ready for Capacitor (iOS + Android) — target: ${APP_URL}`);

// Reminder to run capacitor-assets once icon/splash sources exist.
if (!existsSync(resolve(process.cwd(), "resources/icon.png"))) {
  console.log("ℹ️  resources/icon.png not found — see resources/README.md to generate branded app icons & splash.");
}
