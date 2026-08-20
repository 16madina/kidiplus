import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Check, X as XIcon, ChevronDown } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Press } from "@/components/press";
import { AuthScreenShell, AuthInput } from "./auth-shell";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { LegalScreen } from "@/components/legal/legal-screen";
import { TERMS_VERSION } from "@/lib/legal-content";
import { validatePromoCode, applyPromoCode } from "@/lib/referrals-db";
import { CountryFlag } from "@/components/country-flag";

type CountryChoice = { code: string; name: string; value: string };
const COUNTRIES: CountryChoice[] = [
  { code: "FR", name: "France", value: "🇫🇷 France" },
  { code: "BE", name: "Belgique", value: "🇧🇪 Belgique" },
  { code: "CH", name: "Suisse", value: "🇨🇭 Suisse" },
  { code: "CA", name: "Canada", value: "🇨🇦 Canada" },
  { code: "CI", name: "Côte d'Ivoire", value: "🇨🇮 Côte d'Ivoire" },
  { code: "SN", name: "Sénégal", value: "🇸🇳 Sénégal" },
  { code: "MA", name: "Maroc", value: "🇲🇦 Maroc" },
  { code: "DZ", name: "Algérie", value: "🇩🇿 Algérie" },
  { code: "TN", name: "Tunisie", value: "🇹🇳 Tunisie" },
  { code: "CM", name: "Cameroun", value: "🇨🇲 Cameroun" },
  { code: "CD", name: "RD Congo", value: "🇨🇩 RD Congo" },
  { code: "GA", name: "Gabon", value: "🇬🇦 Gabon" },
  { code: "ML", name: "Mali", value: "🇲🇱 Mali" },
  { code: "BF", name: "Burkina Faso", value: "🇧🇫 Burkina Faso" },
  { code: "", name: "Autre", value: "🌍 Autre" },
];

export function SignUpScreen({
  onBack,
  onGoSignIn,
}: {
  onBack: () => void;
  onGoSignIn: () => void;
}) {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [openLegal, setOpenLegal] = useState<null | "terms" | "privacy">(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoValid, setPromoValid] = useState<null | boolean>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("kidi.referral_code")?.trim();
      if (stored) setPromoCode(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const c = promoCode.trim();
    if (!c) {
      setPromoValid(null);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      const ok = await validatePromoCode(c);
      if (alive) setPromoValid(ok);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [promoCode]);

  const validate = () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      return t("auth.validation.nameRequired");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return t("auth.validation.emailInvalid");
    }
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      return t("auth.validation.emailMismatch", "Les deux emails ne correspondent pas.");
    }
    if (!country.trim()) {
      return t("auth.validation.countryRequired", "Choisis ton pays.");
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 8) {
      return t("auth.validation.phoneRequired", "Entre un numéro de téléphone valide.");
    }
    if (password.length < 8) {
      return t("auth.errors.passwordWeak");
    }
    if (!acceptTerms || !confirmAge) {
      return t("consent.required");
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
        country: country.trim(),
        phone: phone.trim(),
      });
      haptic.success();
      const now = new Date().toISOString();
      void (async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;
          await (supabase as any).from("profiles").update({
            terms_accepted_at: now,
            terms_version: TERMS_VERSION,
            age_confirmed_at: now,
            country: country.trim(),
            phone: phone.trim(),
            // Soft confirm: leave email_verified_at null for new accounts.
            email_verified_at: null,
          }).eq("id", user.id);
        } catch {
          /* ignore */
        }
      })();
      if (promoCode.trim() && promoValid) {
        void applyPromoCode(promoCode).catch(() => {
          /* ignore */
        });
      }
      // Soft confirm: user continues in-app. If Supabase still requires
      // confirm-email, there is no session — surface a clear hint.
      if (needsEmailConfirmation) {
        setError(
          t(
            "auth.signUp.supabaseConfirmHint",
            "Compte créé, mais la session n’est pas ouverte. Désactive « Confirm email » dans Supabase Auth pour KiDi+ (on utilise notre propre confirmation).",
          ),
        );
      }
    } catch (err) {
      haptic.error();
      setError(frenchAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const selected = COUNTRIES.find((c) => c.value === country);

  return (
    <AuthScreenShell title={t("auth.welcome.signUp")} onBack={onBack}>
      <div className="mt-2 flex flex-col">
        <h2 className="text-[26px] font-bold leading-tight">
          {t("auth.signUp.title")}
        </h2>
        <p className="mb-3 text-[14px] text-muted-foreground">
          {t("auth.signUp.subtitle")}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 pb-6">
        <AuthInput
          label={t("auth.signUp.displayName")}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("auth.signUp.displayNamePlaceholder")}
          maxLength={40}
        />
        <AuthInput
          label={t("auth.signUp.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.com"
        />
        <AuthInput
          label={t("auth.signUp.emailConfirm", "Confirme ton email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={emailConfirm}
          onChange={(e) => setEmailConfirm(e.target.value)}
          placeholder="toi@exemple.com"
        />

        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
            {t("auth.signUp.country", "Pays")}
          </p>
          <Press
            type="button"
            onClick={() => setCountryOpen((o) => !o)}
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-background px-3 text-left text-[14px] font-medium"
          >
            <span className="inline-flex items-center gap-2 truncate">
              {selected?.code ? <CountryFlag code={selected.code} className="text-[18px]" /> : null}
              {country || t("auth.signUp.countryPlaceholder", "Choisir un pays")}
            </span>
            <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
          </Press>
          {countryOpen ? (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-2xl border border-border bg-background shadow-sm">
              {COUNTRIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] active:bg-muted"
                  onClick={() => {
                    setCountry(c.value);
                    setCountryOpen(false);
                  }}
                >
                  {c.code ? <CountryFlag code={c.code} className="text-[18px]" /> : <span>🌍</span>}
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <AuthInput
          label={t("auth.signUp.phone", "Téléphone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("auth.signUp.phonePlaceholder", "+225 07 00 00 00 00")}
        />

        <div className="relative">
          <AuthInput
            label={t("auth.signUp.password")}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.signUp.passwordHint")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full text-muted-foreground"
            aria-label={show ? t("common.close") : t("common.select")}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="relative">
          <AuthInput
            label={t("auth.signUp.promoCode", "Code promo (optionnel)")}
            type="text"
            autoCapitalize="characters"
            value={promoCode}
            onChange={(e) =>
              setPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
            }
            placeholder="KIDIPLUS"
            maxLength={20}
          />
          {promoCode.trim() && promoValid !== null && (
            <span
              className={`absolute right-3 top-[34px] grid h-10 w-10 place-items-center rounded-full ${
                promoValid ? "text-green-600" : "text-red-500"
              }`}
            >
              {promoValid ? <Check size={18} /> : <XIcon size={18} />}
            </span>
          )}
        </div>

        <label className="mt-2 flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          />
          <span>
            <Trans
              i18nKey="consent.checkbox"
              components={{
                t: (
                  <button
                    type="button"
                    onClick={() => setOpenLegal("terms")}
                    className="font-bold underline underline-offset-2"
                  />
                ),
                p: (
                  <button
                    type="button"
                    onClick={() => setOpenLegal("privacy")}
                    className="font-bold underline underline-offset-2"
                  />
                ),
              }}
            />
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
          <input
            type="checkbox"
            checked={confirmAge}
            onChange={(e) => setConfirmAge(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          />
          <span>{t("consent.ageCheckbox")}</span>
        </label>

        {error && (
          <div className="rounded-xl bg-[oklch(0.95_0.05_20)] px-3 py-2 text-[13px] font-medium text-[oklch(0.45_0.2_25)]">
            {error}
          </div>
        )}

        <Press
          type="submit"
          disabled={loading || !acceptTerms || !confirmAge}
          className="!min-h-12 mt-2 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: loading || !acceptTerms || !confirmAge ? 0.5 : 1,
          }}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />{" "}
              {t("auth.signUp.submitting")}
            </span>
          ) : (
            t("auth.signUp.submit")
          )}
        </Press>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          {t("auth.signUp.haveAccount")}{" "}
          <button
            type="button"
            onClick={onGoSignIn}
            className="font-bold text-foreground"
          >
            {t("auth.signUp.signIn")}
          </button>
        </p>
      </form>

      <LegalScreen open={openLegal === "terms"} onClose={() => setOpenLegal(null)} kind="terms" />
      <LegalScreen open={openLegal === "privacy"} onClose={() => setOpenLegal(null)} kind="privacy" />
    </AuthScreenShell>
  );
}
