import * as Flags from "country-flag-icons/react/3x2";

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
  const upper = code.toUpperCase();
  const Flag = (Flags as Record<string, React.FC<{ className?: string; title?: string }>>)[upper];
  if (Flag) {
    return <Flag className={className} title={title ?? upper} />;
  }
  return <span className={className}>{FALLBACKS[upper] ?? upper}</span>;
}
