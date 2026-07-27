// Host-side bridge: poll YouTube / Facebook comments → KiDi+ room chat,
// mirror host replies back to social platforms, and post promo CTAs on
// YouTube/Facebook only (never into the KiDi+ chat).

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatEvt, LiveRoomState } from "@/lib/live-room";

const YT_COLOR = "oklch(0.72 0.2 25)";
const FB_COLOR = "oklch(0.7 0.14 260)";

/** Shared across reply + poll so host mirrors don't re-ingest as YT/FB lines. */
const seenExternalIds = new Set<string>();

/** Space promo posts so social chat isn't spammy. */
const PROMO_INTERVAL_MS = 4 * 60_000;

function markSeen(key: string) {
  seenExternalIds.add(key);
  if (seenExternalIds.size > 500) {
    const keep = Array.from(seenExternalIds).slice(-250);
    seenExternalIds.clear();
    for (const k of keep) seenExternalIds.add(k);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("signed_out");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function replyOnSocialPlatforms(opts: {
  liveId: string;
  text: string;
  source?: "youtube" | "facebook" | "all";
  parentExternalId?: string;
}): Promise<void> {
  const res = await fetch("/api/social-chat/reply", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      liveId: opts.liveId,
      text: opts.text,
      source: opts.source ?? "all",
      ...(opts.parentExternalId
        ? { parentExternalId: opts.parentExternalId }
        : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    results?: {
      youtube?: { ok: boolean; id?: string };
      facebook?: { ok: boolean; id?: string };
    };
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `social_reply_${res.status}`);
  }
  if (body.results?.youtube?.ok && body.results.youtube.id) {
    markSeen(`yt:${body.results.youtube.id}`);
  }
  if (body.results?.facebook?.ok && body.results.facebook.id) {
    markSeen(`fb:${body.results.facebook.id}`);
  }
}

function socialPromoText(productName: string | null, auctionActive: boolean): string {
  if (auctionActive && productName) {
    return `🔥 Enchère en cours sur KiDi+ : ${productName} — ouvre le lien dans la description pour enchérir !`;
  }
  if (productName) {
    return `🛍 En vedette sur KiDi+ : ${productName} — lien dans la description pour acheter !`;
  }
  return "🛍 Live shopping KiDi+ — ouvre le lien dans la description pour rejoindre et acheter !";
}

/**
 * While YouTube and/or Facebook restream is ON, pull remote comments into
 * the KiDi+ chat (with source badges) so the host can see and answer them.
 * Also posts occasional promo CTAs on YT/FB only — never into KiDi+ chat.
 */
export function useSocialChatBridge(opts: {
  liveId: string | null | undefined;
  enabledYoutube: boolean;
  enabledFacebook: boolean;
  room: Pick<LiveRoomState, "ingestExternalChat" | "ready">;
  /** When true, promo copy mentions the live auction. */
  auctionActive?: boolean;
  productName?: string | null;
}) {
  const {
    liveId,
    enabledYoutube,
    enabledFacebook,
    room,
    auctionActive = false,
    productName = null,
  } = opts;
  const ytPageTokenRef = useRef<string | null>(null);
  const ingestRef = useRef(room.ingestExternalChat);
  ingestRef.current = room.ingestExternalChat;
  const auctionActiveRef = useRef(auctionActive);
  auctionActiveRef.current = auctionActive;
  const productNameRef = useRef(productName);
  productNameRef.current = productName;
  const lastPromoAtRef = useRef(0);
  const lastAuctionPromoKeyRef = useRef<string | null>(null);

  // Poll social comments → KiDi+ chat
  useEffect(() => {
    if (!liveId || (!enabledYoutube && !enabledFacebook)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 4000;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/social-chat/poll", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            liveId,
            youtubePageToken: ytPageTokenRef.current,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          youtube?: {
            messages?: Array<{
              id: string;
              authorName: string;
              text: string;
            }>;
            nextPageToken?: string | null;
            pollingIntervalMs?: number;
            error?: string;
          } | null;
          facebook?: {
            messages?: Array<{
              id: string;
              authorName: string;
              text: string;
            }>;
            error?: string;
            hint?: string;
          } | null;
        };

        if (res.ok) {
          if (body.youtube) {
            if (body.youtube.nextPageToken) {
              ytPageTokenRef.current = body.youtube.nextPageToken;
            }
            if (typeof body.youtube.pollingIntervalMs === "number") {
              delayMs = Math.min(
                15_000,
                Math.max(3500, body.youtube.pollingIntervalMs),
              );
            }
            for (const m of body.youtube.messages ?? []) {
              const key = `yt:${m.id}`;
              if (seenExternalIds.has(key)) continue;
              markSeen(key);
              const evt: ChatEvt = {
                id: key,
                user: m.authorName,
                color: YT_COLOR,
                text: m.text,
                source: "youtube",
                externalId: m.id,
              };
              ingestRef.current(evt);
            }
          }

          if (body.facebook) {
            if (body.facebook.error) {
              console.warn("[social-chat] facebook poll", body.facebook.error);
            }
            for (const m of body.facebook.messages ?? []) {
              const key = `fb:${m.id}`;
              if (seenExternalIds.has(key)) continue;
              markSeen(key);
              const evt: ChatEvt = {
                id: key,
                user: m.authorName,
                color: FB_COLOR,
                text: m.text,
                source: "facebook",
                externalId: m.id,
              };
              ingestRef.current(evt);
            }
          }
        }
      } catch (e) {
        console.warn("[social-chat] poll failed", e);
        delayMs = Math.min(15_000, delayMs + 1000);
      }

      if (!cancelled) {
        timer = setTimeout(() => void tick(), delayMs);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [liveId, enabledYoutube, enabledFacebook]);

  // Promo CTAs on YouTube / Facebook only (not KiDi+ chat).
  useEffect(() => {
    if (!liveId || (!enabledYoutube && !enabledFacebook)) return;
    let cancelled = false;

    const postPromo = async (force = false) => {
      if (cancelled) return;
      const now = Date.now();
      if (!force && now - lastPromoAtRef.current < PROMO_INTERVAL_MS) return;
      lastPromoAtRef.current = now;
      const text = socialPromoText(
        productNameRef.current,
        auctionActiveRef.current,
      );
      try {
        await replyOnSocialPlatforms({ liveId, text, source: "all" });
      } catch (e) {
        console.warn("[social-chat] promo failed", e);
      }
    };

    // First promo shortly after restream is up.
    const first = window.setTimeout(() => void postPromo(true), 12_000);
    const interval = window.setInterval(() => void postPromo(false), 60_000);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [liveId, enabledYoutube, enabledFacebook]);

  // Extra promo when a new auction starts (YT/FB only).
  useEffect(() => {
    if (!liveId || (!enabledYoutube && !enabledFacebook)) return;
    if (!auctionActive || !productName) return;
    const key = `${productName}:${auctionActive}`;
    if (lastAuctionPromoKeyRef.current === key) return;
    lastAuctionPromoKeyRef.current = key;
    const timer = window.setTimeout(() => {
      void replyOnSocialPlatforms({
        liveId,
        text: socialPromoText(productName, true),
        source: "all",
      }).catch((e) => console.warn("[social-chat] auction promo failed", e));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [liveId, enabledYoutube, enabledFacebook, auctionActive, productName]);
}
