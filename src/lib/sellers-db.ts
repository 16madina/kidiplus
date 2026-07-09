import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLives } from "@/lib/lives-db";

export type SellerProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_seller: boolean;
};

/**
 * Search seller profiles by display name, handle, or bio.
 * Requires an authenticated session (profiles SELECT policy is auth-only).
 */
export async function searchSellerProfiles(
  query: string,
  limit = 30,
): Promise<SellerProfile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const q = `%${trimmed}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url, bio, is_seller")
    .eq("is_seller", true)
    .or(`display_name.ilike.${q},handle.ilike.${q},bio.ilike.${q}`)
    .limit(limit);

  if (error) {
    console.error("[searchSellerProfiles]", error);
    return [];
  }
  return (data as SellerProfile[] | null) ?? [];
}

/**
 * Returns the set of seller display names currently broadcasting a live stream.
 */
export async function fetchActiveSellerNames(): Promise<Set<string>> {
  const lives = await fetchActiveLives(100);
  return new Set(lives.map((s) => s.seller));
}
