// Banner + sheet to confirm email with a KiDi+ branded 6-digit code.

import { useEffect, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { useAuth } from "@/lib/auth-context";
import {
  hoursLeftInEmailGrace,
  isEmailConfirmRestricted,
  shouldShowEmailConfirmBanner,
} from "@/lib/email-confirm";
import {
  sendEmailConfirmCode,
  verifyEmailConfirmCode,
} from "@/lib/email-confirm-client";
import { haptic } from "@/lib/haptics";

export function EmailConfirmBanner() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);

  if (!shouldShowEmailConfirmBanner(profile)) return null;

  const restricted = isEmailConfirmRestricted(profile);
  const hoursLeft = hoursLeftInEmailGrace(profile);

  return (
    <>
      <div
        className="shrink-0 border-b px-3 py-2"
        style={{
          background: restricted
            ? "linear-gradient(90deg, oklch(0.95 0.04 25), oklch(0.97 0.03 40))"
            : "linear-gradient(90deg, oklch(0.96 0.03 230), oklch(0.97 0.02 200))",
          borderColor: "oklch(0.9 0.02 240)",
        }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <Mail size={16} className="shrink-0 text-foreground/70" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-snug text-foreground">
              {restricted
                ? t(
                    "auth.emailConfirm.bannerRestricted",
                    "Confirme ton email pour vendre et retirer",
                  )
                : t(
                    "auth.emailConfirm.banner",
                    "Confirme ton adresse email",
                  )}
            </p>
            {!restricted && hoursLeft != null && hoursLeft > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {t("auth.emailConfirm.graceLeft", {
                  hours: hoursLeft,
                  defaultValue: "{{hours}} h restantes avant restriction",
                })}
              </p>
            ) : null}
          </div>
          <Press
            type="button"
            onClick={() => {
              haptic.selection();
              setOpen(true);
            }}
            className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
          >
            {t("auth.emailConfirm.cta", "Confirmer")}
          </Press>
        </div>
      </div>
      <EmailConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onVerified={async () => {
          await refreshProfile();
          setOpen(false);
        }}
      />
    </>
  );
}

/** Blocking dialog used when a restricted action is attempted. */
export function EmailConfirmRequiredDialog({
  open,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!open) setSheetOpen(false);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 px-4 pb-10 sm:items-center"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Mail size={18} />
            </div>
            <Press
              type="button"
              onClick={onClose}
              className="!min-h-8 h-8 w-8 rounded-full text-muted-foreground"
              aria-label={t("common.close", "Fermer")}
            >
              <X size={16} />
            </Press>
          </div>
          <h3 className="text-[17px] font-semibold">
            {t("auth.emailConfirm.gateTitle", "Confirme ton email")}
          </h3>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {t(
              "auth.emailConfirm.gateBody",
              "Pour vendre, lancer un live ou demander un retrait, confirme que cette adresse email t’appartient.",
            )}
          </p>
          <Press
            type="button"
            onClick={() => {
              haptic.selection();
              setSheetOpen(true);
            }}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-[15px] font-semibold text-background"
          >
            {t("auth.emailConfirm.cta", "Confirmer mon email")}
          </Press>
        </div>
      </div>
      <EmailConfirmSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onVerified={async () => {
          await refreshProfile();
          setSheetOpen(false);
          onClose();
          onConfirmed?.();
        }}
      />
    </>
  );
}

export function EmailConfirmSheet({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCode("");
      setError(null);
      return;
    }
    void (async () => {
      setSending(true);
      setError(null);
      try {
        await sendEmailConfirmCode();
        setCooldown(60);
        toast.success(
          t("auth.emailConfirm.codeSent", "Code envoyé — regarde ta boîte mail"),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : t("common.error", "Erreur"));
      } finally {
        setSending(false);
      }
    })();
  }, [open, t]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const verify = async () => {
    if (verifying) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError(t("auth.emailConfirm.codeInvalid", "Entre le code à 6 chiffres"));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyEmailConfirmCode(digits);
      haptic.success();
      toast.success(t("auth.emailConfirm.success", "Email confirmé ✓"));
      await onVerified();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : t("common.error", "Erreur"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("auth.emailConfirm.sheetTitle", "Confirmer mon email")}
      zIndex={120}
    >
      <div className="space-y-4 px-4 py-4">
        <p className="text-[14px] leading-snug text-muted-foreground">
          {t(
            "auth.emailConfirm.sheetBody",
            "On t’envoie un code KiDi+ (pas un mail générique). Entre-le ci-dessous.",
          )}
        </p>
        {profile?.email ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] font-medium">
            {profile.email}
          </p>
        ) : null}

        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("auth.emailConfirm.codeLabel", "Code à 6 chiffres")}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-center text-[22px] font-bold tracking-[0.35em] outline-none"
          />
        </label>

        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}

        <Press
          type="button"
          disabled={verifying || code.replace(/\D/g, "").length !== 6}
          onClick={() => {
            void verify();
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-semibold text-background disabled:opacity-50"
        >
          {verifying ? <Loader2 size={16} className="animate-spin" /> : null}
          {t("auth.emailConfirm.verify", "Valider le code")}
        </Press>

        <Press
          type="button"
          disabled={sending || cooldown > 0}
          onClick={() => {
            void (async () => {
              setSending(true);
              setError(null);
              try {
                await sendEmailConfirmCode();
                setCooldown(60);
                toast.success(
                  t("auth.emailConfirm.codeSent", "Code envoyé — regarde ta boîte mail"),
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : t("common.error", "Erreur"),
                );
              } finally {
                setSending(false);
              }
            })();
          }}
          className="flex h-11 w-full items-center justify-center rounded-2xl border border-border text-[14px] font-semibold disabled:opacity-50"
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : cooldown > 0 ? (
            t("auth.emailConfirm.resendWait", {
              seconds: cooldown,
              defaultValue: "Renvoyer dans {{seconds}}s",
            })
          ) : (
            t("auth.emailConfirm.resend", "Renvoyer le code")
          )}
        </Press>
      </div>
    </PushScreen>
  );
}

/** Hook: run action or open the confirm gate if email is past the 48h grace. */
export function useEmailConfirmGate() {
  const { profile } = useAuth();
  const [gateOpen, setGateOpen] = useState(false);

  const guard = (action: () => void) => {
    if (isEmailConfirmRestricted(profile)) {
      setGateOpen(true);
      return;
    }
    action();
  };

  const gate = (
    <EmailConfirmRequiredDialog
      open={gateOpen}
      onClose={() => setGateOpen(false)}
    />
  );

  return { guard, gate, isRestricted: isEmailConfirmRestricted(profile) };
}
