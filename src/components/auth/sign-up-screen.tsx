import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Mail, Check, X as XIcon } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { LegalScreen } from "@/components/legal/legal-screen";
import { TERMS_VERSION } from "@/lib/legal-content";
import { validatePromoCode, applyPromoCode } from "@/lib/referrals-db";

export function SignUpScreen({
  onBack,
  onGoSignIn,
}: {
  onBack: () => void;
  onGoSignIn: () => void;
}) {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [openLegal, setOpenLegal] = useState<null | "terms" | "privacy">(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoValid, setPromoValid] = useState<null | boolean>(null);

  useEffect(() => {
    const c = promoCode.trim();
    if (!c) { setPromoValid(null); return; }
    let alive = true;
    const id = setTimeout(async () => {
      const ok = await validatePromoCode(c);
      if (alive) setPromoValid(ok);
    }, 350);
    return () => { alive = false; clearTimeout(id); };
  }, [promoCode]);

  const validate = () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      return t("auth.validation.nameRequired");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return t("auth.validation.emailInvalid");
    }
    if (password.length < 8) {
      return t("auth.errors.passwordWeak");
    }
    if (!acceptTerms || !confirmAge) {
      return t("consent.required");
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      haptic.success();
      // Best-effort: persist acceptance timestamps on the profile.
      const now = new Date().toISOString();
      void (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await (supabase as any).from("profiles").update({
            terms_accepted_at: now,
            terms_version: TERMS_VERSION,
            age_confirmed_at: now,
          }).eq("id", user.id);
        } catch { /* ignore */ }
      })();
      // Apply promo code if provided and valid (best-effort, non-blocking).
      if (promoCode.trim() && promoValid) {
        void applyPromoCode(promoCode).catch(() => { /* ignore */ });
      }
      if (needsEmailConfirmation) {
        setNeedsConfirm(email.trim());
      }
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (needsConfirm) {
    return (
      <AuthScreenShell title="" onBack={onBack}>
        <div className="flex h-full flex-col items-center justify-center px-2 text-center">
          <div
            className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.9 0.05 15), oklch(0.85 0.08 25))",
            }}
          >
            <Mail size={28} color="oklch(0.5 0.24 20)" />
          </div>
          <h2 className="text-[24px] font-bold">{t("auth.signUp.checkEmail")} 📩</h2>
          <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
            {t("auth.signUp.checkEmailBody")}
            <br />
            <span className="font-semibold text-foreground">{needsConfirm}</span>
          </p>
          <Press
            onClick={onGoSignIn}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            {t("auth.welcome.signIn")}
          </Press>
        </div>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell title={t("auth.welcome.signUp")} onBack={onBack}>
      <div className="mt-2 flex flex-col">
        <h2 className="text-[26px] font-bold leading-tight">
          {t("auth.signUp.title")}
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          {t("auth.signUp.subtitle")}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">


        <AuthInput
          label={t("auth.signUp.displayName")}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("auth.signUp.displayNamePlaceholder")}
          maxLength={40}
        />
        <AuthInput
          label={t("auth.signUp.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
        />

        <div className="relative">
          <AuthInput
            label={t("auth.signUp.password")}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.signUp.passwordHint")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full text-muted-foreground"
            aria-label={show ? t("common.close") : t("common.select")}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="relative">
          <AuthInput
            label={t("auth.signUp.promoCode", "Code promo (optionnel)")}
            type="text"
            autoCapitalize="characters"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            placeholder="KIDIPLUS"
            maxLength={20}
          />
          {promoCode.trim() && promoValid !== null && (
            <span
              className={`absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full ${
                promoValid ? "text-green-600" : "text-red-500"
              }`}
            >
              {promoValid ? <Check size={18} /> : <XIcon size={18} />}
            </span>
          )}
        </div>



        <label className="mt-2 flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          />
          <span>
            <Trans
              i18nKey="consent.checkbox"
              components={{
                t: <button type="button" onClick={() => setOpenLegal("terms")} className="font-bold underline underline-offset-2" />,
                p: <button type="button" onClick={() => setOpenLegal("privacy")} className="font-bold underline underline-offset-2" />,
              }}
            />
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
          <input
            type="checkbox"
            checked={confirmAge}
            onChange={(e) => setConfirmAge(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          />
          <span>{t("consent.ageCheckbox")}</span>
        </label>

        {error && (
          <div className="rounded-xl bg-[oklch(0.95_0.05_20)] px-3 py-2 text-[13px] font-medium text-[oklch(0.45_0.2_25)]">
            {error}
          </div>
        )}

        <Press
          type="submit"
          disabled={loading || !acceptTerms || !confirmAge}
          className="!min-h-12 mt-2 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: loading || !acceptTerms || !confirmAge ? 0.5 : 1,
          }}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />{" "}
              {t("auth.signUp.submitting")}
            </span>
          ) : (
            t("auth.signUp.submit")
          )}
        </Press>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          {t("auth.signUp.haveAccount")}{" "}
          <button
            type="button"
            onClick={onGoSignIn}
            className="font-bold text-foreground"
          >
            {t("auth.signUp.signIn")}
          </button>
        </p>
      </form>

      <LegalScreen open={openLegal === "terms"}   onClose={() => setOpenLegal(null)} kind="terms" />
      <LegalScreen open={openLegal === "privacy"} onClose={() => setOpenLegal(null)} kind="privacy" />
    </AuthScreenShell>
  );
}
