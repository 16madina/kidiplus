import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AuthFlow } from "@/components/auth/auth-flow";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
};

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;

    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;

    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center text-foreground">
      <p>Impossible de charger cette demande d'autorisation : {String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const router = Route.useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the user signs in through the app's own auth flow, reload the consent details.
  useEffect(() => {
    if (details) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void router.invalidate();
    });
    return () => data.subscription.unsubscribe();
  }, [details, router]);

  if (!details) return <AuthFlow allowGuest={false} />;

  const clientName = details.client?.name ?? "cette application";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Aucune redirection renvoyée par le serveur d'autorisation.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
        <h1 className="text-xl font-semibold">Connecter {clientName} à votre compte KiDi+</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {clientName} pourra lire vos informations KiDi+ (profil, lives, commandes, boutique, soldes) en votre nom.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(true)}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Autoriser
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(false)}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            Refuser
          </button>
        </div>
      </div>
    </main>
  );
}
