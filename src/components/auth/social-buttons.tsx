// Google + Apple social login buttons — styled to Google/Apple brand
// guidelines. Reused across sign-in, sign-up and the guest auth sheet.
//
// The Apple button is gated behind SHOW_APPLE_LOGIN so we can ship the
// UI now and only surface Apple once the provider is fully configured
// in Lovable Cloud (see src/lib/social-login-config.ts).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { signInWithProvider, type OAuthProvider } from "@/lib/oauth";
import { SHOW_APPLE_LOGIN } from "@/lib/social-login-config";
import { haptic } from "@/lib/haptics";

function GoogleGlyph({ size = 20 }: { size?: number }) {
  // Official multi-color "G" glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

function AppleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.83 2.31-4.19 2.41-4.26-1.31-1.92-3.36-2.19-4.09-2.22-1.74-.18-3.4 1.03-4.28 1.03-.88 0-2.24-1-3.69-.98-1.9.03-3.66 1.11-4.63 2.81-1.97 3.42-.5 8.48 1.42 11.27.94 1.36 2.05 2.89 3.5 2.83 1.41-.06 1.94-.91 3.64-.91 1.7 0 2.18.91 3.66.88 1.51-.03 2.47-1.38 3.4-2.75 1.07-1.58 1.51-3.11 1.54-3.19-.03-.02-2.95-1.13-2.98-4.51zM14.36 3.74c.78-.94 1.3-2.25 1.16-3.55-1.12.05-2.47.75-3.27 1.69-.72.83-1.35 2.16-1.18 3.44 1.25.1 2.51-.63 3.29-1.58z"/>
    </svg>
  );
}

export function SocialLoginButtons({ mode = "signin" }: { mode?: "signin" | "signup" } = {}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const onClick = async (provider: OAuthProvider) => {
    if (busy) return;
    setBusy(provider);
    try {
      await signInWithProvider(provider);
      // On web, the browser navigates away; on native we return here after
      // the system browser opens. Session hydration happens in auth-context.
      haptic.selection();
    } catch (err) {
      haptic.error();
      const msg = err instanceof Error ? err.message : String(err);
      // Provider not configured yet in Supabase → friendly toast.
      if (/provider is not enabled|unsupported provider/i.test(msg)) {
        toast.error(t("auth.social.notConfigured"));
      } else {
        toast.error(t("auth.social.failed"));
      }
      setBusy(null);
    }
  };

  const labelKey = mode === "signup" ? "auth.social.signUpWith" : "auth.social.continueWith";

  return (
    <div className="flex w-full flex-col gap-2">
      <Press
        type="button"
        onClick={() => onClick("google")}
        disabled={busy !== null}
        aria-label={t(labelKey, { provider: "Google" })}
        className="!min-h-12 h-12 w-full rounded-2xl border border-[#DADCE0] bg-white text-[15px] font-semibold text-[#1F1F1F]"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
      >
        <span className="inline-flex w-full items-center justify-center gap-3">
          {busy === "google" ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <GoogleGlyph size={20} />
          )}
          <span>{t(labelKey, { provider: "Google" })}</span>
        </span>
      </Press>

      {SHOW_APPLE_LOGIN && (
        <Press
          type="button"
          onClick={() => onClick("apple")}
          disabled={busy !== null}
          aria-label={t(labelKey, { provider: "Apple" })}
          className="!min-h-12 h-12 w-full rounded-2xl bg-black text-[15px] font-semibold text-white"
        >
          <span className="inline-flex w-full items-center justify-center gap-2">
            {busy === "apple" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <AppleGlyph size={18} />
            )}
            <span>{t(labelKey, { provider: "Apple" })}</span>
          </span>
        </Press>
      )}
    </div>
  );
}

export function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="my-3 flex w-full items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("common.or")}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
