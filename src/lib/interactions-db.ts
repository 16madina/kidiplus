// Lightweight logger for user↔live interactions used by the "Pour toi" grid.
// Deduplicates repeated events within a short window so scrolling or double
// taps don't flood the table.
import { supabase } from "@/integrations/supabase/client";
import type { LiveStream } from "@/lib/live-mock";

type Kind = "view" | "click" | "like";

const DEDUP_MS: Record<Kind, number> = {
  view: 60_000,
  click: 5_000,
  like: 1_500,
};

const recent = new Map<string, number>();

function shouldSkip(key: string, kind: Kind): boolean {
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < DEDUP_MS[kind]) return true;
  recent.set(key, now);
  // Cheap cap so the map doesn't grow forever.
  if (recent.size > 500) {
    const cutoff = now - 5 * 60_000;
    for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
  }
  return false;
}

export async function logLiveInteraction(
  stream: Pick<LiveStream, "id" | "liveId" | "sellerId" | "category">,
  kind: Kind,
  weight = 1,
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    const key = `${user.id}:${stream.liveId ?? stream.id}:${kind}`;
    if (shouldSkip(key, kind)) return;
    // Only persist real lives (needs live_id FK); mock streams are ignored.
    if (!stream.liveId) return;
    await supabase.from("live_interactions").insert({
      user_id: user.id,
      live_id: stream.liveId,
      seller_id: stream.sellerId ?? null,
      category: stream.category ?? null,
      kind,
      weight,
    });
  } catch (e) {
    // Non-critical: personalization is best-effort.
    console.debug("[interactions] log failed", e);
  }
}
