#!/usr/bin/env node
// Prépare dist/index.html pour Capacitor (webDir=dist).
// L'URL distante est chargée directement par Capacitor via `server.url`.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
  </body>
</html>
`;

const dir = resolve(process.cwd(), "dist");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "index.html"), html, "utf8");
console.log("✅ dist/index.html prêt pour Capacitor");
