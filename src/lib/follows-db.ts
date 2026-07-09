// Real follows: subscribe, toggle, count. Optimistic UI with realtime sync.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export async function followUser(followedId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("unauthorized");
  if (auth.user.id === followedId) return;
  await supabase.from("follows").insert({
    follower_id: auth.user.id,
    followed_id: followedId,
  });
}

export async function unfollowUser(followedId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("unauthorized");
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", auth.user.id)
    .eq("followed_id", followedId);
}

/** Reactive follow state for a given seller. */
export function useFollow(sellerId: string | null): {
  following: boolean;
  count: number;
  toggle: () => Promise<void>;
  isSelf: boolean;
  ready: boolean;
} {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  const isSelf = !!user && !!sellerId && user.id === sellerId;

  useEffect(() => {
    let alive = true;
    if (!sellerId) { setReady(false); return; }
    setReady(false);
    const load = async () => {
      const [countRes, prof, meRes] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("followed_id", sellerId),
        supabase.from("profiles").select("followers_count").eq("id", sellerId).maybeSingle(),
        user
          ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followed_id", sellerId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!alive) return;
      const denorm = (prof.data as { followers_count?: number } | null)?.followers_count;
      setCount(typeof denorm === "number" ? denorm : (countRes.count ?? 0));
      setFollowing(!!meRes.data);
      setReady(true);
    };
    void load();
    const channel = supabase
      .channel(`follows-${sellerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `followed_id=eq.${sellerId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [sellerId, user?.id]);

  const toggle = useCallback(async () => {
    if (!sellerId || !user || isSelf) return;
    // Optimistic
    setFollowing((prev) => {
      setCount((c) => Math.max(0, c + (prev ? -1 : 1)));
      return !prev;
    });
    try {
      if (following) await unfollowUser(sellerId);
      else await followUser(sellerId);
    } catch (e) {
      // rollback
      setFollowing((prev) => {
        setCount((c) => Math.max(0, c + (prev ? -1 : 1)));
        return !prev;
      });
      throw e;
    }
  }, [sellerId, user, isSelf, following]);

  return { following, count, toggle, isSelf, ready };
}
