import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import {
  addVitrineComment,
  fetchVitrineComments,
  toggleVitrineCommentLike,
  type VitrineComment,
} from "@/lib/vitrine-db";

/** One-tap reactions so viewers can drop a heart without typing. */
const QUICK_EMOJIS: string[] = ["❤️", "🔥", "😍", "🥰", "👏", "😂", "👍", "🎉"];

export function VitrineCommentsSheet({
  open,
  onClose,
  postId,
  highlightCommentId = null,
  highlightParentCommentId = null,
  onCommentAdded,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  /** Scroll/highlight this comment when opening from an Activity deep-link. */
  highlightCommentId?: string | null;
  /** Parent of a deep-linked reply: expand that thread on open. */
  highlightParentCommentId?: string | null;
  onCommentAdded?: () => void;
}) {
  const { t } = useTranslation();
  const { user, guestMode, profile } = useAuth();
  const { openAuth } = useAuthPrompt();
  const [rows, setRows] = useState<VitrineComment[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<VitrineComment | null>(null);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [kbPad, setKbPad] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isDemo = postId.startsWith("demo-");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setText("");
    setReplyTo(null);
    void fetchVitrineComments(postId).then((r) => {
      if (!alive) return;
      setRows(r);
      setLoading(false);
      // Pre-expand the thread containing a deep-linked reply so the target
      // row is mounted before we try to scroll to it.
      const target = highlightCommentId
        ? r.find((c) => c.id === highlightCommentId)
        : null;
      const parentId = target?.parent_id ?? highlightParentCommentId;
      if (parentId) {
        setOpenThreads((prev) => ({ ...prev, [parentId]: true }));
      }
    });

    // Focus after bottom-sheet slide-up so iOS opens the keyboard.
    // Skip auto-focus when deep-linking to a specific comment (avoid stealing scroll).
    const tFocus = window.setTimeout(() => {
      if (!highlightCommentId) {
        inputRef.current?.focus({ preventScroll: true });
      }
    }, 380);
    return () => {
      alive = false;
      window.clearTimeout(tFocus);
    };
  }, [open, postId, highlightCommentId, highlightParentCommentId]);

  // Keep composer above the software keyboard (TikTok-style).
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbPad(overlap > 40 ? overlap : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      setKbPad(0);
    };
  }, [open]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        rows.map(async (c) => {
          const url = await resolveAvatarUrl(c.author?.avatar_url);
          return [c.id, url] as const;
        }),
      );
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) if (url) next[id] = url;
      setAvatars(next);
    })();
    return () => {
      alive = false;
    };
  }, [rows]);

  /**
   * Android keyboards (GBoard & co.) insert emojis through an IME composition.
   * React skips `onChange` while a composition is active, so the emoji shows up
   * in the DOM but the React state stays empty → send stays disabled.
   * Always read the live DOM value as the source of truth.
   */
  const syncFromDom = () => {
    const el = inputRef.current;
    if (!el) return;
    setText(el.value.slice(0, 1000));
  };

  const insertEmoji = (emoji: string) => {
    haptic.light();
    setText((prev) => (prev + emoji).slice(0, 1000));
    inputRef.current?.focus({ preventScroll: true });
  };

  const toggleLike = (c: VitrineComment) => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    const liked = !!c.liked_by_me;
    haptic.light();
    setRows((prev) =>
      prev.map((r) =>
        r.id === c.id
          ? {
              ...r,
              liked_by_me: !liked,
              like_count: Math.max(0, (r.like_count ?? 0) + (liked ? -1 : 1)),
            }
          : r,
      ),
    );
    void toggleVitrineCommentLike(c.id, liked).then((res) => {
      if (res.ok) return;
      setRows((prev) =>
        prev.map((r) =>
          r.id === c.id
            ? { ...r, liked_by_me: liked, like_count: Math.max(0, (r.like_count ?? 0) + (liked ? 1 : -1)) }
            : r,
        ),
      );
    });
  };

  const startReply = (c: VitrineComment) => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    haptic.light();
    setReplyTo(c);
    const handle = c.author?.handle;
    const mention = handle ? `@${handle} ` : "";
    setText(mention);
    if (inputRef.current) inputRef.current.value = mention;
    inputRef.current?.focus({ preventScroll: true });
  };

  const send = async () => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    if (isDemo) {
      toast(t("vitrine.commentsStub"));
      return;
    }
    // Fall back to the DOM value: an uncommitted IME composition (emoji panel
    // on Android) may not have reached React state yet.
    const body = (inputRef.current?.value ?? text).trim();
    if (!body || sending) return;
    setSending(true);
    haptic.light();
    try {
      const row = await addVitrineComment(postId, body, replyTo?.id ?? null);
      if (!row) {
        toast.error(t("common.error", { defaultValue: "Erreur" }));
        return;
      }
      const withAuthor: VitrineComment = {
        ...row,
        author: {
          display_name: profile?.display_name ?? null,
          handle: profile?.handle ?? null,
          avatar_url: profile?.avatar_url ?? null,
        },
      };
      setRows((prev) => [withAuthor, ...prev]);
      setText("");
      if (inputRef.current) inputRef.current.value = "";
      if (replyTo) setOpenThreads((prev) => ({ ...prev, [replyTo.id]: true }));
      const wasReply = !!replyTo;
      setReplyTo(null);
      onCommentAdded?.();
      if (!wasReply) listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(
        wasReply
          ? t("vitrine.replySent", { defaultValue: "Réponse publiée" })
          : t("vitrine.commentSent", { defaultValue: "Commentaire publié" }),
      );
    } finally {
      setSending(false);
    }
  };


  const repliesByParent: Record<string, VitrineComment[]> = {};
  for (const c of rows) {
    if (!c.parent_id) continue;
    (repliesByParent[c.parent_id] ??= []).push(c);
  }
  for (const list of Object.values(repliesByParent)) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const roots = rows.filter((c) => !c.parent_id);

  // Auto-expand the thread that contains a deep-linked reply, then scroll to
  // it (retrying while the sheet animates / the row mounts).
  useEffect(() => {
    if (!open || !highlightCommentId) return;
    const target = rows.find((r) => r.id === highlightCommentId);
    const parentId = target?.parent_id ?? highlightParentCommentId;
    if (parentId) {
      setOpenThreads((prev) => (prev[parentId] ? prev : { ...prev, [parentId]: true }));
    }
    let tries = 0;
    const iv = window.setInterval(() => {
      tries += 1;
      const el = document.getElementById(`vitrine-comment-${highlightCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.clearInterval(iv);
      } else if (tries > 25) {
        window.clearInterval(iv);
      }
    }, 120);
    return () => window.clearInterval(iv);
  }, [open, highlightCommentId, highlightParentCommentId, rows]);


  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={58} zIndex={92}>
      <div
        className="flex h-full min-h-0 flex-col"
        style={{ paddingBottom: kbPad > 0 ? kbPad : undefined }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-2">
          <h2 className="text-[16px] font-bold">{t("vitrine.commentsTitle")}</h2>
          <Press
            aria-label={t("common.close", { defaultValue: "Fermer" })}
            onClick={onClose}
            className="h-9 w-9 rounded-full text-muted-foreground"
          >
            <X size={18} />
          </Press>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {isDemo ? t("vitrine.commentsStub") : t("vitrine.commentsEmpty")}
            </p>
          ) : (
            <ul className="space-y-3 pb-2">
              {roots.map((c) => {
                const initial = (
                  c.author?.display_name ||
                  c.author?.handle ||
                  "?"
                )
                  .slice(0, 1)
                  .toUpperCase();
                const avatar = avatars[c.id];
                const highlighted = highlightCommentId === c.id;
                const replies = repliesByParent[c.id] ?? [];
                const expanded = !!openThreads[c.id];
                return (
                  <li key={c.id}>
                    <CommentRow
                      c={c}
                      avatar={avatar}
                      initial={initial}
                      highlighted={highlighted}
                      onReply={() => startReply(c)}
                      onLike={() => toggleLike(c)}
                      replyLabel={t("vitrine.reply", { defaultValue: "Répondre" })}
                    />
                    {replies.length > 0 && (
                      <div className="ml-11 mt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenThreads((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                          }
                          className="text-[12px] font-semibold text-muted-foreground"
                        >
                          {expanded
                            ? t("vitrine.hideReplies", { defaultValue: "Masquer les réponses" })
                            : t("vitrine.viewReplies", {
                                count: replies.length,
                                defaultValue: `Voir les réponses (${replies.length})`,
                              })}
                        </button>
                        {expanded && (
                          <ul className="mt-2 space-y-2">
                            {replies.map((r) => (
                              <li key={r.id}>
                                <CommentRow
                                  c={r}
                                  avatar={avatars[r.id]}
                                  initial={(r.author?.display_name || r.author?.handle || "?")
                                    .slice(0, 1)
                                    .toUpperCase()}
                                  highlighted={highlightCommentId === r.id}
                                  onReply={() => startReply(r)}
                                  onLike={() => toggleLike(r)}
                                  replyLabel={t("vitrine.reply", { defaultValue: "Répondre" })}
                                  small
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-1.5">
              <span className="truncate text-[12px] text-muted-foreground">
                {t("vitrine.replyingTo", {
                  name:
                    replyTo.author?.display_name || replyTo.author?.handle || "…",
                  defaultValue: "Réponse à {{name}}",
                })}
              </span>
              <Press
                aria-label={t("vitrine.cancelReply", { defaultValue: "Annuler" })}
                onClick={() => {
                  setReplyTo(null);
                  setText("");
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="!min-h-0 h-7 w-7 rounded-full p-0 text-muted-foreground"
              >
                <X size={14} />
              </Press>
            </div>
          )}
          {/* Quick reactions — post a heart / emoji without opening the keyboard. */}
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_EMOJIS.map((e) => (
              <Press
                key={e}
                aria-label={e}
                onClick={() => insertEmoji(e)}
                className="h-9 w-9 shrink-0 rounded-full bg-muted/60 text-[18px] leading-none"
              >
                {e}
              </Press>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1000))}
              // IME-safe: emoji panels on Android commit through composition,
              // which React does not surface via onChange.
              onInput={syncFromDom}
              onCompositionEnd={syncFromDom}
              onBlur={syncFromDom}
              rows={1}
              enterKeyHint="send"
              placeholder={t("vitrine.commentPlaceholder", {
                defaultValue: "Ajouter un commentaire…",
              })}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[14px] outline-none focus:border-[color:var(--accent)]"
              onFocus={() => {
                if (guestMode || !user) openAuth();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Press
              aria-label={t("vitrine.comment")}
              onClick={() => void send()}
              disabled={sending}
              className="h-11 w-11 shrink-0 rounded-full text-[#10162B] disabled:opacity-40"
              style={{ background: "#E8B93B" }}
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </Press>
          </div>
        </div>

      </div>
    </BottomSheet>
  );
}


function CommentRow({
  c,
  avatar,
  initial,
  highlighted,
  onReply,
  onLike,
  replyLabel,
  small = false,
}: {
  c: VitrineComment;
  avatar?: string;
  initial: string;
  highlighted: boolean;
  onReply: () => void;
  onLike: () => void;
  replyLabel: string;
  small?: boolean;
}) {
  const size = small ? "h-7 w-7" : "h-9 w-9";
  return (
    <div
      id={`vitrine-comment-${c.id}`}
      className="flex gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors"
      style={
        highlighted
          ? { background: "color-mix(in oklch, #E8B93B 22%, transparent)" }
          : undefined
      }
    >
      <div
        className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white`}
        style={{ background: "#10162B" }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">
          {c.author?.display_name || c.author?.handle || "…"}
        </p>
        <p className="text-[13px] text-foreground/90 whitespace-pre-wrap break-words">
          {c.body}
        </p>
        <button
          type="button"
          onClick={onReply}
          className="mt-0.5 text-[12px] font-semibold text-muted-foreground"
        >
          {replyLabel}
        </button>
      </div>
      <button
        type="button"
        onClick={onLike}
        aria-pressed={!!c.liked_by_me}
        className="flex shrink-0 flex-col items-center gap-0.5 self-start pt-1 text-muted-foreground"
      >
        <Heart
          size={small ? 14 : 16}
          className={c.liked_by_me ? "text-rose-500" : ""}
          fill={c.liked_by_me ? "currentColor" : "none"}
        />
        {(c.like_count ?? 0) > 0 && (
          <span className="text-[11px] tabular-nums">{c.like_count}</span>
        )}
      </button>
    </div>
  );
}
