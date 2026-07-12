// OAuth sign-in helper — handles the "web browser" vs "native WebView" split
// so Google doesn't block us with `disallowed_useragent` inside the Capacitor
// WebView.
//
// Web  : classic `supabase.auth.signInWithOAuth` redirect. The auth listener
//        picks up the session on return.
// Native: `skipBrowserRedirect: true` to get the provider URL, then open it
//        in the SYSTEM browser via @capacitor/browser. The provider redirects
//        to our custom scheme (kidiplus://auth-callback), the deep-link
//        listener in `native.ts` catches it and completes the exchange via
//        `/auth-callback`.

import { supabase } from "@/integrations/supabase/client";
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

    // Open system browser (Safari View Controller / Chrome Custom Tabs).
    // Google explicitly refuses embedded WebViews since 2016
    // ("disallowed_useragent"), so this is required, not just polish.
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: data.url,
      windowName: "_self",
      presentationStyle: "popover",
    });
    return;
  }

  // Web: standard redirect. Same-origin so `redirectTo` is always safe.
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) throw error;
}
