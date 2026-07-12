// OAuth return route. Reached in two scenarios:
//
//  1. Web: Supabase's implicit/PKCE flow redirects to `window.location.origin`
//     first — the browser client's `detectSessionInUrl` auto-consumes the
//     hash/query, we just have to be a valid destination. If the user lands
//     here directly for any reason we hydrate the session (either from a
//     `?code=` PKCE param via exchangeCodeForSession, or from the hash which
//     the client already parsed) and bounce home.
//
//  2. Native: the deep-link listener registered in `native.ts` routes the
//     custom-scheme URL (kidiplus://auth-callback?code=…) here after closing
//     the system browser. `exchangeCodeForSession(code)` finishes the flow.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDesc =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (errorDesc) {
          setError(errorDesc);
          return;
        }

        if (code) {
          const { error: exchangeErr } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            setError(exchangeErr.message);
            return;
          }
        }

        // The client's onAuthStateChange in auth-context will pick up the
        // session. Give it a tick, then continue into the app.
        setTimeout(() => {
          if (!cancelled) void navigate({ to: "/", replace: true });
        }, 50);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-foreground">
            Connexion impossible
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => void navigate({ to: "/", replace: true })}
          >
            Retour
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Connexion en cours…</p>
      )}
    </div>
  );
}
