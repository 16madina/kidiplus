// GET /api/youtube/oauth/callback
// Google redirects here after the seller consents.

import { createFileRoute } from "@tanstack/react-router";
import { publicAppOrigin } from "@/lib/paypal-public-origin";
import {
  exchangeYoutubeCode,
  fetchYoutubeChannel,
  getYoutubeOAuthConfig,
  verifyYoutubeOAuthState,
} from "@/lib/youtube.server";

function htmlPage(opts: {
  title: string;
  body: string;
  deepLink?: string;
  webRedirect?: string;
  tone: "ok" | "error";
}): Response {
  const bar = opts.tone === "ok" ? "#22c55e" : "#ef4444";
  const deep = opts.deepLink ? JSON.stringify(opts.deepLink) : "null";
  const web = opts.webRedirect ? JSON.stringify(opts.webRedirect) : "null";
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
    .card{max-width:320px}
    .bar{width:min(220px,70vw);height:6px;border-radius:999px;background:${bar};margin:0 auto 18px}
    h1{font-size:22px;margin:0 0 10px;font-weight:800}
    p{opacity:.85;font-size:14px;line-height:1.45;margin:0 0 18px}
    a{display:inline-block;background:#c8a24a;color:#10162B;padding:14px 26px;border-radius:999px;
      font-weight:800;text-decoration:none;font-size:15px}
  </style>
  <script>
    (function () {
      var deep = ${deep};
      var web = ${web};
      setTimeout(function () {
        try {
          if (deep) { window.location.href = deep; return; }
          if (web) { window.location.replace(web); }
        } catch (e) {}
      }, 300);
    })();
  </script>
</head>
<body>
  <div class="card">
    <div class="bar" aria-hidden="true"></div>
    <h1>${title}</h1>
    <p>${body}</p>
    ${
      opts.deepLink
        ? `<a href=${JSON.stringify(opts.deepLink)}>Revenir dans KiDi+</a>`
        : opts.webRedirect
          ? `<a href=${JSON.stringify(opts.webRedirect)}>Continuer</a>`
          : ""
    }
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

export const Route = createFileRoute("/api/youtube/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = publicAppOrigin(request);
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const stateRaw = url.searchParams.get("state") ?? "";
        const oauthError = url.searchParams.get("error");

        const fail = (message: string, native: boolean) =>
          htmlPage({
            title: "Connexion YouTube échouée",
            body: message,
            tone: "error",
            deepLink: native
              ? "kidiplus://youtube-connected?status=error"
              : undefined,
            webRedirect: native
              ? undefined
              : `${origin}/?youtube=error`,
          });

        if (oauthError) {
          return fail(
            oauthError === "access_denied"
              ? "Tu as annulé l’autorisation Google."
              : `Erreur Google : ${oauthError}`,
            false,
          );
        }

        const cfg = getYoutubeOAuthConfig();
        if (!cfg) {
          return fail("YouTube n’est pas configuré côté serveur.", false);
        }

        const state = verifyYoutubeOAuthState(stateRaw, cfg);
        if (!state) {
          return fail("Lien de connexion expiré. Réessaie depuis KiDi+.", false);
        }

        if (!code) {
          return fail("Code OAuth manquant.", state.native);
        }

        const tokens = await exchangeYoutubeCode(code, cfg);
        if (!tokens.ok) {
          return fail(
            `Échange du code impossible : ${tokens.error}`,
            state.native,
          );
        }

        if (!tokens.tokens.refreshToken) {
          // Re-consent should usually return a refresh token; without it we can't restream later.
          return fail(
            "Google n’a pas renvoyé de refresh token. Déconnecte KiDi+ dans ton compte Google puis réessaie.",
            state.native,
          );
        }

        const channel = await fetchYoutubeChannel(tokens.tokens.accessToken);
        if (!channel.ok) {
          return fail(
            `Impossible de lire ta chaîne YouTube : ${channel.error}`,
            state.native,
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const expiresAt = new Date(
          Date.now() + tokens.tokens.expiresIn * 1000,
        ).toISOString();
        const now = new Date().toISOString();

        const { error: upsertErr } = await supabaseAdmin
          .from("seller_youtube_connections")
          .upsert(
            {
              user_id: state.userId,
              refresh_token: tokens.tokens.refreshToken,
              access_token: tokens.tokens.accessToken,
              access_token_expires_at: expiresAt,
              channel_id: channel.channelId,
              channel_title: channel.channelTitle,
              connected_at: now,
              updated_at: now,
            },
            { onConflict: "user_id" },
          );

        if (upsertErr) {
          console.error("[youtube-oauth] upsert failed", upsertErr);
          return fail("Impossible d’enregistrer la connexion YouTube.", state.native);
        }

        if (state.native) {
          return htmlPage({
            title: "YouTube connecté",
            body: `Chaîne « ${channel.channelTitle} » liée à KiDi+. Tu peux fermer cette fenêtre.`,
            tone: "ok",
            deepLink: `kidiplus://youtube-connected?status=ok&channel=${encodeURIComponent(channel.channelTitle)}`,
          });
        }

        const dest = new URL(state.returnPath || "/", origin);
        dest.searchParams.set("youtube", "connected");
        return htmlPage({
          title: "YouTube connecté",
          body: `Chaîne « ${channel.channelTitle} » liée. Tu vas être redirigé…`,
          tone: "ok",
          webRedirect: dest.toString(),
        });
      },
    },
  },
});
