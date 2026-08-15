import { useEffect, useState } from "react";
import { Eye, EyeOff, Fingerprint, Loader2, ScanFace } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import {
  enableBiometric,
  getBiometricInfo,
  getSavedBiometricEmail,
  isBiometricEnabled,
  verifyAndGetCredentials,
  type BiometricInfo,
} from "@/lib/biometric";
import { toast } from "sonner";
import { LegalScreen } from "@/components/legal/legal-screen";

export function SignInScreen({
  onBack,
  onGoSignUp,
  onForgot,
}: {
  onBack: () => void;
  onGoSignUp: () => void;
  onForgot: () => void;
}) {
  const { t } = useTranslation();
  const { signIn, resendConfirmationEmail } = useAuth();
  const [resendBusy, setResendBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [openLegal, setOpenLegal] = useState<null | "terms" | "privacy">(null);
  const [bio, setBio] = useState<BiometricInfo>({
    available: false,
    kind: null,
    label: "",
    native: false,
  });
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    void (async () => {
      const info = await getBiometricInfo();
      setBio(info);
      setBioEnabled(isBiometricEnabled());
      const hint = getSavedBiometricEmail();
      if (hint) setEmail(hint);
    })();
  }, []);

  const askEnableBiometric = async (mail: string, pwd: string) => {
    if (!bio.available || bioEnabled) return;
    const ok = typeof window !== "undefined"
      && window.confirm(`Utiliser ${bio.label} pour vous connecter plus rapidement la prochaine fois ?`);
    if (!ok) return;
    try {
      await enableBiometric(mail, pwd);
      setBioEnabled(true);
      toast.success(`${bio.label} activé`);
    } catch {
      toast.error("Impossible d'activer la biométrie");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t("auth.validation.emailRequired"));
      return;
    }
    if (!acceptTerms) {
      setError(t("consent.required"));
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      haptic.success();
      await askEnableBiometric(email.trim(), password);
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onBiometric = async () => {
    setError(null);
    setBioLoading(true);
    try {
      const creds = await verifyAndGetCredentials(`Connectez-vous avec ${bio.label}`);
      await signIn(creds.email, creds.password);
      haptic.success();
    } catch (err) {
      haptic.error();
      const msg = err instanceof Error ? err.message : String(err);
      // User cancelled → silent. Otherwise surface.
      if (!/cancel|user/i.test(msg)) {
        setError(frenchAuthError(err));
      }
    } finally {
      setBioLoading(false);
    }
  };

  return (
    <AuthScreenShell title={t("auth.welcome.signIn")} onBack={onBack}>
      <div className="mt-2 flex flex-col">
        <h2 className="text-[26px] font-bold leading-tight">
          {t("auth.signIn.title")}
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          {t("auth.signIn.subtitle")}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">


        <AuthInput
          label={t("auth.signIn.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.signIn.emailPlaceholder")}
        />

        <div className="relative">
          <AuthInput
            label={t("auth.signIn.password")}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
            {error === t("auth.errors.emailNotConfirmed") && (
              <button
                type="button"
                disabled={resendBusy || !email.trim()}
                onClick={async () => {
                  setResendBusy(true);
                  try {
                    await resendConfirmationEmail(email.trim());
                    haptic.success();
                    toast.success(t("auth.signUp.resendSent"));
                  } catch (err) {
                    haptic.error();
                    setError(frenchAuthError(err));
                  } finally {
                    setResendBusy(false);
                  }
                }}
                className="mt-1 block font-semibold underline underline-offset-2 disabled:opacity-60"
              >
                {resendBusy ? t("auth.signUp.resendSending") : t("auth.signUp.resend")}
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgot}
            className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("auth.signIn.forgot")}
          </button>
        </div>

        <label className="mt-1 flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
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

        <Press
          type="submit"
          disabled={loading || !acceptTerms}
          className="!min-h-12 mt-2 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: loading || !acceptTerms ? 0.5 : 1,
          }}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />{" "}
              {t("auth.signIn.submitting")}
            </span>
          ) : (
            t("auth.signIn.submit")
          )}
        </Press>

        {bio.available && bioEnabled && (
          <Press
            type="button"
            onClick={() => {
              if (!acceptTerms) {
                setError(t("consent.required"));
                return;
              }
              void onBiometric();
            }}
            disabled={bioLoading || loading || !acceptTerms}
            className="!min-h-12 h-12 w-full rounded-2xl border-2 border-border bg-card text-[15px] font-bold text-foreground"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {bioLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : bio.kind === "faceId" || bio.kind === "face" ? (
                <ScanFace size={18} />
              ) : (
                <Fingerprint size={18} />
              )}
              Se connecter avec {bio.label}
            </span>
          </Press>
        )}

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          {t("auth.signIn.noAccount")}{" "}
          <button
            type="button"
            onClick={onGoSignUp}
            className="font-bold text-foreground"
          >
            {t("auth.signIn.createAccount")}
          </button>
        </p>
      </form>
      <LegalScreen open={openLegal === "terms"} onClose={() => setOpenLegal(null)} kind="terms" />
      <LegalScreen open={openLegal === "privacy"} onClose={() => setOpenLegal(null)} kind="privacy" />
    </AuthScreenShell>
  );
}
