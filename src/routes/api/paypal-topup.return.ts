// GET /api/paypal-topup/return
// -----------------------------
// PayPal redirects here after approve/cancel (inside SFSafariViewController /
// Chrome Custom Tab). We capture + credit on the server.
//
// CRITICAL for native: never auto-redirect to https://kidiplus.com — that
// loads the full SPA inside the Custom Tab and traps the user in a flash
// loop ("Paiement PayPal en cours…"). The Capacitor WebView underneath polls
// capture and calls Browser.close() when credit succeeds.

import { createFileRoute } from "@tanstack/react-router";
import { finalizePaypalTopupOrder } from "@/lib/paypal-topup-finalize.server";
import { publicAppOrigin } from "@/lib/paypal-public-origin";

function nativeDoneHtml(opts: {
  deepLink: string;
  title: string;
  body: string;
}): Response {
  const deep = JSON.stringify(opts.deepLink);
  const title = opts.title.replace(/</g, "");
  const body = opts.body.replace(/</g, "");
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <title>KiDi+</title>
  <style>
    body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#10162B;color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:28px}
    h1{font-size:22px;margin:0 0 10px;font-weight:800}
    p{opacity:.85;font-size:14px;margin:0 0 8px;max-width:300px;line-height:1.45}
    .hint{opacity:.55;font-size:12px;margin:0 0 22px}
    a{display:inline-block;background:#c8a24a;color:#10162B;padding:14px 26px;border-radius:999px;
      font-weight:800;text-decoration:none;font-size:15px}
  </style>
  <script>
    (function () {
      // One soft handoff only — never loop, never open the website in this tab.
      var deep = ${deep};
      setTimeout(function () {
        try { window.location.href = deep; } catch (e) {}
      }, 250);
    })();
  </script>
</head>
<body>
  <div>
    <h1>${title}</h1>
    <p>${body}</p>
    <p class="hint">Ou ferme cette fenêtre (Done / ✕) pour revenir dans KiDi+.</p>
    <a href=${deep}>Revenir dans KiDi+</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function webRedirect(origin: string, params: Record<string, string>): Response {
  const u = new URL("/", origin);
  u.searchParams.set("paypal_done", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return Response.redirect(u.toString(), 302);
}

export const Route = createFileRoute("/api/paypal-topup/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = publicAppOrigin(request);
        const cancelled = url.searchParams.get("cancelled") === "1";
        const token = (url.searchParams.get("token") ?? "").trim();
        const preferNative = url.searchParams.get("native") === "1";

        if (cancelled) {
          if (!preferNative) return webRedirect(origin, { status: "cancelled" });
          return nativeDoneHtml({
            deepLink: "kidiplus://paypal-done?status=cancelled",
            title: "Paiement annulé",
            body: "Aucun montant n'a été prélevé.",
          });
        }

        if (!token) {
          if (!preferNative) return webRedirect(origin, { status: "error" });
          return nativeDoneHtml({
            deepLink: "kidiplus://paypal-done?status=error",
            title: "Session introuvable",
            body: "Ferme cette fenêtre et réessaie depuis KiDi+.",
          });
        }

        const result = await finalizePaypalTopupOrder(token);
        if (result.ok) {
          const params = {
            status: "ok",
            amount: String(result.amount),
            currency: result.currency,
            duplicate: result.duplicate ? "1" : "0",
          };
          if (!preferNative) return webRedirect(origin, params);
          const q = new URLSearchParams(params);
          return nativeDoneHtml({
            deepLink: `kidiplus://paypal-done?${q.toString()}`,
            title: "Paiement confirmé",
            body: "Ton portefeuille est crédité. Reviens dans KiDi+.",
          });
        }

        const params = {
          status: "pending",
          reason: result.error.slice(0, 80),
        };
        if (!preferNative) return webRedirect(origin, params);
        const q = new URLSearchParams(params);
        return nativeDoneHtml({
          deepLink: `kidiplus://paypal-done?${q.toString()}`,
          title: "Presque terminé",
          body: "Le paiement est en cours de confirmation. Reviens dans KiDi+.",
        });
      },
    },
  },
});
