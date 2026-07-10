// Self-serve certification (verified badge) sheet for sellers.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { fetchEligibility, fetchMyLatestRequest, submitVerificationRequest, type Eligibility, type VerificationRequestRow } from "@/lib/verification-db";
import { useAuth } from "@/lib/auth-context";
import { VerifiedBadge } from "@/components/verified-badge";

export function CertificationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [req, setReq] = useState<VerificationRequestRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    void Promise.all([fetchEligibility(user.id), fetchMyLatestRequest(user.id)]).then(([e, r]) => {
      setElig(e);
      setReq(r);
      setLoading(false);
    });
  }, [open, user]);

  const verified = !!profile?.is_verified;
  const pending = req?.status === "pending";
  const canSubmit = !!elig?.all_ok && !verified && !pending;

  async function onSubmit() {
    if (submitting) return;
    setSubmitting(true);
    const res = await submitVerificationRequest(msg);
    setSubmitting(false);
    if (res.ok) {
      toast.success(t("verify.submitted", "Demande envoyée ✓"));
      const r = user ? await fetchMyLatestRequest(user.id) : null;
      setReq(r);
      setMsg("");
    } else {
      toast.error(t("verify.submitError", "Erreur : ") + (res.error ?? ""));
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pt-2 pb-2 text-[16px] font-bold">{t("verify.title", "Certification")}</div>
      <div className="space-y-4 px-4 pb-6">
        {verified ? (
          <div className="rounded-2xl border border-white/10 bg-[color-mix(in_oklch,var(--card)_92%,transparent)] p-4">
            <div className="flex items-center gap-2 text-[16px] font-bold">
              <VerifiedBadge verified size={20} />
              <span>{t("verify.youAreVerified", "Ton compte est certifié")}</span>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {t("verify.verifiedHint", "Le badge s'affiche à côté de ton nom partout dans l'app.")}
            </p>
          </div>
        ) : pending ? (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
            <p className="text-[15px] font-semibold">{t("verify.pending", "Demande en cours d'examen")}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t("verify.pendingHint", "L'équipe reviendra vers toi rapidement.")}
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
            {t("verify.criteria", "Critères")}
          </p>
          {loading || !elig ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            <ul className="space-y-2">
              <Criterion ok={elig.is_seller} label={t("verify.crit.seller", "Boutique vendeur activée")} />
              <Criterion ok={elig.sales_ok} label={t("verify.crit.sales", "10 ventes livrées") + ` (${elig.sales_count}/10)`} />
              <Criterion ok={elig.rating_ok} label={t("verify.crit.rating", "Note ≥ 4/5 (min. 5 avis)") + ` (${elig.rating_avg} ★ · ${elig.review_count})`} />
              <Criterion ok={elig.age_ok} label={t("verify.crit.age", "Compte ≥ 30 jours") + ` (${elig.age_days}j)`} />
              <Criterion ok={elig.no_sanction} label={t("verify.crit.noSanction", "Aucune sanction en cours")} />
            </ul>
          )}
        </div>

        {!verified && !pending && (
          <>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={t("verify.messagePlaceholder", "Un mot pour l'équipe (optionnel)")}
              className="w-full rounded-xl border border-white/10 bg-transparent p-3 text-[14px] outline-none"
              rows={3}
            />
            <Press
              onClick={canSubmit ? onSubmit : undefined}
              disabled={!canSubmit || submitting}
              className="w-full rounded-full py-3 text-[15px] font-semibold text-white"
              style={{
                backgroundColor: canSubmit ? "oklch(0.68 0.16 80)" : "oklch(0.4 0 0)",
                opacity: canSubmit ? 1 : 0.6,
              }}
            >
              {submitting ? "…" : t("verify.submit", "Demander la certification")}
            </Press>
          </>
        )}
      </div>
    </BottomSheet>
  );

  function Criterion({ ok, label }: { ok: boolean; label: string }) {
    return (
      <li className="flex items-center gap-2 text-[14px]">
        <span
          className="grid h-5 w-5 place-items-center rounded-full"
          style={{ backgroundColor: ok ? "oklch(0.6 0.17 155)" : "oklch(0.5 0.1 25)" }}
        >
          {ok ? <Check size={13} className="text-white" /> : <X size={13} className="text-white" />}
        </span>
        <span>{label}</span>
      </li>
    );
  }
}
