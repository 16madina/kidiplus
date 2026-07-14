// Public fanout endpoint: called by a Postgres trigger whenever a row is
// inserted into public.notifications. Verifies a shared secret, then sends
// FCM push (with deep-link data) to the target user's devices.
import { createFileRoute } from "@tanstack/react-router";

type FanoutBody = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  order_id: string | null;
  data: Record<string, unknown> | null;
};

// Derive the deep-link `kind` when the DB row didn't carry one.
function deriveKind(row: FanoutBody): string {
  const explicit = row.data && typeof row.data.kind === "string" ? String(row.data.kind).trim() : "";
  if (explicit) return explicit;
  if (/^order_|^dispute_/.test(row.kind)) return "order";
  if (row.kind === "live_started") return "live";
  if (row.kind === "moderator_promoted") return "live";
  if (row.kind === "new_follower") return "seller";
  if (/^chat_/.test(row.kind)) return "chat";
  return "notif";
}

// Build the FCM `data` block. All values must be strings.
function buildFcmData(row: FanoutBody): Record<string, string> {
  const kind = deriveKind(row);
  const src = (row.data ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = { kind };
  const putIfString = (k: string, v: unknown) => {
    if (v == null) return;
    const s = typeof v === "string" ? v : String(v);
    if (s.length > 0) out[k] = s;
  };
  putIfString("order_id", row.order_id ?? src.order_id);
  putIfString("live_id", src.live_id);
  putIfString("seller_handle", src.seller_handle);
  putIfString("seller_id", src.seller_id);
  putIfString("thread_id", src.thread_id);
  putIfString("notification_id", row.id);
  putIfString("notification_kind", row.kind);
  return out;
}

export const Route = createFileRoute("/api/public/notifications-fanout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.NOTIFICATIONS_FANOUT_SECRET;
        const header = request.headers.get("x-fanout-secret");
        if (!secret || !header || header !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        let row: FanoutBody;
        try {
          row = (await request.json()) as FanoutBody;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (!row?.user_id || !row?.kind || !row?.title) {
          return new Response("Missing fields", { status: 400 });
        }

        try {
          const { sendFcmToUser } = await import("@/lib/fcm.server");
          const result = await sendFcmToUser(row.user_id, {
            notification: {
              title: row.title,
              body: row.body ?? undefined,
            },
            data: buildFcmData(row),
          });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.warn("[fanout] send failed", e);
          // Never 5xx on the trigger call — the notification row already exists.
          return Response.json({ ok: false, error: String(e) });
        }
      },
    },
  },
});
