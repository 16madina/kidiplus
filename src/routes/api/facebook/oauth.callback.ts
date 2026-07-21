// GET /api/facebook/oauth/callback

import { createFileRoute } from "@tanstack/react-router";
import { publicAppOrigin } from "@/lib/paypal-public-origin";
import {
  exchangeFacebookCode,
  exchangeLongLivedUserToken,
  fetchFacebookPages,
  fetchFacebookTokenPermissions,
  getFacebookOAuthConfig,
  missingChatPermissions,
  verifyFacebookOAuthState,
} from "@/lib/facebook.server";

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

export const Route = createFileRoute("/api/facebook/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = publicAppOrigin(request);
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const stateRaw = url.searchParams.get("state") ?? "";
        const oauthError = url.searchParams.get("error");
        const oauthErrorDesc = url.searchParams.get("error_description");

        const fail = (message: string, native: boolean) =>
          htmlPage({
            title: "Connexion Facebook échouée",
            body: message,
            tone: "error",
            deepLink: native
              ? "kidiplus://facebook-connected?status=error"
              : undefined,
            webRedirect: native ? undefined : `${origin}/?facebook=error`,
          });

        if (oauthError) {
          return fail(
            oauthErrorDesc ||
              (oauthError === "access_denied"
                ? "Tu as annulé l’autorisation Facebook."
                : `Erreur Facebook : ${oauthError}`),
            false,
          );
        }

        const cfg = getFacebookOAuthConfig();
        if (!cfg) {
          return fail("Facebook n’est pas configuré côté serveur.", false);
        }

        const state = verifyFacebookOAuthState(stateRaw, cfg);
        if (!state) {
          return fail("Lien de connexion expiré. Réessaie depuis KiDi+.", false);
        }
        if (!code) {
          return fail("Code OAuth manquant.", state.native);
        }

        const short = await exchangeFacebookCode(code, cfg);
        if (!short.ok) {
          return fail(`Échange du code impossible : ${short.error}`, state.native);
        }

        const longLived = await exchangeLongLivedUserToken(short.accessToken, cfg);
        const userToken = longLived.ok ? longLived.accessToken : short.accessToken;
        const expiresIn = longLived.ok ? longLived.expiresIn : short.expiresIn;
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const pagesRes = await fetchFacebookPages(userToken);
        if (!pagesRes.ok) {
          return fail(
            `Impossible de lire tes Pages : ${pagesRes.error}`,
            state.native,
          );
        }
        if (pagesRes.pages.length === 0) {
          return fail(
            "Aucune Page Facebook trouvée. Crée une Page puis reconnecte.",
            state.native,
          );
        }

        const auto =
          pagesRes.pages.length === 1 ? pagesRes.pages[0] : null;
        const now = new Date().toISOString();

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { error: upsertErr } = await supabaseAdmin
          .from("seller_facebook_connections")
          .upsert(
            {
              user_id: state.userId,
              user_access_token: userToken,
              user_token_expires_at: expiresAt,
              page_id: auto?.id ?? null,
              page_name: auto?.name ?? null,
              page_access_token: auto?.accessToken ?? null,
              connected_at: now,
              updated_at: now,
            },
            { onConflict: "user_id" },
          );

        if (upsertErr) {
          console.error("[facebook-oauth] upsert failed", upsertErr);
          return fail("Impossible d’enregistrer la connexion Facebook.", state.native);
        }

        const needsPick = !auto;
        const pageLabel = auto?.name ?? "";

        const perms = await fetchFacebookTokenPermissions(userToken);
        const missingChat = perms.ok
          ? missingChatPermissions(perms.granted)
          : ["pages_read_user_content"];
        const chatOk = missingChat.length === 0;
        const status = needsPick
          ? "select_page"
          : chatOk
            ? "ok"
            : "missing_chat_perms";

        const chatWarn = chatOk
          ? ""
          : ` Attention : permission commentaires manquante (${missingChat.join(", ")}). Vérifie la Login Configuration Meta, puis reconnecte.`;

        if (state.native) {
          return htmlPage({
            title: needsPick
              ? "Choisis ta Page"
              : chatOk
                ? "Facebook connecté"
                : "Permission commentaires manquante",
            body: needsPick
              ? "Compte lié. Choisis la Page Facebook pour diffuser dans KiDi+."
              : `Page « ${pageLabel} » liée à KiDi+.${chatWarn}`,
            tone: chatOk || needsPick ? "ok" : "error",
            deepLink: `kidiplus://facebook-connected?status=${status}&page=${encodeURIComponent(pageLabel)}`,
          });
        }

        const dest = new URL(state.returnPath || "/", origin);
        dest.searchParams.set("facebook", status);
        if (pageLabel) dest.searchParams.set("fb_page", pageLabel);
        if (!chatOk) {
          dest.searchParams.set("fb_missing", missingChat.join(","));
        }
        return htmlPage({
          title: needsPick
            ? "Choisis ta Page"
            : chatOk
              ? "Facebook connecté"
              : "Permission commentaires manquante",
          body: needsPick
            ? "Compte lié. Tu vas choisir la Page dans KiDi+…"
            : `Page « ${pageLabel} » liée.${chatWarn} Redirection…`,
          tone: chatOk || needsPick ? "ok" : "error",
          webRedirect: dest.toString(),
        });
      },
    },
  },
});
