import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "@/components/auth/auth-shell";
import { AuthProvider, useAuth, frenchAuthError } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Réinitialiser ton mot de passe — KiDi+" },
      {
        name: "description",
        content:
          "Choisis un nouveau mot de passe pour ton compte KiDi+ après avoir reçu le lien de récupération par email.",
      },
      { property: "og:title", content: "Réinitialiser ton mot de passe — KiDi+" },
      {
        property: "og:description",
        content: "Définis un nouveau mot de passe sécurisé pour ton compte KiDi+.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kidiplus.com/reset-password" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/reset-password" }],
  }),
});

function ResetPasswordPage() {
  return (
    <AuthProvider>
      <div
        className="mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-background"
        style={{ isolation: "isolate" }}
      >
        <ResetPasswordInner />
      </div>
    </AuthProvider>
  );
}

function ResetPasswordInner() {
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [linkValid, setLinkValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery link puts tokens in the URL hash; Supabase parses them
  // automatically. Wait until an actual session exists before allowing update.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkValid(!!data.session);
      setReady(true);
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setLinkValid(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      haptic.success();
      setDone(true);
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }

  return (
    <AuthScreenShell
      title="Nouveau mot de passe"
      onBack={() => {
        window.location.href = "/";
      }}
    >
      {done ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[oklch(0.95_0.1_150)]">
            <CheckCircle2 size={30} color="oklch(0.55 0.2 150)" />
          </div>
          <h2 className="text-[22px] font-bold">Mot de passe mis à jour</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Tu peux maintenant utiliser ton nouveau mot de passe.
          </p>
          <Press
            onClick={() => {
              window.location.href = "/";
            }}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            Continuer
          </Press>
        </div>
      ) : linkValid === false ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <h2 className="text-[22px] font-bold">Lien invalide ou expiré</h2>
          <p className="mt-2 max-w-xs text-[14px] text-muted-foreground">
            Redemande un email de réinitialisation depuis l'écran de connexion.
          </p>
          <Press
            onClick={() => {
              window.location.href = "/";
            }}
            className="!min-h-12 mt-8 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            }}
          >
            Retour
          </Press>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          <h2 className="text-[24px] font-bold leading-tight">
            Choisis un nouveau mot de passe
          </h2>
          <p className="mb-3 text-[14px] text-muted-foreground">
            Au moins 8 caractères. Utilise un mélange lettres / chiffres.
          </p>
          <div className="relative">
            <AuthInput
              label="Nouveau mot de passe"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full text-muted-foreground"
              aria-label={show ? "Masquer" : "Afficher"}
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
                <Loader2 size={16} className="animate-spin" /> Mise à jour…
              </span>
            ) : (
              "Mettre à jour"
            )}
          </Press>
        </form>
      )}
    </AuthScreenShell>
  );
}
