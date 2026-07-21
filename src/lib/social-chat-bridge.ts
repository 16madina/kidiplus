// Host-side bridge: poll YouTube / Facebook comments → KiDi+ room chat,
// and mirror host replies back to the social platforms.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ChatEvt, LiveRoomState } from "@/lib/live-room";

const YT_COLOR = "oklch(0.72 0.2 25)";
const FB_COLOR = "oklch(0.7 0.14 260)";

/** Shared across reply + poll so host mirrors don't re-ingest as YT/FB lines. */
const seenExternalIds = new Set<string>();

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

function stickyFacebookToast(title: string, detail: string) {
  toast.error(title, {
    description: detail,
    duration: 60_000,
    closeButton: true,
    action: {
      label: "Copier",
      onClick: () => {
        void navigator.clipboard?.writeText?.(detail).catch(() => {});
      },
    },
  });
}

/**
 * While YouTube and/or Facebook restream is ON, pull remote comments into
 * the KiDi+ chat (with source badges) so the host can see and answer them.
 */
export function useSocialChatBridge(opts: {
  liveId: string | null | undefined;
  enabledYoutube: boolean;
  enabledFacebook: boolean;
  room: Pick<LiveRoomState, "ingestExternalChat" | "ready">;
  /** Persist last Facebook poll notice on the host UI (toast alone is too fleeting). */
  onFacebookNotice?: (notice: string | null) => void;
}) {
  const { liveId, enabledYoutube, enabledFacebook, room, onFacebookNotice } = opts;
  const ytPageTokenRef = useRef<string | null>(null);
  const ingestRef = useRef(room.ingestExternalChat);
  ingestRef.current = room.ingestExternalChat;
  const noticeRef = useRef(onFacebookNotice);
  noticeRef.current = onFacebookNotice;
  const fbErrorToastedRef = useRef(false);
  const fbEmptyToastedRef = useRef(false);
  const fbMissingToastedRef = useRef(false);
  const fbEmptyPollsRef = useRef(0);

  useEffect(() => {
    if (!liveId || (!enabledYoutube && !enabledFacebook)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 4000;
    fbErrorToastedRef.current = false;
    fbEmptyToastedRef.current = false;
    fbMissingToastedRef.current = false;
    fbEmptyPollsRef.current = 0;

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

          if (enabledFacebook && body.facebook == null && !fbMissingToastedRef.current) {
            fbMissingToastedRef.current = true;
            const msg =
              "Facebook ON mais aucun live vidéo lié — arrête puis relance « Diffuser Facebook ».";
            noticeRef.current?.(msg);
            stickyFacebookToast("Facebook chat", msg);
          }

          if (body.facebook) {
            if (body.facebook.error && !fbErrorToastedRef.current) {
              fbErrorToastedRef.current = true;
              console.warn("[social-chat] facebook poll", body.facebook.error);
              noticeRef.current?.(body.facebook.error);
              stickyFacebookToast("Erreur commentaires Facebook", body.facebook.error);
            }
            const fbMsgs = body.facebook.messages ?? [];
            if (fbMsgs.length === 0 && !body.facebook.error) {
              fbEmptyPollsRef.current += 1;
              if (
                fbEmptyPollsRef.current >= 3 &&
                !fbEmptyToastedRef.current &&
                body.facebook.hint
              ) {
                fbEmptyToastedRef.current = true;
                noticeRef.current?.(body.facebook.hint);
                toast.message("Commentaires Facebook", {
                  description: body.facebook.hint,
                  duration: 45_000,
                  closeButton: true,
                  action: {
                    label: "Copier",
                    onClick: () => {
                      void navigator.clipboard
                        ?.writeText?.(body.facebook?.hint ?? "")
                        .catch(() => {});
                    },
                  },
                });
              }
            } else if (fbMsgs.length > 0) {
              fbEmptyPollsRef.current = 0;
              noticeRef.current?.(null);
            }
            for (const m of fbMsgs) {
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
}
