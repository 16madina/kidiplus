// Admin-only test push endpoint.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/admin/test-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Two auth modes:
        //  - X-Admin-Secret header matching ADMIN_PUSH_SECRET (server-to-server)
        //  - OR a Bearer token from an admin user (is_admin=true)
        const secretHeader = request.headers.get("x-admin-secret");
        const adminSecret = process.env.ADMIN_PUSH_SECRET;
        let bypass = false;
        if (adminSecret && secretHeader && secretHeader === adminSecret) {
          bypass = true;
        }
        if (!bypass) {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return new Response("Unauthorized", { status: 401 });
          const supa = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );
          const { data: userData, error: uErr } = await supa.auth.getUser();
          if (uErr || !userData?.user) return new Response("Unauthorized", { status: 401 });
          const { data: isAdmin } = await supa.rpc("is_admin", { _user_id: userData.user.id });
          if (!isAdmin) return new Response("Forbidden", { status: 403 });
        }

        let body: { email?: string; title?: string; body?: string } = {};
        try { body = await request.json(); } catch {}

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let targetUserId: string | null = null;
        const targetEmail = body.email;
        if (!targetEmail) return Response.json({ error: "email required" }, { status: 400 });
        const { data: prof, error } = await supabaseAdmin
          .from("profiles").select("id").eq("email", targetEmail).maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!prof) return Response.json({ error: `No profile for ${targetEmail}` }, { status: 404 });
        targetUserId = prof.id;

        const { sendFcmToUser } = await import("@/lib/fcm.server");
        try {
          const result = await sendFcmToUser(targetUserId, {
            notification: {
              title: body.title ?? "KiDi+",
              body: body.body ?? "Notification test 👋",
            },
            data: { kind: "test" },
          });
          return Response.json({ targetUserId, ...result });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
