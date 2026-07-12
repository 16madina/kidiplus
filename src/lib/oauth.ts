// OAuth sign-in helper — handles the "web browser" vs "native WebView" split
// so Google doesn't block us with `disallowed_useragent` inside the Capacitor
// WebView.
//
// Web  : Lovable Cloud managed OAuth broker (`lovable.auth.signInWithOAuth`).
//        Iframe-safe in the editor preview, full-page redirect in production.
// Native: `skipBrowserRedirect: true` to get the provider URL, then open it
//        in the SYSTEM browser via @capacitor/browser. The provider redirects
//        to our custom scheme (kidiplus://auth-callback), the deep-link
//        listener in `native.ts` catches it and completes the exchange via
//        `/auth-callback`.

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { isNative } from "@/lib/native";
import { NATIVE_OAUTH_REDIRECT } from "@/lib/social-login-config";

export type OAuthProvider = "google" | "apple";

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  if (isNative()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned");

    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: data.url,
      windowName: "_self",
      presentationStyle: "popover",
    });
    return;
  }

  // Web: managed OAuth broker. `redirect_uri` must be a public same-origin URL.
  const redirectUri =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const result = await lovable.auth.signInWithOAuth(provider, {
    redirect_uri: redirectUri,
  });
  if (result.error) throw result.error;
  // If `result.redirected`, the browser is navigating away. Otherwise the
  // session is already set and the auth listener will pick it up.
}
