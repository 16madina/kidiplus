import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Ban, VolumeX, Flag, Reply } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMsg } from "@/lib/live-viewer-mock";
import { Press } from "@/components/press";

// Windowing cap — kept low: 40 lignes suffisent visuellement et évitent
// que Framer Motion `layout` déclenche un reflow O(n) sur chaque burst.
const VISIBLE_MSGS = 40;
const BURST_THRESHOLD_PER_SEC = 30;
/** TikTok-style: "X a rejoint" flashes then leaves the chat. */
const JOIN_TTL_MS = 3_000;

export type LiveChatModeration = {
  /** True when the current viewer is host/moderator: shows the "Mute" action. */
  canModerate: boolean;
  /**
   * True when the viewer is signed in — Apple 1.2 requires flag/block on all
   * UGC surfaces, so any authenticated user opens the same message menu to
   * report a message or block its author.
   */
  canReport?: boolean;
  selfUserId?: string | null;
  /** Host / seller — never muteable from chat. */
  hostUserId?: string | null;
  mutedIds?: Set<string>;
  onMuteUser?: (userId: string, displayName: string) => void;
  onBlockUser?: (userId: string, displayName: string) => void;
  /** Called with the message id when the viewer taps "Signaler". */
  onReportMessage?: (messageId: string) => void;
  /** Reply to a comment (TikTok-style). */
  onReply?: (msg: ChatMsg) => void;
};

export function LiveChat({
  messages,
  moderation,
  /** Lift chat above bottom chrome (composer / bid bar). */
  bottomOffset,
  /** Visible chat stack height. */
  height = "36dvh",
}: {
  messages: ChatMsg[];
  moderation?: LiveChatModeration;
  bottomOffset?: string | number;
  height?: string | number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [menuMsg, setMenuMsg] = useState<ChatMsg | null>(null);
  const [expiredJoins, setExpiredJoins] = useState<Set<string>>(() => new Set());
  const joinTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const unpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastCountRef = useRef(messages.length);
  const lastTsRef = useRef(performance.now());
  const [burstMode, setBurstMode] = useState(false);
  useEffect(() => {
    const now = performance.now();
    const dt = Math.max(1, now - lastTsRef.current);
    const delta = messages.length - lastCountRef.current;
    const rate = (delta * 1000) / dt;
    lastCountRef.current = messages.length;
    lastTsRef.current = now;
    if (rate > BURST_THRESHOLD_PER_SEC) {
      setBurstMode(true);
      const t = setTimeout(() => setBurstMode(false), 1500);
      return () => clearTimeout(t);
    }
  }, [messages]);

  // Expire join announcements after a few seconds so they don't clutter chat.
  useEffect(() => {
    for (const m of messages) {
      if (m.systemKind !== "join") continue;
      if (expiredJoins.has(m.id) || joinTimersRef.current.has(m.id)) continue;
      joinTimersRef.current.set(
        m.id,
        setTimeout(() => {
          joinTimersRef.current.delete(m.id);
          setExpiredJoins((prev) => {
            if (prev.has(m.id)) return prev;
            const next = new Set(prev);
            next.add(m.id);
            return next;
          });
        }, JOIN_TTL_MS),
      );
    }
  }, [messages, expiredJoins]);

  useEffect(() => {
    return () => {
      for (const t of joinTimersRef.current.values()) clearTimeout(t);
      joinTimersRef.current.clear();
      if (unpinTimerRef.current) clearTimeout(unpinTimerRef.current);
    };
  }, []);

  const visible = useMemo(() => {
    const base =
      messages.length > VISIBLE_MSGS ? messages.slice(-VISIBLE_MSGS) : messages;
    return base.filter(
      (m) => !(m.systemKind === "join" && expiredJoins.has(m.id)),
    );
  }, [messages, expiredJoins]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      const isPinned = distFromBottom < 32;
      setPinned(isPinned);
      setShowJump(!isPinned);
      // TikTok-like: if the host glances up then stops, resume live follow.
      if (unpinTimerRef.current) clearTimeout(unpinTimerRef.current);
      if (!isPinned) {
        unpinTimerRef.current = setTimeout(() => {
          setPinned(true);
          setShowJump(false);
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }, 4_000);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: burstMode ? "auto" : "smooth" });
    });
  }, [messages, pinned, burstMode, visible.length]);

  const jumpDown = () => {
    const el = scrollerRef.current;
    if (!el) return;
    if (unpinTimerRef.current) clearTimeout(unpinTimerRef.current);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinned(true);
    setShowJump(false);
  };

  const maskStyle = useMemo(
    () => ({
      maskImage:
        "linear-gradient(to bottom, transparent 0%, black 28px, black 100%)",
      WebkitMaskImage:
        "linear-gradient(to bottom, transparent 0%, black 28px, black 100%)",
    }),
    [],
  );

  const canModerateMsg = (m: ChatMsg) => {
    if (!m.userId || m.system) return false;
    if (m.userId === moderation?.selfUserId) return false;
    if (m.userId === moderation?.hostUserId) return false;
    return !!moderation?.canModerate;
  };

  const canReportMsg = (m: ChatMsg) => {
    if (!m.userId || m.system) return false;
    if (m.userId === moderation?.selfUserId) return false;
    return !!moderation?.canReport;
  };

  const canReplyMsg = (m: ChatMsg) => {
    if (m.system || !moderation?.onReply) return false;
    if (m.userId && m.userId === moderation.selfUserId) return false;
    return !!m.user;
  };

  const canOpenMenu = (m: ChatMsg) =>
    canReplyMsg(m) || canModerateMsg(m) || canReportMsg(m);

  const { t } = useTranslation();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-start px-3"
      style={{ bottom: bottomOffset ?? 0 }}
    >
      <div
        className="pointer-events-auto flex w-[85%] max-w-[420px] flex-col"
        style={{ height }}
      >
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto pb-2"
          style={{
            ...maskStyle,
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="flex flex-col justify-end gap-1.5 pt-6">
            {burstMode ? (
              visible.map((m) => (
                <div key={m.id}>
                  <ChatBubble
                    msg={m}
                    interactive={canOpenMenu(m)}
                    alreadyMuted={!!(m.userId && moderation?.mutedIds?.has(m.userId))}
                    onOpenMenu={() => setMenuMsg(m)}
                  />
                </div>
              ))
            ) : (
              <AnimatePresence initial={false}>
                {visible.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      m.systemKind === "join"
                        ? { opacity: 0, y: -6, transition: { duration: 0.35 } }
                        : { opacity: 0 }
                    }
                    transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <ChatBubble
                      msg={m}
                      interactive={canOpenMenu(m)}
                      alreadyMuted={!!(m.userId && moderation?.mutedIds?.has(m.userId))}
                      onOpenMenu={() => setMenuMsg(m)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showJump && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto z-30 mb-1 self-start"
            >
              <Press
                onClick={jumpDown}
                className="!min-h-8 rounded-full px-3 text-xs font-semibold text-white"
                style={{
                  backgroundColor: "rgba(0,0,0,0.7)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                {t("live.newComments", "Nouveaux commentaires")}
                <ChevronDown size={14} className="ml-1" />
              </Press>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {menuMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-4 pb-8"
            onClick={() => setMenuMsg(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-black shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b px-4 py-3 text-[13px] text-muted-foreground">
                <span className="font-semibold text-foreground">{menuMsg.user}</span>
                {" · "}
                <span className="line-clamp-1">{menuMsg.text}</span>
              </div>
              {canReplyMsg(menuMsg) && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[15px] font-semibold active:bg-black/5"
                  onClick={() => {
                    const msg = menuMsg;
                    setMenuMsg(null);
                    moderation?.onReply?.(msg);
                  }}
                >
                  <Reply size={18} />
                  {t("live.reply", "Répondre")}
                </button>
              )}
              {canReportMsg(menuMsg) && moderation?.onReportMessage && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[15px] font-semibold active:bg-black/5"
                  onClick={() => {
                    const messageId = menuMsg.id;
                    setMenuMsg(null);
                    moderation?.onReportMessage?.(messageId);
                  }}
                >
                  <Flag size={18} />
                  {t("report.action", "Signaler")}
                </button>
              )}
              {canModerateMsg(menuMsg) &&
                !(menuMsg.userId && moderation?.mutedIds?.has(menuMsg.userId)) && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[15px] font-semibold active:bg-black/5"
                  onClick={() => {
                    const id = menuMsg.userId!;
                    const name = menuMsg.user;
                    setMenuMsg(null);
                    moderation?.onMuteUser?.(id, name);
                  }}
                >
                  <VolumeX size={18} />
                  {t("moderator.muteInLive", "Couper les commentaires")}
                </button>
              )}
              {(canModerateMsg(menuMsg) || canReportMsg(menuMsg)) && menuMsg.userId && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[15px] font-semibold text-red-600 active:bg-black/5"
                  onClick={() => {
                    const id = menuMsg.userId!;
                    const name = menuMsg.user;
                    setMenuMsg(null);
                    moderation?.onBlockUser?.(id, name);
                  }}
                >
                  <Ban size={18} />
                  {t("moderator.blockUser", "Bloquer")}
                </button>
              )}
              <button
                type="button"
                className="w-full border-t px-4 py-3.5 text-[15px] font-semibold text-muted-foreground active:bg-black/5"
                onClick={() => setMenuMsg(null)}
              >
                {t("common.cancel", "Annuler")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ChatBubble = memo(function ChatBubble({
  msg,
  interactive,
  alreadyMuted,
  onOpenMenu,
}: {
  msg: ChatMsg;
  interactive?: boolean;
  alreadyMuted?: boolean;
  onOpenMenu?: () => void;
}) {
  const { t } = useTranslation();

  if (msg.system) {
    const label =
      msg.systemKind === "join"
        ? t("live.userJoined", {
            name: msg.text,
            defaultValue: "{{name}} a rejoint",
          })
        : msg.text;
    return (
      <div
        className="self-start rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
        style={{
          backgroundColor: "rgba(255,255,255,0.14)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </div>
    );
  }

  const open = () => {
    if (interactive) onOpenMenu?.();
  };

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={open}
      onContextMenu={(e) => {
        if (!interactive) return;
        e.preventDefault();
        open();
      }}
      className="flex max-w-full items-start gap-1.5 text-left disabled:pointer-events-none"
      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
    >
      <div
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: msg.color }}
      >
        {msg.user.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 text-[13px] leading-snug">
        {msg.replyTo ? (
          <div className="mb-0.5 truncate text-[11px] font-medium text-white/65">
            ↪ {msg.replyTo.user}
            {msg.replyTo.text ? ` · ${msg.replyTo.text}` : ""}
          </div>
        ) : null}
        <span className="font-semibold" style={{ color: msg.color }}>
          {msg.user}
        </span>
        {msg.source === "youtube" ? (
          <span
            className="ml-1 inline-flex align-middle items-center rounded px-1 py-px text-[9px] font-black tracking-wide text-white"
            style={{ backgroundColor: "oklch(0.55 0.22 25)" }}
          >
            YT
          </span>
        ) : msg.source === "facebook" ? (
          <span
            className="ml-1 inline-flex align-middle items-center rounded px-1 py-px text-[9px] font-black tracking-wide text-white"
            style={{ backgroundColor: "oklch(0.5 0.14 260)" }}
          >
            FB
          </span>
        ) : null}
        {msg.isHost ? (
          <span
            className="ml-1 inline-flex align-middle items-center rounded px-1 py-px text-[9px] font-black tracking-wide text-black"
            style={{ backgroundColor: "oklch(0.85 0.18 90)" }}
          >
            HOST
          </span>
        ) : msg.isModerator ? (
          <span
            className="ml-1 inline-flex align-middle items-center gap-0.5 rounded px-1 py-px text-[9px] font-black tracking-wide text-black"
            style={{ backgroundColor: "oklch(0.85 0.18 90)" }}
          >
            MOD
          </span>
        ) : null}{" "}
        <span className={alreadyMuted ? "text-white/50 line-through" : "text-white"}>
          {msg.text}
        </span>
      </div>
    </button>
  );
});
