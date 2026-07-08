#!/usr/bin/env node
// Prépare dist/index.html pour Capacitor (webDir=dist).
// KiDi+ étant SSR (TanStack Start), le WebView charge l'URL distante.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="refresh" content="0; url=https://kidiplus.lovable.app" />
    <title>KiDi+</title>
    <style>
      html,body{margin:0;height:100%;background:#10162B;color:#E8C46A;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        display:flex;align-items:center;justify-content:center}
      .k{font-size:28px;letter-spacing:.08em;opacity:.9}
    </style>
  </head>
  <body>
    <div class="k">KiDi+</div>
    <script>location.replace("https://kidiplus.lovable.app");</script>
  </body>
</html>
`;

const dir = resolve(process.cwd(), "dist");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "index.html"), html, "utf8");
console.log("✅ dist/index.html prêt pour Capacitor");
