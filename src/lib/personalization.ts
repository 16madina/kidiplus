// Personalization signals for the "Pour toi" home tile.
// Ranks a stream list using the connected user's follows and past interactions
// (recent bids). Falls back to popularity when the user is signed-out or has
// no history yet. Purely client-side ranking over the streams already fetched.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { LiveStream } from "@/lib/live-mock";

type Affinity = Map<string, number>;

export type PersonalizedRanker = (streams: LiveStream[]) => LiveStream[];

export function usePersonalizedRanking(): PersonalizedRanker {
  const { user } = useAuth();
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());
  const [categoryAffinity, setCategoryAffinity] = useState<Affinity>(
    () => new Map(),
  );

  useEffect(() => {
    if (!user) {
      setFollowed(new Set());
      setCategoryAffinity(new Map());
      return;
    }
    let alive = true;
    (async () => {
      const [followsRes, bidsRes] = await Promise.all([
        supabase
          .from("follows")
          .select("followed_id")
          .eq("follower_id", user.id),
        supabase
          .from("live_bids")
          .select("live:lives!inner(category)")
          .eq("bidder_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (!alive) return;
      const followsSet = new Set<string>(
        ((followsRes.data ?? []) as Array<{ followed_id: string }>)
          .map((r) => r.followed_id)
          .filter(Boolean),
      );
      const aff: Affinity = new Map();
      for (const row of (bidsRes.data ?? []) as Array<{
        live?: { category?: string } | null;
      }>) {
        const cat = row?.live?.category;
        if (typeof cat === "string") {
          aff.set(cat, (aff.get(cat) ?? 0) + 1);
        }
      }
      setFollowed(followsSet);
      setCategoryAffinity(aff);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  return useCallback<PersonalizedRanker>(
    (streams) => {
      // Signed-out or no signal → sort by popularity as a sensible default.
      if (followed.size === 0 && categoryAffinity.size === 0) {
        return [...streams].sort((a, b) => b.viewers - a.viewers);
      }
      const scored = streams.map((s, i) => {
        let score = 0;
        // Subscriptions get the biggest boost.
        if (s.sellerId && followed.has(s.sellerId)) score += 100;
        // Past interactions in the same category.
        const affinity = categoryAffinity.get(s.category) ?? 0;
        score += affinity * 5;
        // Mild popularity signal so cold categories aren't empty.
        score += Math.log10(Math.max(1, s.viewers)) * 2;
        // Stable tiebreaker preserves original order.
        score -= i * 0.001;
        return { s, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.map((x) => x.s);
    },
    [followed, categoryAffinity],
  );
}
