import { useEffect, useState } from "react";
import { Eye, EyeOff, Fingerprint, Loader2, ScanFace } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState<BiometricInfo>({ available: false, kind: null, label: "" });
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
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
        <h2 className="text-[26px] font-bold leading-tight">
          {t("auth.signIn.title")}
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          {t("auth.signIn.subtitle")}
        </p>

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
              {t("auth.signIn.submitting")}
            </span>
          ) : (
            t("auth.signIn.submit")
          )}
        </Press>

        {bio.available && bioEnabled && (
          <Press
            type="button"
            onClick={onBiometric}
            disabled={bioLoading || loading}
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
    </AuthScreenShell>
  );
}
