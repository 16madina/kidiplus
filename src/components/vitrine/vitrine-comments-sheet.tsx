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
  onCommentAdded,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
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
    });
    // Focus after bottom-sheet slide-up so iOS opens the keyboard.
    const tFocus = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 380);
    return () => {
      alive = false;
      window.clearTimeout(tFocus);
    };
  }, [open, postId]);

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

  const send = async () => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    if (isDemo) {
      toast(t("vitrine.commentsStub"));
      return;
    }
    const body = text.trim();
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
                return (
                  <li key={c.id} className="flex gap-2.5">
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
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1000))}
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
              disabled={sending || !text.trim()}
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
