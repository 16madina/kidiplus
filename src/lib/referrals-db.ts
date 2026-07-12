// Referral / promo code data layer (client-side).
import { supabase } from "@/integrations/supabase/client";

type AnySb = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
const sb = supabase as unknown as AnySb;

export type PromoCodeStats = {
  id: string;
  code: string;
  reward_quota: number;
  active: boolean;
  created_at: string;
  signups: number;
  orders_credited: number;
  totals: Record<string, number>;
};

export type AdminPromoCodeRow = PromoCodeStats & {
  owner_id: string;
  owner_handle: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
};

export type ReferralEarningRow = {
  id: string;
  amount: number;
  currency: string;
  status: "credited" | "reversed";
  created_at: string;
  order_id: string;
  referred_user_id: string;
  referred_handle: string | null;
  referred_name: string | null;
  item_name: string | null;
};

export async function validatePromoCode(code: string): Promise<boolean> {
  const c = code.trim();
  if (!c) return false;
  const { data } = await sb.rpc("validate_promo_code", { _code: c });
  return Boolean((data as any)?.valid);
}

export type ApplyPromoResult =
  | { ok: true }
  | { ok: false; error: string };

export async function applyPromoCode(code: string): Promise<ApplyPromoResult> {
  const { data, error } = await sb.rpc("apply_promo_code", { _code: code.trim() });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "unknown" };
}

export async function fetchMyPromoCodes(): Promise<PromoCodeStats[]> {
  const { data } = await sb.rpc("my_promo_codes", {});
  return ((data as any)?.rows ?? []) as PromoCodeStats[];
}

export async function fetchMyReferralEarnings(limit = 50): Promise<ReferralEarningRow[]> {
  const { data } = await sb.rpc("my_referral_earnings", { _limit: limit });
  return ((data as any)?.rows ?? []) as ReferralEarningRow[];
}

export async function fetchAdminPromoCodes(): Promise<AdminPromoCodeRow[]> {
  const { data } = await sb.rpc("admin_list_promo_codes", {});
  return ((data as any)?.rows ?? []) as AdminPromoCodeRow[];
}

export async function adminCreatePromoCode(
  code: string,
  ownerId: string,
  rewardQuota = 14,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("admin_create_promo_code", {
    _code: code, _owner_id: ownerId, _reward_quota: rewardQuota,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true, id: r.id, code: r.code } : { ok: false, error: r.error };
}

export async function adminSetPromoActive(id: string, active: boolean) {
  const { error } = await sb.rpc("admin_set_promo_code_active", { _id: id, _active: active });
  if (error) throw new Error(error.message);
}

export async function adminRenewPromoCredits(promoCodeId: string, amount = 14) {
  const { data, error } = await sb.rpc("admin_renew_promo_credits", {
    _promo_code_id: promoCodeId, _amount: amount,
  });
  if (error) throw new Error(error.message);
  return ((data as any)?.updated ?? 0) as number;
}

export type UserSearchRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export async function adminSearchUsersByHandle(q: string, limit = 10): Promise<UserSearchRow[]> {
  if (!q.trim()) return [];
  const { data } = await sb.rpc("admin_search_users_by_handle", { _q: q.trim(), _limit: limit });
  return ((data as any)?.rows ?? []) as UserSearchRow[];
}

export function buildShareMessage(code: string, lang: "fr" | "en" = "fr"): string {
  const url = typeof window !== "undefined" ? window.location.origin : "https://kidiplus.com";
  if (lang === "en")
    return `Join me on KiDi+ 🎁 Use my code ${code} at signup: ${url}`;
  return `Rejoins-moi sur KiDi+ 🎁 Utilise mon code ${code} à l'inscription : ${url}`;
}
