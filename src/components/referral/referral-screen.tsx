// Influencer referral dashboard — their codes, stats, earnings, share.
// If the user owns no code, shows the claim flow (activation token).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Share2, Users, Package, Coins, Loader2, KeyRound, Sparkles, ArrowDownToLine, Wallet as WalletIcon, Cpu } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/i18n/language-context";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { WithdrawSheet } from "@/components/seller/withdraw-sheet";
import {
  fetchMyReferralBalance, subscribeMyReferralBalance, type ReferralBalance,
} from "@/lib/earnings-db";
import {
  fetchMyPromoCodes, fetchMyReferralEarnings, buildShareMessage, claimPromoCode,
  fetchMyPromoCodeRequest, submitPromoCodeRequest,
  type PromoCodeStats, type ReferralEarningRow, type MyPromoCodeRequest,
} from "@/lib/referrals-db";

const NAVY = "#10162B";
const GOLD = "#E8B93B";

export function ReferralScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { lang } = useLanguage();
  const { user, profile } = useAuth();
  const [codes, setCodes] = useState<PromoCodeStats[] | null>(null);
  const [earnings, setEarnings] = useState<ReferralEarningRow[]>([]);
  const [balance, setBalance] = useState<ReferralBalance | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const reload = async () => {
    const [c, e, b] = await Promise.all([
      fetchMyPromoCodes(),
      fetchMyReferralEarnings(50),
      user ? fetchMyReferralBalance(user.id) : Promise.resolve(null),
    ]);
    setCodes(c); setEarnings(e); setBalance(b);
  };

  useEffect(() => { if (open) { setCodes(null); void reload(); } }, [open, user?.id]);
  useEffect(() => {
    if (!open || !user) return;
    const un = subscribeMyReferralBalance(user.id, () => { void reload(); });
    return () => un();
  }, [open, user?.id]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); haptic.success(); toast.success(t("common.copied")); }
    catch { toast.error("Copy failed"); }
  };

  const share = async (code: string) => {
    const msg = buildShareMessage(code, lang);
    haptic.light();
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title: "KiDi+", text: msg }); return; } catch { /* fallback */ }
    }
    void copy(msg);
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("referral.title", "Parrainage 🤝")} zIndex={65}>
      <div className="px-4 py-4 pb-24">
        {codes === null ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <ClaimBlock onClaimed={reload} balance={balance} fallbackCurrency={profile?.currency ?? "EUR"} onWithdraw={() => setWithdrawOpen(true)} />
        ) : (
          <>
            {/* Referral wallet card — separate from seller earnings */}
            <ReferralWalletCard
              balance={balance}
              fallbackCurrency={profile?.currency ?? "EUR"}
              onWithdraw={() => setWithdrawOpen(true)}
            />

            <p className="mb-4 text-[13px] text-muted-foreground">
              {t("referral.intro", "Partage ton code. Pour chaque inscrit, tu gagnes la commission KiDi+ sur ses premières commandes.")}
            </p>



            {codes.map((c) => (
              <div key={c.id} className="mb-4 overflow-hidden rounded-3xl"
                style={{ background: `linear-gradient(135deg, ${NAVY}, #1C2440)` }}>
                <div className="p-5 text-white">
                  <div className="text-[11px] uppercase tracking-widest opacity-70">
                    {t("referral.myCode", "Mon code")}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[28px] font-black tracking-wide" style={{ color: GOLD }}>
                      {c.code}
                    </span>
                    {!c.active && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                        {t("referral.inactive", "Inactif")}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Press onClick={() => copy(c.code)}
                      className="!min-h-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-2 text-[13px] font-semibold text-white">
                      <Copy size={14} /> {t("common.copy", "Copier")}
                    </Press>
                    <Press onClick={() => share(c.code)}
                      className="!min-h-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2 text-[13px] font-bold"
                      style={{ background: GOLD, color: NAVY }}>
                      <Share2 size={14} /> {t("common.share", "Partager")}
                    </Press>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-px bg-white/5">
                  <Stat icon={<Users size={14} />} label={t("referral.signups", "Inscrits")} value={String(c.signups)} />
                  <Stat icon={<Package size={14} />} label={t("referral.ordersCredited", "Commandes")} value={String(c.orders_credited)} />
                  <Stat
                    icon={<Coins size={14} />}
                    label={t("referral.totals", "Gains")}
                    value={
                      Object.keys(c.totals).length === 0
                        ? "—"
                        : Object.entries(c.totals)
                            .map(([cur, amt]) => formatMoney(Number(amt), normalizeCurrency(cur), lang))
                            .join(" · ")
                    }
                  />
                </div>
              </div>
            ))}

            <h3 className="mb-2 mt-6 text-[15px] font-bold">{t("referral.recent", "Récents gains de parrainage")}</h3>
            {earnings.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("referral.noEarnings", "Aucun gain pour l'instant.")}</p>
            ) : (
              <div className="rounded-2xl border border-border">
                {earnings.map((e, i) => (
                  <div key={e.id}
                    className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">
                        {e.referred_name || e.referred_handle || "—"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {e.item_name || "—"} · {new Date(e.created_at).toLocaleDateString(lang)}
                      </div>
                    </div>
                    <div className={`shrink-0 text-[13px] font-bold ${e.status === "reversed" ? "text-muted-foreground line-through" : ""}`}>
                      +{formatMoney(e.amount, normalizeCurrency(e.currency), lang)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              {t("referral.walletHint", "Tes gains de parrainage sont retirables ici, indépendamment de tes gains vendeur.")}
            </p>
          </>
        )}
      </div>


      <WithdrawSheet
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        available={balance?.available ?? 0}
        currency={balance?.currency ?? profile?.currency ?? "EUR"}
        source="referral"
      />
    </PushScreen>
  );
}

function ReferralWalletCard({
  balance,
  fallbackCurrency,
  onWithdraw,
}: {
  balance: ReferralBalance | null;
  fallbackCurrency: string;
  onWithdraw?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cur = balance?.currency ?? fallbackCurrency;
  const available = balance?.available ?? 0;
  const canWithdraw = !!onWithdraw && available > 0;

  // Gold palette
  const GOLD_DEEP = "#8A6511";
  const GOLD_MID = "#C8992E";
  const GOLD_LIGHT = "#F5D273";
  const GOLD_HIGHLIGHT = "#FFF1B8";
  const INK = "#1A130A";

  return (
    <div className="mb-4">
      <div
        className="relative overflow-hidden rounded-[22px] p-5 shadow-2xl"
        style={{
          background: `
            radial-gradient(120% 90% at 15% 0%, ${GOLD_HIGHLIGHT} 0%, transparent 45%),
            radial-gradient(140% 100% at 100% 100%, ${GOLD_DEEP} 0%, transparent 55%),
            linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD_MID} 45%, ${GOLD_DEEP} 100%)
          `,
          color: INK,
          minHeight: 200,

          boxShadow:
            "0 20px 40px -20px rgba(138,101,17,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)",
        }}
      >
        {/* Subtle brushed-metal streaks */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            background:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px)",
          }}
        />
        {/* Soft glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -bottom-20 h-56 w-56 rounded-full"
          style={{ background: `radial-gradient(circle, ${GOLD_HIGHLIGHT}88, transparent 65%)` }}
        />

        <div className="relative flex h-full flex-col">
          {/* Top row: brand + chip */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: INK, opacity: 0.75 }}>
                {t("referral.wallet.tagline", "Qui dit plus ?")}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: INK, opacity: 0.6 }}>
                Gold · Partenaire
              </div>
            </div>
            <div
              className="grid h-9 w-12 shrink-0 place-items-center rounded-md"
              style={{
                background: `linear-gradient(135deg, #FFE7A8 0%, #C9971F 55%, #7A5A10 100%)`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.35)",
              }}
            >
              <Cpu size={16} style={{ color: "rgba(0,0,0,0.55)" }} />
            </div>
          </div>

          {/* Centered KiDi+ wordmark */}
          <div className="flex flex-1 items-center justify-center py-4">
            <div
              className="text-[38px] font-black leading-none tracking-tight"
              style={{
                color: INK,
                textShadow: "0 1px 0 rgba(255,255,255,0.35), 0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              KiDi<span style={{ color: "#3a0f0f" }}>+</span>
            </div>
          </div>

          {/* Bottom row: wallet label + balance + currency */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: INK, opacity: 0.7 }}>
                <WalletIcon size={10} />
                {t("referral.wallet.title", "Portefeuille parrainage")}
              </div>
              <div
                className="mt-1 truncate text-[22px] font-black tabular-nums leading-none"
                style={{ color: INK }}
              >
                {formatMoney(available, normalizeCurrency(cur), i18n.language)}
              </div>
            </div>
            <div
              className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-widest"
              style={{ background: "rgba(0,0,0,0.12)", color: INK }}
            >
              {normalizeCurrency(cur)}
            </div>
          </div>


        </div>
      </div>

      <Press
        onClick={onWithdraw ?? (() => {})}
        disabled={!canWithdraw}
        className="!min-h-11 mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[14px] font-bold disabled:opacity-50"
        style={{ background: GOLD, color: NAVY }}
      >
        <ArrowDownToLine size={15} />{" "}
        {available > 0
          ? t("referral.wallet.withdraw", "Retirer")
          : t("referral.wallet.withdrawEmpty", "Retirer (aucun gain)")}
      </Press>
    </div>
  );
}



function ClaimBlock({
  onClaimed,
  balance,
  fallbackCurrency,
  onWithdraw,
}: {
  onClaimed: () => void | Promise<void>;
  balance: ReferralBalance | null;
  fallbackCurrency: string;
  onWithdraw?: () => void;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const onChange = (v: string) => {
    // Accept typing without dash and re-format XXXX-XXXX
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setToken(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
  };

  const submit = async () => {
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(token)) {
      toast.error(t("referral.claim.badFormat", "Format attendu : XXXX-XXXX"));
      return;
    }
    setBusy(true);
    const res = await claimPromoCode(token);
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        invalid_token: t("referral.claim.errInvalid", "Code d'activation invalide."),
        already_claimed: t("referral.claim.errClaimed", "Ce code a déjà été réclamé."),
        unauthorized: t("referral.claim.errAuth", "Connecte-toi pour réclamer."),
      };
      toast.error(map[res.error] ?? res.error);
      return;
    }
    haptic.success();
    const totals = res.backfilled_totals ?? {};
    const totalStr = Object.entries(totals)
      .map(([cur, amt]) => formatMoney(Number(amt), normalizeCurrency(cur), lang))
      .join(" · ");
    toast.success(
      totalStr
        ? t("referral.claim.okWithBackfill", "Code {{code}} réclamé — {{amount}} crédités", { code: res.code, amount: totalStr })
        : t("referral.claim.ok", "Code {{code}} réclamé 🎉", { code: res.code })
    );
    await onClaimed();
  };

  return (
    <div>
      <ReferralWalletCard balance={balance} fallbackCurrency={fallbackCurrency} onWithdraw={onWithdraw} />

      <div className="mb-4 overflow-hidden rounded-3xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${NAVY}, #1C2440)` }}>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
          <Sparkles size={12} style={{ color: GOLD }} /> KiDi+ Partenaires
        </div>
        <h2 className="text-[20px] font-black leading-tight">
          {t("referral.claim.title", "Deviens partenaire KiDi+")}
        </h2>
        <p className="mt-2 text-[13px] opacity-80">
          {t("referral.claim.intro", "Reçois la commission KiDi+ sur les premières commandes de chaque personne qui s'inscrit avec ton code.")}
        </p>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
          <KeyRound size={12} /> {t("referral.claim.tokenLabel", "Code d'activation")}
        </label>
        <input
          value={token}
          onChange={(e) => onChange(e.target.value)}
          placeholder="XXXX-XXXX"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={9}
          className="mt-2 w-full rounded-xl border border-border bg-transparent px-3 py-3 text-center text-[20px] font-black tracking-[0.3em] outline-none"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("referral.claim.hint", "As-tu déjà reçu un code d'activation ? Entre-le ci-dessous. Sinon, tu peux demander un code de parrainage plus bas.")}
        </p>
        <Press
          disabled={busy}
          onClick={submit}
          className="!min-h-11 mt-4 inline-flex w-full items-center justify-center rounded-2xl py-3 text-[14px] font-bold disabled:opacity-50"
          style={{ background: GOLD, color: NAVY }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : t("referral.claim.cta", "Réclamer mon code")}
        </Press>
      </div>

      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>{t("common.or", "ou")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <RequestCodeBlock />

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        {t("referral.claim.notInfluencer", "Pas de code ? Fais une demande — l'équipe KiDi+ répond sous quelques jours.")}
      </p>
    </div>
  );
}

function RequestCodeBlock() {
  const { t } = useTranslation();
  const [req, setReq] = useState<MyPromoCodeRequest | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => setReq(await fetchMyPromoCodeRequest());
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    setBusy(true);
    const res = await submitPromoCodeRequest(message);
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        already_pending: t("referral.claim.request.errPending", "Tu as déjà une demande en attente."),
        already_has_code: t("referral.claim.request.errHasCode", "Tu as déjà un code de parrainage."),
        unauthorized: t("referral.claim.errAuth", "Connecte-toi pour réclamer."),
      };
      toast.error(map[res.error] ?? res.error);
      return;
    }
    haptic.success();
    toast.success(t("referral.claim.request.sent", "Demande envoyée ✨"));
    setMessage("");
    await load();
  };

  if (req === undefined) return null;

  const isPending = req?.status === "pending";
  const isRejected = req?.status === "rejected";

  return (
    <div className="rounded-2xl border border-border p-4">
      <label className="flex items-center gap-1.5 text-[13px] font-bold">
        <Sparkles size={13} style={{ color: GOLD }} />
        {t("referral.claim.request.title", "Demander un code de parrainage")}
      </label>

      {isPending ? (
        <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-[12px]">
          <div className="font-bold text-amber-700 dark:text-amber-400">
            ⏳ {t("referral.claim.request.pendingBadge", "Demande en attente")}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t("referral.claim.request.pendingHint", "Nous étudions ta demande. Tu recevras une notification dès qu'elle sera traitée.")}
          </p>
          {req?.message && (
            <p className="mt-2 whitespace-pre-wrap text-[11px] italic text-muted-foreground">"{req.message}"</p>
          )}
        </div>
      ) : (
        <>
          {isRejected && (
            <div className="mt-3 rounded-xl bg-red-500/10 p-3 text-[12px]">
              <div className="font-bold text-red-700 dark:text-red-400">
                ✕ {t("referral.claim.request.rejectedBadge", "Demande refusée")}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("referral.claim.request.rejectedHint", "Ta dernière demande a été refusée. Tu peux en soumettre une nouvelle.")}
              </p>
              {req?.admin_note && (
                <p className="mt-2 text-[11px]">
                  <span className="font-semibold">{t("referral.claim.request.reason", "Motif :")}</span>{" "}
                  <span className="text-muted-foreground">{req.admin_note}</span>
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-[12px] text-muted-foreground">
            {t("referral.claim.request.intro", "Explique en quelques mots pourquoi tu veux devenir partenaire (audience, réseaux, motivation…). L'équipe KiDi+ étudiera ta demande.")}
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder={t("referral.claim.request.placeholder", "Parle-nous de toi, ton audience, tes réseaux…")}
            rows={4}
            className="mt-2 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-[13px] outline-none"
          />
          <div className="mt-1 text-right text-[10px] text-muted-foreground">{message.length}/500</div>
          <Press
            disabled={busy}
            onClick={submit}
            className="!min-h-11 mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-foreground py-3 text-[14px] font-bold text-background disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : t("referral.claim.request.cta", "Envoyer ma demande")}
          </Press>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#141B34] p-3 text-white">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70">
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-bold">{value}</div>
    </div>
  );
}
