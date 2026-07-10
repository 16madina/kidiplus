// Personalization signals for the "Pour toi" home tile.
// Aggregates the connected user's subscriptions, past auction bids, purchase
// history and scheduled-live reminders to rank streams. Falls back to
// popularity when the user is signed-out or has no history yet.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { LiveStream } from "@/lib/live-mock";

type Affinity = Map<string, number>;

export type PersonalizedRanker = (streams: LiveStream[]) => LiveStream[];

interface Signals {
  followed: Set<string>;      // seller ids the user follows
  purchased: Set<string>;     // seller ids the user bought from
  categoryAffinity: Affinity; // category -> weighted score
}

const EMPTY: Signals = {
  followed: new Set(),
  purchased: new Set(),
  categoryAffinity: new Map(),
};

export function usePersonalizedRanking(): PersonalizedRanker {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signals>(EMPTY);

  useEffect(() => {
    if (!user) {
      setSignals(EMPTY);
      return;
    }
    let alive = true;
    (async () => {
      const [followsRes, bidsRes, ordersRes, remindersRes, interactionsRes] = await Promise.all([
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
        supabase
          .from("orders")
          .select("seller_id, live:lives(category)")
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("live_reminders")
          .select("live:lives!inner(category, seller_id)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("live_interactions")
          .select("kind, weight, category, seller_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (!alive) return;

      const followed = new Set<string>(
        ((followsRes.data ?? []) as Array<{ followed_id: string }>)
          .map((r) => r.followed_id)
          .filter(Boolean),
      );
      const purchased = new Set<string>();
      const aff: Affinity = new Map();
      const bump = (cat: string | undefined | null, weight: number) => {
        if (!cat) return;
        aff.set(cat, (aff.get(cat) ?? 0) + weight);
      };

      for (const row of (bidsRes.data ?? []) as Array<{ live?: { category?: string } | null }>) {
        bump(row?.live?.category, 1);
      }
      for (const row of (ordersRes.data ?? []) as Array<{
        seller_id?: string | null;
        live?: { category?: string } | null;
      }>) {
        if (row?.seller_id) purchased.add(row.seller_id);
        // Purchases are the strongest signal.
        bump(row?.live?.category, 3);
      }
      for (const row of (remindersRes.data ?? []) as Array<{
        live?: { category?: string; seller_id?: string } | null;
      }>) {
        bump(row?.live?.category, 2);
      }

      setSignals({ followed, purchased, categoryAffinity: aff });
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  return useCallback<PersonalizedRanker>(
    (streams) => {
      const { followed, purchased, categoryAffinity } = signals;
      const hasSignal =
        followed.size > 0 || purchased.size > 0 || categoryAffinity.size > 0;

      // Signed-out or no signal → sort by popularity as a sensible default.
      if (!hasSignal) {
        return [...streams].sort((a, b) => b.viewers - a.viewers);
      }
      const scored = streams.map((s, i) => {
        let score = 0;
        // Subscriptions get the biggest boost.
        if (s.sellerId && followed.has(s.sellerId)) score += 100;
        // Prior purchases from this seller.
        if (s.sellerId && purchased.has(s.sellerId)) score += 60;
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
    [signals],
  );
}
