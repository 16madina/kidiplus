import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PushScreen } from "@/components/push-screen";
import { fetchVitrineComments, type VitrineComment } from "@/lib/vitrine-db";

export function VitrineCommentsSheet({
  open,
  onClose,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<VitrineComment[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("vitrine.commentsTitle")}
      zIndex={80}
    >
      <div className="px-4 py-3">
        {loading ? (
          <p className="text-[13px] text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {postId.startsWith("demo-")
              ? t("vitrine.commentsStub")
              : t("vitrine.commentsEmpty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => (
              <li key={c.id} className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {c.author?.display_name || c.author?.handle || "…"}
                  </p>
                  <p className="text-[13px] text-foreground/90">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PushScreen>
  );
}
