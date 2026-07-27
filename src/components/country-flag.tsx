import * as Flags from "country-flag-icons/react/3x2";
import { normalizeCountryCode } from "@/lib/delivery-zones-data";

const FALLBACKS: Record<string, string> = {
  // Some non-standard codes used by the app or older data.
  AN: "🇦🇶", // Antarctica fallback (no official flag)
};

export function CountryFlag({
  code,
  className,
  title,
}: {
  code: string | null | undefined;
  className?: string;
  title?: string;
}) {
  if (!code) return null;
  // Profiles may store "🇨🇮 Côte d'Ivoire" — resolve to ISO-2 before lookup.
  const upper = normalizeCountryCode(code);
  if (!upper) return null;
  const Flag = (Flags as Record<string, React.FC<{ className?: string; title?: string }>>)[upper];
  if (Flag) {
    return (
      <Flag
        className={className}
        title={title ?? upper}
        aria-hidden
      />
    );
  }
  return (
    <span className={className} aria-hidden>
      {FALLBACKS[upper] ?? ""}
    </span>
  );
}
