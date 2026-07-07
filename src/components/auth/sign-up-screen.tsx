import { useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";

export function SignUpScreen({
  onBack,
  onGoSignIn,
}: {
  onBack: () => void;
  onGoSignIn: () => void;
}) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);

  const validate = () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      return "Ton nom doit contenir au moins 2 caractères.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Adresse email invalide.";
    }
    if (password.length < 8) {
      return "Le mot de passe doit contenir au moins 8 caractères.";
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
      if (needsEmailConfirmation) {
        setNeedsConfirm(email.trim());
      }
      // Otherwise AuthProvider will detect the session and swap to the app.
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
          <h2 className="text-[24px] font-bold">Vérifie tes emails 📩</h2>
          <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
            On vient d'envoyer un lien de confirmation à
            <br />
            <span className="font-semibold text-foreground">{needsConfirm}</span>
            <br />
            Clique dessus pour activer ton compte.
          </p>
          <Press
            onClick={onGoSignIn}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            J'ai confirmé, me connecter
          </Press>
        </div>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell title="Créer un compte" onBack={onBack}>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
        <h2 className="text-[26px] font-bold leading-tight">
          Bienvenue sur shoplive ✨
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          Crée ton compte en 30 secondes.
        </p>

        <AuthInput
          label="Nom affiché"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Ton prénom ou pseudo"
          maxLength={40}
        />
        <AuthInput
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
        />

        <div className="relative">
          <AuthInput
            label="Mot de passe"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Au moins 8 caractères"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full text-muted-foreground"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
              <Loader2 size={16} className="animate-spin" /> Création…
            </span>
          ) : (
            "Créer mon compte"
          )}
        </Press>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Déjà un compte ?{" "}
          <button
            type="button"
            onClick={onGoSignIn}
            className="font-bold text-foreground"
          >
            Se connecter
          </button>
        </p>
      </form>
    </AuthScreenShell>
  );
}
