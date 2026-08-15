import { useLanguage } from "@/i18n/language-context";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

export function AuthLanguageToggle({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const { lang, setLang } = useLanguage();
  const dark = variant === "dark";

  const choose = (next: "fr" | "en") => {
    if (next === lang) return;
    haptic.selection();
    void setLang(next);
  };

  const btn = (code: "fr" | "en", label: string) => {
    const active = lang === code;
    return (
      <Press
        onClick={() => choose(code)}
        aria-pressed={active}
        aria-label={label}
        className={`!min-h-0 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
          active
            ? dark
              ? "bg-white text-[#10162B]"
              : "bg-foreground text-background"
            : dark
              ? "text-white/75"
              : "text-muted-foreground"
        }`}
      >
        {code.toUpperCase()}
      </Press>
    );
  };

  return (
    <div
      className={`inline-flex items-center rounded-full p-0.5 ${
        dark ? "bg-white/15" : "border border-border bg-card"
      }`}
      role="group"
      aria-label="Langue"
    >
      {btn("fr", "Français")}
      {btn("en", "English")}
    </div>
  );
}
