// Reviews — one per delivered order, insertion via SECURITY DEFINER RPC.
import { supabase } from "@/integrations/supabase/client";

export type SellerReview = {
  id: string;
  seller_id: string;
  reviewer_id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

export async function leaveReview(
  orderId: string,
  rating: number,
  comment?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("leave_review", {
    _order_id: orderId,
    _rating: rating,
    _comment: comment ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function getMyReviewForOrder(orderId: string): Promise<SellerReview | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("seller_reviews")
    .select("*")
    .eq("order_id", orderId)
    .eq("reviewer_id", auth.user.id)
    .maybeSingle();
  return (data as SellerReview | null) ?? null;
}

export async function listSellerReviews(sellerId: string, limit = 50): Promise<SellerReview[]> {
  const { data } = await supabase
    .from("seller_reviews")
    .select(
      "id, seller_id, reviewer_id, order_id, rating, comment, created_at, reviewer:profiles!seller_reviews_reviewer_id_fkey(display_name, handle, avatar_url)",
    )
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as SellerReview[] | null) ?? [];
}
