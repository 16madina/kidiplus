import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendFcmToUser } from "@/lib/fcm.server";

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

/** Resolve recipients and send one notification to every registered device. */
export async function sendAdminPushToUsers(
  input: AdminPushInput,
): Promise<AdminPushResult> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title && !body) throw new Error("Le titre ou le message est requis");

  let userIds: string[];
  if (input.mode === "all") {
    const { data, error } = await supabaseAdmin.from("device_tokens").select("user_id");
    if (error) throw new Error(error.message);
    userIds = Array.from(new Set((data ?? []).map((row) => row.user_id)));
  } else {
    userIds = Array.from(new Set((input.userIds ?? []).filter(Boolean)));
  }
  if (userIds.length === 0) {
    return { targetedUsers: 0, sent: 0, failed: 0, invalidTokens: 0 };
  }

  const notification = { title: title || "KiDi+", body };
  const data = { kind: "admin_broadcast", ...(input.data ?? {}) };
  const concurrency = 8;
  let index = 0;
  let sent = 0;
  let failed = 0;
  let invalidTokens = 0;
  async function worker() {
    while (index < userIds.length) {
      const userId = userIds[index++]!;
      try {
        const result = await sendFcmToUser(userId, { notification, data });
        sent += result.sent;
        failed += result.failed;
        invalidTokens += result.invalidTokens.length;
      } catch (error) {
        failed++;
        console.warn("[admin-push] user failed", userId, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, userIds.length) }, worker));
  return { targetedUsers: userIds.length, sent, failed, invalidTokens };
}
