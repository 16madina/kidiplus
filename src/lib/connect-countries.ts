// Countries supported by Stripe Connect Express (cross-border payouts).
// Client-safe: imported by both the onboarding UI and the server route.

export type ConnectCountry = {
  code: string;
  fr: string;
  en: string;
};

export const CONNECT_COUNTRY_LIST: ConnectCountry[] = [
  { code: "CA", fr: "Canada", en: "Canada" },
  { code: "US", fr: "États-Unis", en: "United States" },
  { code: "FR", fr: "France", en: "France" },
  { code: "GB", fr: "Royaume-Uni", en: "United Kingdom" },
  { code: "DE", fr: "Allemagne", en: "Germany" },
  { code: "BE", fr: "Belgique", en: "Belgium" },
  { code: "CH", fr: "Suisse", en: "Switzerland" },
  { code: "ES", fr: "Espagne", en: "Spain" },
  { code: "IT", fr: "Italie", en: "Italy" },
  { code: "PT", fr: "Portugal", en: "Portugal" },
  { code: "NL", fr: "Pays-Bas", en: "Netherlands" },
  { code: "LU", fr: "Luxembourg", en: "Luxembourg" },
  { code: "IE", fr: "Irlande", en: "Ireland" },
  { code: "AT", fr: "Autriche", en: "Austria" },
  { code: "DK", fr: "Danemark", en: "Denmark" },
  { code: "SE", fr: "Suède", en: "Sweden" },
  { code: "NO", fr: "Norvège", en: "Norway" },
  { code: "FI", fr: "Finlande", en: "Finland" },
  { code: "PL", fr: "Pologne", en: "Poland" },
  { code: "CZ", fr: "Tchéquie", en: "Czechia" },
  { code: "SK", fr: "Slovaquie", en: "Slovakia" },
  { code: "SI", fr: "Slovénie", en: "Slovenia" },
  { code: "HU", fr: "Hongrie", en: "Hungary" },
  { code: "RO", fr: "Roumanie", en: "Romania" },
  { code: "BG", fr: "Bulgarie", en: "Bulgaria" },
  { code: "HR", fr: "Croatie", en: "Croatia" },
  { code: "GR", fr: "Grèce", en: "Greece" },
  { code: "CY", fr: "Chypre", en: "Cyprus" },
  { code: "MT", fr: "Malte", en: "Malta" },
  { code: "EE", fr: "Estonie", en: "Estonia" },
  { code: "LV", fr: "Lettonie", en: "Latvia" },
  { code: "LT", fr: "Lituanie", en: "Lithuania" },
  { code: "LI", fr: "Liechtenstein", en: "Liechtenstein" },
  { code: "GI", fr: "Gibraltar", en: "Gibraltar" },
  { code: "MX", fr: "Mexique", en: "Mexico" },
  { code: "BR", fr: "Brésil", en: "Brazil" },
  { code: "JP", fr: "Japon", en: "Japan" },
  { code: "AU", fr: "Australie", en: "Australia" },
  { code: "NZ", fr: "Nouvelle-Zélande", en: "New Zealand" },
  { code: "SG", fr: "Singapour", en: "Singapore" },
  { code: "HK", fr: "Hong Kong", en: "Hong Kong" },
  { code: "TH", fr: "Thaïlande", en: "Thailand" },
  { code: "MY", fr: "Malaisie", en: "Malaysia" },
  { code: "ID", fr: "Indonésie", en: "Indonesia" },
  { code: "PH", fr: "Philippines", en: "Philippines" },
  { code: "IN", fr: "Inde", en: "India" },
  { code: "KR", fr: "Corée du Sud", en: "South Korea" },
  { code: "AE", fr: "Émirats arabes unis", en: "United Arab Emirates" },
  { code: "ZA", fr: "Afrique du Sud", en: "South Africa" },
  { code: "NG", fr: "Nigéria", en: "Nigeria" },
  { code: "GH", fr: "Ghana", en: "Ghana" },
  { code: "KE", fr: "Kenya", en: "Kenya" },
];

export const CONNECT_COUNTRY_CODES = new Set(CONNECT_COUNTRY_LIST.map((c) => c.code));

export const DEFAULT_CONNECT_COUNTRY = "CA";

export function connectCountryName(code: string, lang: string): string {
  const entry = CONNECT_COUNTRY_LIST.find((c) => c.code === code.toUpperCase());
  if (!entry) return code.toUpperCase();
  return lang.startsWith("fr") ? entry.fr : entry.en;
}
