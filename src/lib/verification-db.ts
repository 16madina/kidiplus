// Verification (certified account) client helpers.
import { supabase } from "@/integrations/supabase/client";

export type Eligibility = {
  exists: boolean;
  is_seller: boolean;
  sales_count: number;
  sales_ok: boolean;
  rating_avg: number;
  review_count: number;
  rating_ok: boolean;
  age_days: number;
  age_ok: boolean;
  no_sanction: boolean;
  all_ok: boolean;
};

export async function fetchEligibility(userId: string): Promise<Eligibility | null> {
  const { data, error } = await supabase.rpc("verification_eligibility", { _user: userId });
  if (error) { console.warn("[verify] eligibility failed", error); return null; }
  return data as unknown as Eligibility;
}

export type SubmitResult = { ok: boolean; error?: string; id?: string; eligibility?: Eligibility };

export async function submitVerificationRequest(message?: string): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc("request_verification", { _message: message ?? undefined });
  if (error) return { ok: false, error: error.message };
  return data as unknown as SubmitResult;
}

export type VerificationRequestRow = {
  id: string;
  user_id: string;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at: string;
};

export async function fetchMyLatestRequest(userId: string): Promise<VerificationRequestRow | null> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) { console.warn("[verify] my requests failed", error); return null; }
  return (data?.[0] as VerificationRequestRow | undefined) ?? null;
}

export type PendingRequestWithProfile = VerificationRequestRow & {
  profile: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
    rating_avg: number;
    rating_count: number;
    created_at: string;
  } | null;
  eligibility?: Eligibility | null;
};

export async function fetchPendingRequests(): Promise<PendingRequestWithProfile[]> {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*, profile:profiles!verification_requests_user_id_fkey(id, display_name, handle, avatar_url, is_verified, rating_avg, rating_count, created_at)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) { console.warn("[verify] pending list failed", error); return []; }
  const rows = (data ?? []) as unknown as PendingRequestWithProfile[];
  // Fetch eligibility per row (cheap; usually few pending).
  const enriched = await Promise.all(rows.map(async (r) => {
    const e = await fetchEligibility(r.user_id);
    return { ...r, eligibility: e };
  }));
  return enriched;
}

export async function reviewRequest(id: string, approve: boolean, note?: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_review_verification", { _id: id, _approve: approve, _note: note ?? undefined });
  if (error) return { ok: false, error: error.message };
  return data as unknown as { ok: boolean; error?: string };
}

export async function adminSetVerified(userId: string, verified: boolean): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_set_verified", { _user: userId, _verified: verified });
  if (error) return { ok: false, error: error.message };
  return data as unknown as { ok: boolean; error?: string };
}
