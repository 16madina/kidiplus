import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
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
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const isDemo = postId.startsWith("demo-");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchVitrineComments(postId).then((r) => {
      if (!alive) return;
      setRows(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open, postId]);

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
      toast.success(t("vitrine.commentSent", { defaultValue: "Commentaire publié" }));
    } finally {
      setSending(false);
    }
  };

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("vitrine.commentsTitle")}
      zIndex={80}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {isDemo ? t("vitrine.commentsStub") : t("vitrine.commentsEmpty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white"
                    style={{ background: "#10162B" }}
                  >
                    {c.author?.avatar_url ? (
                      <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.author?.display_name || c.author?.handle || "?").slice(0, 1).toUpperCase()
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
              ))}
            </ul>
          )}
        </div>

        <div
          className="shrink-0 border-t border-border bg-background px-3 pt-2"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1000))}
              rows={1}
              placeholder={t("vitrine.commentPlaceholder", {
                defaultValue: "Ajouter un commentaire…",
              })}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[14px] outline-none focus:border-[color:var(--accent)]"
              onFocus={() => {
                if (guestMode || !user) openAuth();
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
    </PushScreen>
  );
}
