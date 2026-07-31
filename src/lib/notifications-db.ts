// User-facing notifications data layer (real DB rows).
// Written by SECURITY DEFINER helpers in migrations; users can only SELECT
// their own rows and UPDATE read_at.

import { supabase } from "@/integrations/supabase/client";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  order_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type AnySb = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
const sb = supabase as unknown as AnySb;

export async function fetchMyNotifications(
  limit = 50,
): Promise<{ rows: NotificationRow[]; unread: number }> {
  const { data, error } = await sb.rpc("list_my_notifications", { _limit: limit });
  if (error || !data) return { rows: [], unread: 0 };
  return {
    rows: (data.rows ?? []) as NotificationRow[],
    unread: Number(data.unread ?? 0),
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  await sb.rpc("mark_notification_read", { _id: id });
}

export async function markAllNotificationsRead(): Promise<void> {
  await sb.rpc("mark_all_notifications_read", {});
}

export function subscribeMyNotifications(
  userId: string,
  onChange: () => void,
): () => void {
  const ch = supabase
    .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
