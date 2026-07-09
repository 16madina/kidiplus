import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLives } from "@/lib/lives-db";
import type { LiveStream } from "@/lib/live-mock";

export type SellerProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_seller: boolean;
  followers_count: number;
};

/**
 * Search seller profiles by display name or handle (real DB, auth-only).
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
    .select("id, display_name, handle, avatar_url, bio, is_seller, followers_count")
    .eq("is_seller", true)
    .or(`display_name.ilike.${q},handle.ilike.${q}`)
    .limit(limit);

  if (error) {
    console.error("[searchSellerProfiles]", error);
    return [];
  }
  return ((data ?? []) as unknown as SellerProfile[]).map((p) => ({
    ...p,
    followers_count: Number(p.followers_count ?? 0),
  }));
}

/** Currently-broadcasting sellers, keyed by seller id. Also returns their live streams. */
export async function fetchActiveSellers(): Promise<{
  ids: Set<string>;
  names: Set<string>;
  lives: LiveStream[];
}> {
  const lives = await fetchActiveLives(100);
  return {
    ids: new Set(lives.map((s) => s.sellerId).filter((x): x is string => !!x)),
    names: new Set(lives.map((s) => s.seller)),
    lives,
  };
}

/** Back-compat wrapper (still used by earlier code paths). */
export async function fetchActiveSellerNames(): Promise<Set<string>> {
  return (await fetchActiveSellers()).names;
}
