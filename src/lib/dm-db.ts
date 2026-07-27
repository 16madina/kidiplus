// Direct-messaging data layer (dm_threads / dm_messages).
// All writes go through SECURITY DEFINER RPCs (block + moderation checks
// server-side); clients can only SELECT their own threads/messages.

import { supabase } from "@/integrations/supabase/client";

export type DmThreadRow = {
  id: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_sender_id: string | null;
  other_id: string;
  other_name: string | null;
  other_handle: string | null;
  other_avatar_url: string | null;
  other_is_seller: boolean;
  other_is_verified: boolean;
  unread: number;
};

export type DmMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type AnySb = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
const sb = supabase as unknown as AnySb;

export async function listMyDmThreads(
  limit = 50,
): Promise<{ rows: DmThreadRow[]; unread: number }> {
  const { data, error } = await sb.rpc("list_my_dm_threads", { _limit: limit });
  if (error || !data) return { rows: [], unread: 0 };
  return {
    rows: (data.rows ?? []) as DmThreadRow[],
    unread: Number(data.unread ?? 0),
  };
}

export async function listDmMessages(
  threadId: string,
  limit = 60,
  before?: string,
): Promise<DmMessageRow[]> {
  const { data, error } = await sb.rpc("list_dm_messages", {
    _thread: threadId,
    _limit: limit,
    _before: before ?? null,
  });
  if (error || !data) return [];
  // RPC returns newest-first; UI wants oldest-first.
  return ((data.rows ?? []) as DmMessageRow[]).slice().reverse();
}

export async function findDmThread(otherId: string): Promise<string | null> {
  const { data, error } = await sb.rpc("find_dm_thread", { _other: otherId });
  if (error) return null;
  return (data as string | null) ?? null;
}

export type SendDmResult =
  | { ok: true; threadId: string; message: DmMessageRow }
  | { ok: false; error: "blocked" | "suspended" | "unknown" };

export async function sendDm(toUserId: string, body: string): Promise<SendDmResult> {
  const { data, error } = await sb.rpc("send_dm", { _to: toUserId, _body: body });
  if (error || !data) {
    const msg = String(error?.message ?? "");
    if (msg.includes("blocked")) return { ok: false, error: "blocked" };
    if (msg.includes("account_banned") || msg.includes("account_suspended")) {
      return { ok: false, error: "suspended" };
    }
    return { ok: false, error: "unknown" };
  }
  return {
    ok: true,
    threadId: data.thread_id as string,
    message: data.message as DmMessageRow,
  };
}

export async function markDmThreadRead(threadId: string): Promise<void> {
  await sb.rpc("mark_dm_thread_read", { _thread: threadId });
}

/** Realtime: new/updated messages in a specific thread. */
export function subscribeDmThread(threadId: string, onChange: () => void): () => void {
  const ch = supabase
    .channel(`dm-thread:${threadId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Realtime: any thread metadata change involving me (inbox refresh). */
export function subscribeMyDmInbox(userId: string, onChange: () => void): () => void {
  const chA = supabase
    .channel(`dm-inbox-a:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dm_threads", filter: `user_a=eq.${userId}` },
      onChange,
    )
    .subscribe();
  const chB = supabase
    .channel(`dm-inbox-b:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dm_threads", filter: `user_b=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(chA);
    void supabase.removeChannel(chB);
  };
}
