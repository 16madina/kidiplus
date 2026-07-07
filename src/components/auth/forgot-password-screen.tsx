import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("auth.validation.emailInvalid"));
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      haptic.success();
      setSent(true);
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title={t("auth.forgot.title")} onBack={onBack}>
      {sent ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div
            className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.9 0.05 15), oklch(0.85 0.08 25))",
            }}
          >
            <Mail size={28} color="oklch(0.5 0.24 20)" />
          </div>
          <h2 className="text-[22px] font-bold">{t("auth.forgot.sent")}</h2>
          <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
            <b>{email}</b>
          </p>
          <Press
            onClick={onBack}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            {t("auth.forgot.backToSignIn")}
          </Press>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          <h2 className="text-[24px] font-bold leading-tight">
            {t("auth.forgot.title")}
          </h2>
          <p className="mb-3 text-[14px] text-muted-foreground">
            {t("auth.forgot.subtitle")}
          </p>
          <AuthInput
            label={t("auth.forgot.email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
          />
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
                {t("auth.forgot.submitting")}
              </span>
            ) : (
              t("auth.forgot.submit")
            )}
          </Press>
        </form>
      )}
    </AuthScreenShell>
  );
}
