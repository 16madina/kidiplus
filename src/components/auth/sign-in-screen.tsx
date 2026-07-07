import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";

export function SignInScreen({
  onBack,
  onGoSignUp,
  onForgot,
}: {
  onBack: () => void;
  onGoSignUp: () => void;
  onForgot: () => void;
}) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Renseigne ton email et ton mot de passe.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      haptic.success();
      // AuthProvider will swap the app to the tabs automatically.
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title="Connexion" onBack={onBack}>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
        <h2 className="text-[26px] font-bold leading-tight">Content de te revoir 👋</h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          Connecte-toi pour retrouver tes lives et tes vendeurs préférés.
        </p>

        <AuthInput
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
        />

        <div className="relative">
          <AuthInput
            label="Mot de passe"
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgot}
            className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Mot de passe oublié ?
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
              <Loader2 size={16} className="animate-spin" /> Connexion…
            </span>
          ) : (
            "Se connecter"
          )}
        </Press>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Pas encore de compte ?{" "}
          <button
            type="button"
            onClick={onGoSignUp}
            className="font-bold text-foreground"
          >
            Créer un compte
          </button>
        </p>

        <button type="button" onClick={() => toast("Bientôt disponible")} className="hidden" />
      </form>
    </AuthScreenShell>
  );
}
