// Per-country postal code formats — validation + keyboard + placeholder.
//
// Canada (A1A 1A1), UK (SW1A 1AA) and the Netherlands (1012 AB) contain
// letters: the postal field must never force a numeric keyboard or reject
// letters. Countries without a known spec accept anything.

export type PostalSpec = {
  regex: RegExp;
  placeholder: string;
  inputMode: "numeric" | "text";
  /** Normalize to uppercase on save (letter-based formats). */
  uppercase?: boolean;
};

const SPECS: Record<string, PostalSpec> = {
  CA: {
    regex: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    placeholder: "H2X 1Y4",
    inputMode: "text",
    uppercase: true,
  },
  US: { regex: /^\d{5}(-\d{4})?$/, placeholder: "10001", inputMode: "numeric" },
  FR: { regex: /^\d{5}$/, placeholder: "75011", inputMode: "numeric" },
  GB: {
    regex: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
    placeholder: "SW1A 1AA",
    inputMode: "text",
    uppercase: true,
  },
  NL: {
    regex: /^\d{4}\s?[A-Za-z]{2}$/,
    placeholder: "1012 AB",
    inputMode: "text",
    uppercase: true,
  },
  BE: { regex: /^\d{4}$/, placeholder: "1000", inputMode: "numeric" },
  CH: { regex: /^\d{4}$/, placeholder: "1200", inputMode: "numeric" },
  DE: { regex: /^\d{5}$/, placeholder: "10115", inputMode: "numeric" },
  ES: { regex: /^\d{5}$/, placeholder: "28001", inputMode: "numeric" },
  IT: { regex: /^\d{5}$/, placeholder: "00100", inputMode: "numeric" },
  PT: { regex: /^\d{4}-\d{3}$/, placeholder: "1000-100", inputMode: "numeric" },
  LU: { regex: /^\d{4}$/, placeholder: "1111", inputMode: "numeric" },
  MA: { regex: /^\d{5}$/, placeholder: "20000", inputMode: "numeric" },
  DZ: { regex: /^\d{5}$/, placeholder: "16000", inputMode: "numeric" },
  TN: { regex: /^\d{4}$/, placeholder: "1000", inputMode: "numeric" },
  SN: { regex: /^\d{5}$/, placeholder: "10000", inputMode: "numeric" },
  BR: { regex: /^\d{5}-?\d{3}$/, placeholder: "01310-100", inputMode: "numeric" },
  JP: { regex: /^\d{3}-?\d{4}$/, placeholder: "100-0001", inputMode: "numeric" },
  AU: { regex: /^\d{4}$/, placeholder: "2000", inputMode: "numeric" },
};

export function postalSpecFor(country: string | null | undefined): PostalSpec | null {
  if (!country) return null;
  return SPECS[country.trim().toUpperCase()] ?? null;
}

/** True when the value matches the country format (or no format is known). */
export function isValidPostalCode(country: string | null | undefined, value: string): boolean {
  const spec = postalSpecFor(country);
  if (!spec) return true;
  return spec.regex.test(value.trim());
}

/** Trim + uppercase letter-based codes (ca: "h2x 1y4" → "H2X 1Y4"). */
export function formatPostalCode(country: string | null | undefined, value: string): string {
  const spec = postalSpecFor(country);
  const trimmed = value.trim();
  return spec?.uppercase ? trimmed.toUpperCase() : trimmed;
}
