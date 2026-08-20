import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export const Route = createFileRoute("/api/email-confirm/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        const admin = createClient(supabaseUrl, serviceKey);
        const {
          data: { user },
          error: authError,
        } = await admin.auth.getUser(token);
        if (authError || !user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let code = "";
        try {
          const body = (await request.json()) as { code?: string };
          code = String(body.code ?? "").replace(/\D/g, "");
        } catch {
          return Response.json(
            { error: "invalid_json", message: "Requête invalide." },
            { status: 400 },
          );
        }
        if (code.length !== 6) {
          return Response.json(
            { error: "invalid_code", message: "Entre le code à 6 chiffres." },
            { status: 400 },
          );
        }

        const { data: profile, error: readErr } = await admin
          .from("profiles")
          .select(
            "email_verified_at, email_confirm_code_hash, email_confirm_expires_at",
          )
          .eq("id", user.id)
          .maybeSingle();
        if (readErr || !profile) {
          return Response.json(
            { error: "profile_missing", message: "Profil introuvable." },
            { status: 404 },
          );
        }
        if (profile.email_verified_at) {
          return Response.json({ ok: true, alreadyVerified: true });
        }
        if (!profile.email_confirm_code_hash || !profile.email_confirm_expires_at) {
          return Response.json(
            {
              error: "no_code",
              message: "Demande d’abord un code de confirmation.",
            },
            { status: 400 },
          );
        }
        if (new Date(profile.email_confirm_expires_at).getTime() < Date.now()) {
          return Response.json(
            { error: "expired", message: "Code expiré — renvoie un nouveau code." },
            { status: 400 },
          );
        }
        if (hashCode(user.id, code) !== profile.email_confirm_code_hash) {
          return Response.json(
            { error: "mismatch", message: "Code incorrect." },
            { status: 400 },
          );
        }

        const { error: updErr } = await admin
          .from("profiles")
          .update({
            email_verified_at: new Date().toISOString(),
            email_confirm_code_hash: null,
            email_confirm_expires_at: null,
          })
          .eq("id", user.id);
        if (updErr) {
          console.error("[email-confirm/verify] update", updErr);
          return Response.json(
            { error: "update_failed", message: "Impossible de confirmer." },
            { status: 500 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
