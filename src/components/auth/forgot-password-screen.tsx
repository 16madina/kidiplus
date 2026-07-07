import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse email invalide.");
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
    <AuthScreenShell title="Mot de passe oublié" onBack={onBack}>
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
          <h2 className="text-[22px] font-bold">Email envoyé</h2>
          <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
            Si un compte existe pour <b>{email}</b>, tu vas recevoir un lien pour
            réinitialiser ton mot de passe.
          </p>
          <Press
            onClick={onBack}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            Retour à la connexion
          </Press>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          <h2 className="text-[24px] font-bold leading-tight">
            Réinitialise ton mot de passe
          </h2>
          <p className="mb-3 text-[14px] text-muted-foreground">
            Entre l'email associé à ton compte, on t'envoie un lien pour choisir
            un nouveau mot de passe.
          </p>
          <AuthInput
            label="Email"
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
                <Loader2 size={16} className="animate-spin" /> Envoi…
              </span>
            ) : (
              "Envoyer le lien"
            )}
          </Press>
        </form>
      )}
    </AuthScreenShell>
  );
}
