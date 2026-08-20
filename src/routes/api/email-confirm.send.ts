import * as React from "react";
import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "kidiplus";
const SENDER_DOMAIN = "notify.kidiplus.com";
const FROM_DOMAIN = "kidiplus.com";
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export const Route = createFileRoute("/api/email-confirm/send")({
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
        if (authError || !user?.email) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: profile } = await admin
          .from("profiles")
          .select("display_name, email_verified_at, email_confirm_sent_at")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.email_verified_at) {
          return Response.json({ ok: true, alreadyVerified: true });
        }

        const lastSent = profile?.email_confirm_sent_at
          ? new Date(profile.email_confirm_sent_at).getTime()
          : 0;
        if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
          return Response.json(
            {
              error: "cooldown",
              message: "Attends une minute avant de renvoyer le code.",
            },
            { status: 429 },
          );
        }

        const code = sixDigitCode();
        const codeHash = hashCode(user.id, code);
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        const sentAt = new Date().toISOString();

        const { error: updErr } = await admin
          .from("profiles")
          .update({
            email_confirm_code_hash: codeHash,
            email_confirm_expires_at: expiresAt,
            email_confirm_sent_at: sentAt,
          })
          .eq("id", user.id);
        if (updErr) {
          console.error("[email-confirm/send] profile update", updErr);
          return Response.json(
            { error: "update_failed", message: "Impossible de préparer le code." },
            { status: 500 },
          );
        }

        const template = TEMPLATES["email-confirm"];
        if (!template) {
          return Response.json({ error: "template_missing" }, { status: 500 });
        }

        const templateData = {
          displayName: profile?.display_name ?? user.user_metadata?.display_name,
          code,
        };
        const element = React.createElement(template.component, templateData);
        const html = await render(element);
        const plainText = await render(element, { plainText: true });
        const subject =
          typeof template.subject === "function"
            ? template.subject(templateData)
            : template.subject;

        const messageId = crypto.randomUUID();
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "email-confirm",
          recipient_email: user.email,
          status: "pending",
        });

        const { error: enqueueError } = await admin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: user.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text: plainText,
            purpose: "transactional",
            label: "email-confirm",
            idempotency_key: `email-confirm-${user.id}-${sentAt}`,
            queued_at: sentAt,
          },
        });

        if (enqueueError) {
          console.error("[email-confirm/send] enqueue", enqueueError);
          return Response.json(
            {
              error: "enqueue_failed",
              message: "Impossible d’envoyer l’email pour le moment.",
            },
            { status: 500 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
