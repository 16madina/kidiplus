// Admin-only helper: send a test push to a specific user (by email or self).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestPushToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string; body?: string; email?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId = context.userId;
    if (data.email) {
      const { data: prof, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!prof) throw new Error(`No profile for ${data.email}`);
      targetUserId = prof.id;
    }

    const { sendFcmToUser } = await import("@/lib/fcm.server");
    const result = await sendFcmToUser(targetUserId, {
      notification: {
        title: data.title ?? "KiDi+",
        body: data.body ?? "Notification test 👋",
      },
      data: { kind: "test" },
    });
    return { targetUserId, ...result };
  });
