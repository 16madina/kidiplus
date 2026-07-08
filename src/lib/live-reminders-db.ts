// Buyer-side "Me rappeler" reminders for scheduled lives.
// RLS: owner rows only (auth.uid() = user_id); seller of the live can read.

import { supabase } from "@/integrations/supabase/client";

export async function addLiveReminder(userId: string, liveId: string): Promise<void> {
  const { error } = await supabase
    .from("live_reminders")
    .upsert({ user_id: userId, live_id: liveId }, { onConflict: "user_id,live_id" });
  if (error) throw error;
}

export async function removeLiveReminder(userId: string, liveId: string): Promise<void> {
  const { error } = await supabase
    .from("live_reminders")
    .delete()
    .eq("user_id", userId)
    .eq("live_id", liveId);
  if (error) throw error;
}

export async function hasLiveReminder(userId: string, liveId: string): Promise<boolean> {
  const { data } = await supabase
    .from("live_reminders")
    .select("live_id")
    .eq("user_id", userId)
    .eq("live_id", liveId)
    .maybeSingle();
  return !!data;
}

/** Seller-triggered fanout: notify all reminded users, then clear the list. */
export async function notifyLiveReminders(liveId: string): Promise<number> {
  const { data, error } = await supabase.rpc("notify_live_reminders", {
    _live_id: liveId,
  });
  if (error) return 0;
  return Number(data ?? 0);
}
