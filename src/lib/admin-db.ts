// Admin dashboard data layer. All calls go through SECURITY DEFINER RPCs
// that internally assert is_admin(auth.uid()). No client-side trust.

import { supabase } from "@/integrations/supabase/client";

type AnySb = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };
const sb = supabase as unknown as AnySb;

export type CurrencyMap = Record<string, number>;

export type OverviewStats = {
  gmv: CurrencyMap;
  gmv_month: CurrencyMap;
  revenue: CurrencyMap;
  revenue_month: CurrencyMap;
  wallet_float: CurrencyMap;
  seller_liability: CurrencyMap;
  pending_payouts: { count: number; by_currency: CurrencyMap };
  orders_daily: Array<{ day: string; orders: number; gmv: number }>;
  counts: {
    users_total: number;
    sellers: number;
    admins: number;
    new_this_week: number;
    lives_total: number;
    lives_live: number;
    orders_paid: number;
  };
  generated_at: string;
};

export async function fetchOverviewStats(): Promise<OverviewStats | null> {
  const { data, error } = await sb.rpc("admin_overview_stats");
  if (error) return null;
  return data as OverviewStats;
}

export type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  country: string | null;
  currency: string;
  is_seller: boolean;
  is_admin: boolean;
  created_at: string;
  wallet_balance: number;
  wallet_currency: string;
  seller_balance: number;
  seller_currency: string;
  orders_count: number;
  sales_count: number;
};

export async function fetchAdminUsers(
  search: string | null,
  limit = 30,
  offset = 0,
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const { data, error } = await sb.rpc("admin_list_users", { _search: search, _limit: limit, _offset: offset });
  if (error || !data) return { rows: [], total: 0 };
  return { rows: (data.rows ?? []) as AdminUserRow[], total: Number(data.total ?? 0) };
}

export async function fetchAdminUserDetail(userId: string): Promise<any | null> {
  const { data, error } = await sb.rpc("admin_user_detail", { _user_id: userId });
  if (error || !data || data.ok === false) return null;
  return data;
}

export type AdminPayoutRow = {
  id: string;
  seller_id: string;
  seller_handle: string | null;
  seller_name: string | null;
  seller_avatar: string | null;
  amount: number;
  currency: string;
  method: "wave" | "orange_money" | "bank_transfer" | "paypal";
  destination: Record<string, string>;
  status: "requested" | "processing" | "paid" | "rejected";
  note: string | null;
  admin_note: string | null;
  proof_url: string | null;
  processed_by: string | null;
  requested_at: string;
  processed_at: string | null;
};


export async function fetchAdminPayouts(status: string | null = null): Promise<AdminPayoutRow[]> {
  const { data, error } = await sb.rpc("admin_list_payouts", { _status: status, _limit: 200 });
  if (error || !data) return [];
  return (data.rows ?? []) as AdminPayoutRow[];
}

export type AdminOrderRow = {
  id: string;
  item_name: string;
  item_image: string | null;
  amount: number;
  total: number;
  platform_fee: number;
  seller_net: number;
  currency: string;
  status: string;
  kind: string;
  payment_method: string;
  created_at: string;
  paid_at: string | null;
  buyer_handle: string | null;
  seller_handle: string | null;
  buyer_id: string;
  seller_id: string;
  live_id: string | null;
};

export async function fetchAdminOrders(
  status: string | null = null,
  limit = 50,
  offset = 0,
): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const { data, error } = await sb.rpc("admin_list_orders", { _status: status, _limit: limit, _offset: offset });
  if (error || !data) return { rows: [], total: 0 };
  return { rows: (data.rows ?? []) as AdminOrderRow[], total: Number(data.total ?? 0) };
}

export type AdminLiveRow = {
  id: string;
  title: string;
  category: string | null;
  cover_url: string | null;
  status: "live" | "ended";
  viewer_count: number;
  started_at: string;
  ended_at: string | null;
  currency: string;
  seller_id: string;
  seller_handle: string | null;
  seller_name: string | null;
  seller_avatar: string | null;
  orders_count: number;
  gmv: number;
};

export async function fetchAdminLives(status: string | null = null): Promise<AdminLiveRow[]> {
  const { data, error } = await sb.rpc("admin_list_lives", { _status: status, _limit: 100 });
  if (error || !data) return [];
  return (data.rows ?? []) as AdminLiveRow[];
}

// Indicative EUR conversion for the "≈ EUR" grand total only. Never used
// for settlement. XOF pegged; CAD approximate.
const APPROX_TO_EUR: Record<string, number> = { EUR: 1, XOF: 1 / 655.957, CAD: 0.68 };
export function approxEurTotal(byCurrency: CurrencyMap): number {
  let sum = 0;
  for (const [cur, amt] of Object.entries(byCurrency)) {
    const upper = cur.toUpperCase();
    const rate = APPROX_TO_EUR[upper] ?? 0;
    sum += Number(amt) * rate;
  }
  return sum;
}
