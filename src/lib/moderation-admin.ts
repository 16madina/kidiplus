// Moderation admin + user-side client layer.
// All admin RPCs are SECURITY DEFINER with is_admin() guard server-side.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnySb = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };
const sb = supabase as unknown as AnySb;

export type SanctionType = "warning" | "suspension" | "ban";
export type ModerationStatus = "active" | "suspended" | "banned";

export type ActiveSanction = {
  id: string;
  type: SanctionType;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

export type MyModerationState = {
  status: ModerationStatus;
  active_sanction: ActiveSanction | null;
  is_frozen: boolean;
  frozen_reason: string | null;
};

export async function fetchMyModerationState(): Promise<MyModerationState> {
  const { data, error } = await sb.rpc("my_moderation_state");
  if (error || !data) return { status: "active", active_sanction: null, is_frozen: false, frozen_reason: null };
  return {
    status: (data.status ?? "active") as ModerationStatus,
    active_sanction: (data.active_sanction ?? null) as ActiveSanction | null,
    is_frozen: Boolean(data.is_frozen),
    frozen_reason: (data.frozen_reason ?? null) as string | null,
  };
}


// ---- Admin messages (user side) ----

export type AdminMessageRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function fetchMyAdminMessages(): Promise<{ rows: AdminMessageRow[]; unread: number }> {
  const { data, error } = await sb.rpc("list_my_admin_messages", { _limit: 50 });
  if (error || !data) return { rows: [], unread: 0 };
  return { rows: (data.rows ?? []) as AdminMessageRow[], unread: Number(data.unread ?? 0) };
}

export async function markAdminMessageRead(id: string) {
  await sb.rpc("mark_admin_message_read", { _id: id });
}

export function subscribeMyAdminMessages(userId: string, onChange: () => void) {
  const ch = supabase
    .channel(`admin_messages:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_messages", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}

// ---- Admin RPCs ----

export type ReportRow = {
  id: string;
  reporter_id: string;
  reporter_handle: string | null;
  reporter_name: string | null;
  target_type: "live" | "user" | "message" | "order";
  target_id: string;
  target_label: string | null;
  target_user_id: string | null;
  reason: string;
  note: string | null;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  resolution_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function fetchAdminReports(status: string | null = "open"): Promise<ReportRow[]> {
  const { data, error } = await sb.rpc("admin_list_reports", { _status: status, _limit: 200 });
  if (error || !data) return [];
  return (data.rows ?? []) as ReportRow[];
}

export type SanctionRow = {
  id: string;
  type: SanctionType;
  reason: string;
  admin_note: string | null;
  issued_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export async function fetchUserSanctions(userId: string): Promise<SanctionRow[]> {
  const { data, error } = await sb.rpc("admin_list_sanctions", { _user_id: userId });
  if (error || !data) return [];
  return (data.rows ?? []) as SanctionRow[];
}

export async function adminIssueSanction(args: {
  userId: string;
  type: SanctionType;
  reason: string;
  note?: string | null;
  expiresAt?: string | null;
}) {
  const { data, error } = await sb.rpc("admin_issue_sanction", {
    _user_id: args.userId,
    _type: args.type,
    _reason: args.reason,
    _note: args.note ?? null,
    _expires_at: args.expiresAt ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return (data ?? { ok: false, error: "unknown" }) as { ok: boolean; sanction_id?: string; status?: string; error?: string };
}

export async function adminRevokeSanction(sanctionId: string) {
  const { data, error } = await sb.rpc("admin_revoke_sanction", { _sanction_id: sanctionId });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; status?: string; error?: string };
}

export async function adminSendMessage(userId: string, title: string, body: string) {
  const { data, error } = await sb.rpc("admin_send_message", {
    _user_id: userId, _title: title, _body: body,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; id?: string; error?: string };
}

export async function adminResolveReport(reportId: string, status: "reviewed" | "actioned" | "dismissed", note?: string | null) {
  const { data, error } = await sb.rpc("admin_resolve_report", {
    _report_id: reportId, _status: status, _note: note ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function adminEndLive(liveId: string) {
  const { data, error } = await sb.rpc("admin_end_live", { _live_id: liveId });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

// Helper: durations for suspensions.
export const SUSPENSION_DURATIONS: Array<{ key: string; ms: number; labelKey: string }> = [
  { key: "24h", ms: 24 * 3600 * 1000, labelKey: "moderation.durations.h24" },
  { key: "7d",  ms: 7 * 24 * 3600 * 1000, labelKey: "moderation.durations.d7" },
  { key: "30d", ms: 30 * 24 * 3600 * 1000, labelKey: "moderation.durations.d30" },
];

// Hook: current user's moderation state, refreshed on auth changes.
export function useMyModerationState(userId: string | null | undefined) {
  const [state, setState] = useState<MyModerationState>({ status: "active", active_sanction: null, is_frozen: false, frozen_reason: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) { setState({ status: "active", active_sanction: null, is_frozen: false, frozen_reason: null }); setLoading(false); return; }
    let alive = true;
    const load = async () => {
      const s = await fetchMyModerationState();
      if (alive) { setState(s); setLoading(false); }
    };
    void load();
    // Refresh every 5 min in case a suspension expires.
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => { alive = false; window.clearInterval(id); };
  }, [userId]);
  return { state, loading, refresh: async () => setState(await fetchMyModerationState()) };
}

// ---- Anti-fraud helpers ----

export async function adminFreezeUser(userId: string, reason: string) {
  const { data, error } = await sb.rpc("admin_freeze_user", { _user_id: userId, _reason: reason });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function adminUnfreezeUser(userId: string) {
  const { data, error } = await sb.rpc("admin_unfreeze_user", { _user_id: userId });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string };
}

export type PayoutRiskSignal = { code: string; label: string };
export type PayoutRisk = {
  ok: true;
  level: "green" | "yellow" | "red";
  signals: PayoutRiskSignal[];
  seller_age_days: number | null;
  total_sales: number;
  top_buyer_pct: number | null;
  top_buyer_handle: string | null;
  cycle_hours: number | null;
  prev_payouts: number;
  disputes: number;
  chargebacks: number;
  is_frozen: boolean;
};

export async function fetchPayoutRisk(payoutId: string): Promise<PayoutRisk | null> {
  const { data, error } = await sb.rpc("admin_compute_payout_risk", { _payout_id: payoutId });
  if (error || !data?.ok) return null;
  return data as PayoutRisk;
}

export type SellerRecentOrder = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  item_name: string | null;
  buyer_id: string;
  buyer_handle: string | null;
  buyer_name: string | null;
};

export async function fetchSellerRecentOrders(userId: string, limit = 20): Promise<SellerRecentOrder[]> {
  const { data, error } = await sb.rpc("admin_seller_recent_orders", { _user_id: userId, _limit: limit });
  if (error || !data?.ok) return [];
  return (data.rows ?? []) as SellerRecentOrder[];
}
