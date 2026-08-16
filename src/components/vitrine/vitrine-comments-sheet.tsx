import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
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
  type VitrineComment,
} from "@/lib/vitrine-db";

export function VitrineCommentsSheet({
  open,
  onClose,
  postId,
  highlightCommentId = null,
  onCommentAdded,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  /** Scroll/highlight this comment when opening from an Activity deep-link. */
  highlightCommentId?: string | null;
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
  const [kbPad, setKbPad] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isDemo = postId.startsWith("demo-");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setText("");
    void fetchVitrineComments(postId).then((r) => {
      if (!alive) return;
      setRows(r);
      setLoading(false);
      if (highlightCommentId) {
        window.setTimeout(() => {
          const el = document.getElementById(`vitrine-comment-${highlightCommentId}`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 420);
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
  }, [open, postId, highlightCommentId]);

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
      const row = await addVitrineComment(postId, body);
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
      onCommentAdded?.();
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(t("vitrine.commentSent", { defaultValue: "Commentaire publié" }));
    } finally {
      setSending(false);
    }
  };


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
              {rows.map((c) => {
                const initial = (
                  c.author?.display_name ||
                  c.author?.handle ||
                  "?"
                )
                  .slice(0, 1)
                  .toUpperCase();
                const avatar = avatars[c.id];
                const highlighted = highlightCommentId === c.id;
                return (
                  <li
                    id={`vitrine-comment-${c.id}`}
                    key={c.id}
                    className="flex gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors"
                    style={
                      highlighted
                        ? { background: "color-mix(in oklch, #E8B93B 22%, transparent)" }
                        : undefined
                    }
                  >
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white"
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
