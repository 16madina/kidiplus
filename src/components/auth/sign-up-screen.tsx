import { useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { LegalScreen } from "@/components/legal/legal-screen";
import { TERMS_VERSION } from "@/lib/legal-content";

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
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
        <h2 className="text-[26px] font-bold leading-tight">
          {t("auth.signUp.title")} ✨
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          {t("auth.signUp.subtitle")}
        </p>

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

        {error && (
          <div className="rounded-xl bg-[oklch(0.95_0.05_20)] px-3 py-2 text-[13px] font-medium text-[oklch(0.45_0.2_25)]">
            {error}
          </div>
        )}

        <Press
          type="submit"
          disabled={loading}
          className="!min-h-12 mt-2 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: loading ? 0.7 : 1,
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
    </AuthScreenShell>
  );
}
