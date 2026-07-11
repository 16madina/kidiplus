// Admin-only push broadcast server function.
// Verifies admin via has_role RPC, then fans out FCM to selected users
// (either "all" — every user with at least one device token — or an explicit
// list of user_ids). Returns aggregated stats.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminPushInput = {
  mode: "all" | "user_ids";
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type AdminPushResult = {
  targetedUsers: number;
  sent: number;
  failed: number;
  invalidTokens: number;
};

export const sendAdminPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AdminPushInput) => data)
  .handler(async ({ data, context }): Promise<AdminPushResult> => {
    // Admin check
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc(
      "is_admin",
      { _user_id: context.userId },
    );
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const title = (data.title ?? "").trim();
    const body = (data.body ?? "").trim();
    if (!title && !body) throw new Error("Le titre ou le message est requis");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve target user ids
    let userIds: string[] = [];
    if (data.mode === "all") {
      const { data: rows, error } = await supabaseAdmin
        .from("device_tokens")
        .select("user_id");
      if (error) throw new Error(error.message);
      userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id as string)));
    } else {
      userIds = Array.from(new Set((data.userIds ?? []).filter(Boolean)));
    }

    if (userIds.length === 0) {
      return { targetedUsers: 0, sent: 0, failed: 0, invalidTokens: 0 };
    }

    const { sendFcmToUser } = await import("@/lib/fcm.server");
    const notification = {
      title: title || "KiDi+",
      body: body || "",
    };
    const payloadData: Record<string, string> = {
      kind: "admin_broadcast",
      ...(data.data ?? {}),
    };

    // Cap concurrency to be gentle on FCM.
    const concurrency = 8;
    let i = 0;
    let sent = 0;
    let failed = 0;
    let invalidTokens = 0;
    async function worker() {
      while (i < userIds.length) {
        const uid = userIds[i++];
        try {
          const r = await sendFcmToUser(uid, {
            notification,
            data: payloadData,
          });
          sent += r.sent;
          failed += r.failed;
          invalidTokens += r.invalidTokens.length;
        } catch (e) {
          console.warn("[admin-push] user failed", uid, e);
          failed++;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, userIds.length) }, worker),
    );

    return { targetedUsers: userIds.length, sent, failed, invalidTokens };
  });
