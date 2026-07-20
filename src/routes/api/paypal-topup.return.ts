// GET /api/paypal-topup/return
// -----------------------------
// PayPal redirects here after approve/cancel (inside SFSafariViewController /
// Chrome Custom Tab). We capture + credit on the server, then bounce into the
// native app via kidiplus://paypal-done — no React page flash / loop.

import { createFileRoute } from "@tanstack/react-router";
import { finalizePaypalTopupOrder } from "@/lib/paypal-topup-finalize.server";
import { publicAppOrigin } from "@/lib/paypal-public-origin";

function bounceHtml(opts: {
  deepLink: string;
  packageName?: string;
  webFallback: string;
}): Response {
  const deep = JSON.stringify(opts.deepLink);
  const web = JSON.stringify(opts.webFallback);
  const pkg = JSON.stringify(opts.packageName ?? "com.kidiplus.app");
  // Intentionally minimal — no "success" headline (that was flashing in the
  // Custom Tab before the app reclaimed focus).
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <title>KiDi+</title>
  <style>
    body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#10162B;color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:24px}
    .spin{width:28px;height:28px;border:3px solid rgba(255,255,255,.25);border-top-color:#c8a24a;
      border-radius:50%;animation:r .7s linear infinite;margin:0 auto 16px}
    @keyframes r{to{transform:rotate(360deg)}}
    p{opacity:.7;font-size:13px;margin:0 0 18px;max-width:260px;line-height:1.4}
    a{display:inline-block;background:#c8a24a;color:#10162B;padding:12px 22px;border-radius:999px;
      font-weight:800;text-decoration:none;font-size:14px}
  </style>
  <script>
    (function () {
      var deep = ${deep};
      var web = ${web};
      var pkg = ${pkg};
      var ua = navigator.userAgent || "";
      var isAndroid = /Android/i.test(ua);
      function goDeep() {
        try {
          if (isAndroid) {
            var path = deep.replace(/^kidiplus:\\/\\//, "");
            var intent = "intent://" + path + "#Intent;scheme=kidiplus;package=" + pkg + ";end";
            window.location.replace(intent);
            return;
          }
          window.location.replace(deep);
        } catch (e) {}
      }
      goDeep();
      setTimeout(function () { try { window.location.href = deep; } catch (e) {} }, 350);
      // If the custom scheme never leaves this tab (desktop / no app), fall back to web.
      setTimeout(function () {
        try { window.location.replace(web); } catch (e) {}
      }, 1600);
    })();
  </script>
</head>
<body>
  <div>
    <div class="spin" aria-hidden="true"></div>
    <p>Retour dans KiDi+…</p>
    <a href=${deep}>Ouvrir KiDi+</a>
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
        // Client passes native=1 when opening PayPal via Capacitor Browser.
        const preferNative = url.searchParams.get("native") === "1";

        if (cancelled) {
          if (!preferNative) return webRedirect(origin, { status: "cancelled" });
          return bounceHtml({
            deepLink: "kidiplus://paypal-done?status=cancelled",
            webFallback: `${origin}/?paypal_done=1&status=cancelled`,
          });
        }

        if (!token) {
          if (!preferNative) return webRedirect(origin, { status: "error" });
          return bounceHtml({
            deepLink: "kidiplus://paypal-done?status=error",
            webFallback: `${origin}/?paypal_done=1&status=error`,
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
          return bounceHtml({
            deepLink: `kidiplus://paypal-done?${q.toString()}`,
            webFallback: `${origin}/?paypal_done=1&${q.toString()}`,
          });
        }

        const params = {
          status: "pending",
          reason: result.error.slice(0, 80),
        };
        if (!preferNative) return webRedirect(origin, params);
        const q = new URLSearchParams(params);
        return bounceHtml({
          deepLink: `kidiplus://paypal-done?${q.toString()}`,
          webFallback: `${origin}/?paypal_done=1&${q.toString()}`,
        });
      },
    },
  },
});
