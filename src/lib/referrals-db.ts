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
  owner_id: string | null;
  owner_handle: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  held_totals: Record<string, number>;
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
  ownerId: string | null,
  rewardQuota = 14,
): Promise<{ ok: true; id: string; code: string; claim_token: string } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("admin_create_promo_code", {
    _code: code, _owner_id: ownerId, _reward_quota: rewardQuota,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true, id: r.id, code: r.code, claim_token: r.claim_token } : { ok: false, error: r.error };
}

export async function adminAssignPromoCode(id: string, ownerId: string) {
  const { data, error } = await sb.rpc("admin_assign_promo_code", { _id: id, _owner_id: ownerId });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as any;
  if (!r.ok) throw new Error(r.error ?? "assign_failed");
}

export type ClaimResult =
  | { ok: true; code: string; promo_code_id: string; backfilled_totals: Record<string, number> }
  | { ok: false; error: string };

export async function claimPromoCode(token: string): Promise<ClaimResult> {
  const { data, error } = await sb.rpc("claim_promo_code", { _token: token.trim().toUpperCase() });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok
    ? { ok: true, code: r.code, promo_code_id: r.promo_code_id, backfilled_totals: r.backfilled_totals ?? {} }
    : { ok: false, error: r.error };
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

// Onboarding message admins can copy and send to a new influencer (WhatsApp-ready).
export function buildInfluencerOnboardingMessage(
  code: string,
  token: string,
  lang: "fr" | "en" = "fr",
): string {
  if (lang === "en") {
    return (
      `Welcome to the KiDi+ partners program 🤝\n` +
      `Your code to share: ${code}\n\n` +
      `To activate your partner account and receive your earnings:\n` +
      `open KiDi+ → Profile → Referrals → Claim my code, and enter this activation code: ${token}`
    );
  }
  return (
    `Bienvenue dans le programme partenaires KiDi+ 🤝\n` +
    `Ton code à partager : ${code}\n\n` +
    `Pour activer ton compte partenaire et recevoir tes gains :\n` +
    `ouvre KiDi+ → Profil → Parrainage → Réclamer mon code, et entre ce code d'activation : ${token}`
  );
}

// ============================================================================
// Promo code requests (users can request a referral code; admins review)
// ============================================================================

export type MyPromoCodeRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function fetchMyPromoCodeRequest(): Promise<MyPromoCodeRequest | null> {
  const { data } = await sb.rpc("my_promo_code_request", {});
  return (data ?? null) as MyPromoCodeRequest | null;
}

export async function submitPromoCodeRequest(message: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("request_promo_code", { _message: message });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
}

export type AdminPromoCodeRequestRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_id: string;
  user_handle: string | null;
  user_name: string | null;
  user_avatar: string | null;
  created_promo_code_id: string | null;
};

export async function fetchAdminPromoCodeRequests(status?: "pending" | "approved" | "rejected"): Promise<AdminPromoCodeRequestRow[]> {
  const { data } = await sb.rpc("admin_list_promo_code_requests", { _status: status ?? null });
  return ((data as any)?.rows ?? []) as AdminPromoCodeRequestRow[];
}

export async function adminReviewPromoCodeRequest(
  id: string,
  action: "approve" | "reject",
  opts: { code?: string; reward_quota?: number; note?: string } = {},
): Promise<{ ok: true; code?: string; promo_code_id?: string } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("admin_review_promo_code_request", {
    _id: id,
    _action: action,
    _code: opts.code ?? null,
    _reward_quota: opts.reward_quota ?? 14,
    _note: opts.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true, code: r.code, promo_code_id: r.promo_code_id } : { ok: false, error: r.error };
}

// ============================================================================
// Admin — Reconciliation report
// ============================================================================

export type AdminReconRow = {
  promo_code_id: string;
  code: string;
  active: boolean;
  owner_id: string | null;
  owner_handle: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
  claimed_at: string | null;
  referred_count: number;
  paid_orders: number;
  earning_rows: number;
  credits_by_status: Partial<Record<"held" | "credited" | "reversed", Record<string, number>>>;
  wallet_available: number | null;
  wallet_currency: string | null;
};

export async function fetchAdminReferralReconciliation(): Promise<AdminReconRow[]> {
  const { data } = await sb.rpc("admin_referral_reconciliation", {});
  return ((data as any)?.rows ?? []) as AdminReconRow[];
}
