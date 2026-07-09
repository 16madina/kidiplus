import { useEffect, useState } from "react";
import { Star, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { getMyReviewForOrder, leaveReview } from "@/lib/reviews-db";
import { haptic } from "@/lib/haptics";

export function LeaveReviewSheet({
  open,
  onClose,
  orderId,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onSubmitted?: () => void;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    void getMyReviewForOrder(orderId).then((r) => {
      if (r) { setRating(r.rating); setComment(r.comment ?? ""); setExisting(true); }
      else { setRating(5); setComment(""); setExisting(false); }
    });
  }, [open, orderId]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const res = await leaveReview(orderId, rating, comment);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? t("common.error"));
      return;
    }
    haptic.success();
    toast.success(t("reviews.thanks", { defaultValue: "Merci pour ton avis !" }));
    onSubmitted?.();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={60}>
      <div className="flex h-full flex-col px-5 pb-6">
        <div className="flex items-center justify-between pt-1 pb-3">
          <h2 className="text-[19px] font-bold">
            {existing ? t("reviews.edit", { defaultValue: "Modifier ton avis" }) : t("reviews.leave", { defaultValue: "Laisser un avis" })}
          </h2>
          <Press onClick={onClose} className="!min-h-10 h-10 w-10 rounded-full"><X size={20} /></Press>
        </div>

        <p className="mb-4 text-center text-[13px] text-muted-foreground">
          {t("reviews.rate", { defaultValue: "Comment évalues-tu cette commande ?" })}
        </p>

        <div className="mb-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Press
              key={n}
              onClick={() => { haptic.selection(); setRating(n); }}
              hapticOnTap={false}
              className="!min-h-12 h-12 w-12 rounded-full"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star
                size={30}
                className={n <= rating ? "text-amber-400" : "text-muted-foreground/30"}
                fill="currentColor"
                strokeWidth={0}
              />
            </Press>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 400))}
          placeholder={t("reviews.commentPlaceholder", { defaultValue: "Un commentaire (optionnel)…" })}
          rows={4}
          className="w-full resize-none rounded-xl border bg-muted px-4 py-3 text-[15px] outline-none"
          style={{ borderColor: "var(--border)" }}
        />

        <Press
          onClick={submit}
          disabled={saving}
          className="!min-h-14 mt-4 h-14 w-full rounded-2xl text-[16px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : (existing ? t("common.save") : t("reviews.submit", { defaultValue: "Envoyer" }))}
        </Press>
      </div>
    </BottomSheet>
  );
}
