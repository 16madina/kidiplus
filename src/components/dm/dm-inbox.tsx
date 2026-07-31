// DmInboxContent — "Messages" tab of the Activity screen.
// Thread list (avatar, name, preview, unread badge) + conversation overlay.
// Deep link: "kidi:open-dm" ({ thread_id }) opens the matching conversation.

import { useEffect, useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { VerifiedBadge } from "@/components/verified-badge";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { useBlockedIds } from "@/lib/moderation-db";
import { formatRelative } from "@/lib/activity-mock";
import {
  listMyDmThreads,
  subscribeMyDmInbox,
  type DmThreadRow,
} from "@/lib/dm-db";
import { DmChatScreen, type DmChatTarget } from "@/components/dm/dm-chat-screen";

export const OPEN_DM_EVENT = "kidi:open-dm";

// Deep-link handoff: the Messages tab may not be mounted yet when a push /
// notification tap fires the event (tab switch animation). We stash the
// thread id so DmInboxContent can consume it as soon as it mounts.
let pendingDmThreadId: string | null = null;

export function requestOpenDm(threadId: string) {
  pendingDmThreadId = threadId;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { thread_id: threadId } }));
  } catch {
    /* ignore */
  }
}

export function DmInboxContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [threads, setThreads] = useState<DmThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [openTarget, setOpenTarget] = useState<DmChatTarget | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const blockedIds = useBlockedIds();
  // Hide conversations with blocked users (Apple UGC guideline 1.2).
  const visibleThreads = threads.filter((th) => !blockedIds.has(th.other_id));

  const load = async () => {
    const r = await listMyDmThreads(50);
    setThreads(r.rows);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) { setThreads([]); setLoading(false); return; }
    let alive = true;
    void load().then(() => { if (!alive) return; });
    const unsub = subscribeMyDmInbox(user.id, () => { void load(); });
    return () => { alive = false; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Resolve avatars lazily.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        threads
          .filter((th) => th.other_avatar_url && !avatars[th.other_id])
          .map(async (th) => [th.other_id, await resolveAvatarUrl(th.other_avatar_url)] as const),
      );
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) if (url) next[id] = url;
      if (Object.keys(next).length) setAvatars((prev) => ({ ...prev, ...next }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  const openThread = (th: DmThreadRow) => {
    haptic.light();
    setOpenTarget({
      otherId: th.other_id,
      otherName: th.other_name,
      otherAvatarUrl: th.other_avatar_url,
      otherIsVerified: th.other_is_verified,
      threadId: th.id,
    });
    setChatOpen(true);
  };

  // Push / notification deep link → open a specific thread.
  useEffect(() => {
    const openById = (threadId: string) => {
      void listMyDmThreads(50).then((r) => {
        setThreads(r.rows);
        setLoading(false);
        const th = r.rows.find((row) => row.id === threadId);
        if (th) openThread(th);
      });
    };
    // Consume a deep link fired before this tab was mounted.
    if (pendingDmThreadId) {
      const id = pendingDmThreadId;
      pendingDmThreadId = null;
      openById(id);
    }
    const onOpen = (e: Event) => {
      const threadId = (e as CustomEvent<{ thread_id?: string }>).detail?.thread_id;
      if (!threadId) return;
      pendingDmThreadId = null;
      openById(threadId);
    };
    window.addEventListener(OPEN_DM_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(OPEN_DM_EVENT, onOpen as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
        </div>
      ) : visibleThreads.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
            <MessageCircle size={22} className="text-muted-foreground" />
          </div>
          <p className="mt-3 text-[14px] font-semibold">
            {t("dm.emptyInboxTitle", { defaultValue: "Aucun message" })}
          </p>
          <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">
            {t("dm.emptyInboxBody", {
              defaultValue: "Contacte un vendeur depuis son profil pour démarrer une conversation.",
            })}
          </p>
        </div>
      ) : (
        <ul>
          {visibleThreads.map((th) => {
            const unread = th.unread > 0;
            const minutes = Math.max(0, Math.floor((Date.now() - new Date(th.last_message_at).getTime()) / 60000));
            const mine = th.last_sender_id === user?.id;
            return (
              <li key={th.id}>
                <Press onClick={() => openThread(th)} className="!block w-full p-0 text-left">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {avatars[th.other_id] ? (
                      <img
                        src={avatars[th.other_id]}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                        onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                        draggable={false}
                      />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted text-[16px] font-bold text-muted-foreground">
                        {(th.other_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-[14px]">
                        <span className={unread ? "truncate font-bold" : "truncate font-semibold text-foreground/90"}>
                          {th.other_name || th.other_handle || "…"}
                        </span>
                        <VerifiedBadge verified={th.other_is_verified} size={13} />
                      </p>
                      <p className={`mt-0.5 truncate text-[12.5px] ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {mine ? `${t("dm.you", { defaultValue: "Toi" })} : ` : ""}
                        {th.last_message_preview || ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">{formatRelative(minutes)}</span>
                      {unread && (
                        <span
                          className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold text-white"
                          style={{ backgroundColor: "oklch(0.6 0.2 250)" }}
                        >
                          {th.unread > 99 ? "99+" : th.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Press>
              </li>
            );
          })}
        </ul>
      )}

      <DmChatScreen
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          void load();
        }}
        target={openTarget}
      />
    </>
  );
}
