// DmChatScreen — full-screen 1-to-1 conversation (PushScreen overlay).
// Works from the Messages inbox (threadId known) or from a profile
// ("Message" button — thread resolved/created on first send).

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, MoreHorizontal, Flag, Ban, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { VerifiedBadge } from "@/components/verified-badge";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { blockUserAndNotify, unblockUser, useBlockedIds, refreshBlockedIds } from "@/lib/moderation-db";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { EASE_IOS } from "@/lib/motion";
import {
  listDmMessages,
  sendDm,
  findDmThread,
  markDmThreadRead,
  subscribeDmThread,
  type DmMessageRow,
} from "@/lib/dm-db";
import { notifyActivityUnreadChanged } from "@/lib/push-router";

export type DmChatTarget = {
  otherId: string;
  otherName: string | null;
  otherAvatarUrl?: string | null;
  otherIsVerified?: boolean;
  threadId?: string | null;
};

export function DmChatScreen({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: DmChatTarget | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const blockedIds = useBlockedIds();
  const isBlocked = target ? blockedIds.has(target.otherId) : false;
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Resolve thread + initial messages when opened.
  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    setLoading(true);
    setMessages([]);
    setThreadId(target.threadId ?? null);
    void (async () => {
      const tid = target.threadId ?? (await findDmThread(target.otherId));
      if (!alive) return;
      setThreadId(tid);
      if (tid) {
        const rows = await listDmMessages(tid);
        if (!alive) return;
        setMessages(rows);
        void markDmThreadRead(tid).finally(() => notifyActivityUnreadChanged());
      }
      setLoading(false);
      requestAnimationFrame(() => scrollToBottom());
    })();
    return () => { alive = false; };
  }, [open, target, scrollToBottom]);

  // Avatar
  useEffect(() => {
    if (!open || !target) { setAvatar(null); return; }
    let alive = true;
    void resolveAvatarUrl(target.otherAvatarUrl).then((u) => { if (alive) setAvatar(u); });
    return () => { alive = false; };
  }, [open, target]);

  // Realtime: refresh on any message change in this thread.
  useEffect(() => {
    if (!open || !threadId) return;
    const unsub = subscribeDmThread(threadId, () => {
      void listDmMessages(threadId).then((rows) => {
        setMessages(rows);
        void markDmThreadRead(threadId).finally(() => notifyActivityUnreadChanged());
        requestAnimationFrame(() => scrollToBottom(true));
      });
    });
    return unsub;
  }, [open, threadId, scrollToBottom]);

  const onToggleBlock = async () => {
    if (!target || blocking) return;
    setBlocking(true);
    haptic.medium();
    const r = isBlocked
      ? await unblockUser(target.otherId)
      : await blockUserAndNotify(target.otherId, {
          displayName: target.otherName ?? undefined,
          avatarUrl: target.otherAvatarUrl ?? null,
        });
    setBlocking(false);
    setActionsOpen(false);
    if (r.ok) {
      await refreshBlockedIds();
      haptic.success();
      toast.success(isBlocked ? t("block.unblocked") : t("block.blocked"));
      if (!isBlocked) onClose();
    } else {
      toast.error(t("block.failed"));
    }
  };

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !target || sending) return;
    setSending(true);
    haptic.light();
    const r = await sendDm(target.otherId, body);
    setSending(false);
    if (!r.ok) {
      if (r.error === "blocked") toast.error(t("dm.errorBlocked", { defaultValue: "Vous ne pouvez pas échanger avec cet utilisateur." }));
      else if (r.error === "suspended") toast.error(t("dm.errorSuspended", { defaultValue: "Ton compte ne permet pas d'envoyer des messages." }));
      else toast.error(t("common.error", { defaultValue: "Erreur" }));
      return;
    }
    setDraft("");
    setThreadId(r.threadId);
    setMessages((prev) => [...prev, r.message]);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  if (!target) return null;

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      zIndex={80}
      title={target.otherName || t("dm.title", { defaultValue: "Message" })}
      right={
        <div className="flex items-center gap-1">
          {avatar && (
            <img
              src={avatar}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
              onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              draggable={false}
            />
          )}
          <Press
            aria-label={t("common.more", { defaultValue: "Plus" })}
            onClick={() => { haptic.light(); setActionsOpen(true); }}
            className="h-9 w-9 rounded-full text-foreground"
          >
            <MoreHorizontal size={20} strokeWidth={2.2} />
          </Press>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Messages list */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <p className="text-[14px] font-semibold">
                {target.otherName || ""}
                {target.otherIsVerified && <VerifiedBadge verified size={13} className="ml-1" />}
              </p>
              <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">
                {t("dm.emptyThread", { defaultValue: "Envoie ton premier message pour démarrer la conversation." })}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {messages.map((m, i) => {
                const mine = m.sender_id === user?.id;
                const prev = messages[i - 1];
                const gap = prev && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 20 * 60 * 1000;
                return (
                  <li key={m.id}>
                    {(i === 0 || gap) && (
                      <p className="my-2 text-center text-[10.5px] text-muted-foreground">
                        {formatDmTime(m.created_at)}
                      </p>
                    )}
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug"
                        style={
                          mine
                            ? { background: "var(--accent)", color: "var(--accent-foreground)", borderBottomRightRadius: 6 }
                            : { background: "var(--muted)", color: "var(--foreground)", borderBottomLeftRadius: 6 }
                        }
                      >
                        {m.body}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Composer (or blocked notice) */}
        {isBlocked ? (
          <div
            className="shrink-0 border-t border-border bg-background px-4 pt-3 text-center"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
          >
            <p className="text-[13px] text-muted-foreground">
              {t("dm.blockedNotice", { defaultValue: "Tu as bloqué cet utilisateur. Débloque-le pour reprendre la conversation." })}
            </p>
            <Press
              onClick={() => void onToggleBlock()}
              disabled={blocking}
              className="mt-2 !min-h-9 h-9 rounded-full border border-border px-4 text-[13px] font-semibold"
            >
              {blocking ? <Loader2 size={14} className="animate-spin" /> : t("block.unblock")}
            </Press>
          </div>
        ) : (
        <div
          className="shrink-0 border-t border-border bg-background px-3 pt-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              placeholder={t("dm.inputPlaceholder", { defaultValue: "Écris un message…" })}
              rows={1}
              maxLength={2000}
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-muted/60 px-3.5 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-foreground/30"
            />
            <Press
              aria-label={t("dm.send", { defaultValue: "Envoyer" })}
              onClick={() => void onSend()}
              disabled={!draft.trim() || sending}
              className="!min-h-0 grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full"
              style={{
                background: draft.trim() ? "var(--accent)" : "var(--muted)",
                color: draft.trim() ? "var(--accent-foreground)" : "var(--muted-foreground)",
              }}
            >
              {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </Press>
          </div>
        </div>
        )}
      </div>

      {/* Actions sheet: report / block (Apple UGC guideline 1.2) */}
      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setActionsOpen(false)}
          >
            <motion.div
              className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 0.22, ease: EASE_IOS }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[16px] font-bold">{target.otherName || t("dm.title", { defaultValue: "Message" })}</h2>
                <Press onClick={() => setActionsOpen(false)} className="h-9 w-9 rounded-full"><X size={18} /></Press>
              </div>
              <Press
                onClick={() => { setActionsOpen(false); setReportOpen(true); }}
                className="flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold"
              >
                <Flag size={20} />
                {t("report.action", { defaultValue: "Signaler" })}
              </Press>
              <Press
                onClick={() => void onToggleBlock()}
                disabled={blocking}
                className={`mt-1 flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold ${isBlocked ? "" : "text-red-500"}`}
              >
                {blocking ? <Loader2 size={18} className="animate-spin" /> : <Ban size={20} />}
                {isBlocked ? t("block.unblock") : t("block.action")}
              </Press>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={target.otherId}
      />
    </PushScreen>
  );
}

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}
