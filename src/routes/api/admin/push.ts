import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  sendAdminPushToUsers,
  type AdminPushInput,
} from "@/lib/admin-push.server";

export const Route = createFileRoute("/api/admin/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
          },
        );
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin", {
          _user_id: userData.user.id,
        });
        if (adminError) return Response.json({ error: adminError.message }, { status: 500 });
        if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

        const raw = (await request.json().catch(() => null)) as Partial<AdminPushInput> | null;
        if (!raw || (raw.mode !== "all" && raw.mode !== "user_ids")) {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        try {
          const result = await sendAdminPushToUsers({
            mode: raw.mode,
            userIds: Array.isArray(raw.userIds) ? raw.userIds.filter((id): id is string => typeof id === "string") : [],
            title: typeof raw.title === "string" ? raw.title : "",
            body: typeof raw.body === "string" ? raw.body : "",
            data:
              raw.data && typeof raw.data === "object"
                ? Object.fromEntries(Object.entries(raw.data).filter(([, value]) => typeof value === "string"))
                : undefined,
          });
          return Response.json(result);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "push_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
