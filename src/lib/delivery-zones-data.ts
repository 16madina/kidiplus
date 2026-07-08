// Curated per-country delivery zone suggestions.
//
// Used by the seller delivery-zones editor as autocomplete hints. Sellers
// can still type any free-form zone name — this is guidance, not a whitelist.

export type CountryCode =
  | "CI" | "SN" | "ML" | "BF" | "BJ" | "TG" | "CM"
  | "FR" | "BE" | "CA" | "NE" | "GN" | "US";

export type CountryOption = {
  code: CountryCode;
  name: string;   // display name (fr)
  nameEn: string; // display name (en)
  flag: string;
};

export const COUNTRIES: CountryOption[] = [
  { code: "CI", name: "Côte d'Ivoire", nameEn: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "SN", name: "Sénégal",       nameEn: "Senegal",       flag: "🇸🇳" },
  { code: "ML", name: "Mali",          nameEn: "Mali",          flag: "🇲🇱" },
  { code: "BF", name: "Burkina Faso",  nameEn: "Burkina Faso",  flag: "🇧🇫" },
  { code: "BJ", name: "Bénin",         nameEn: "Benin",         flag: "🇧🇯" },
  { code: "TG", name: "Togo",          nameEn: "Togo",          flag: "🇹🇬" },
  { code: "NE", name: "Niger",         nameEn: "Niger",         flag: "🇳🇪" },
  { code: "GN", name: "Guinée",        nameEn: "Guinea",        flag: "🇬🇳" },
  { code: "CM", name: "Cameroun",      nameEn: "Cameroon",      flag: "🇨🇲" },
  { code: "FR", name: "France",        nameEn: "France",        flag: "🇫🇷" },
  { code: "BE", name: "Belgique",      nameEn: "Belgium",       flag: "🇧🇪" },
  { code: "CA", name: "Canada",        nameEn: "Canada",        flag: "🇨🇦" },
  { code: "US", name: "États-Unis",    nameEn: "United States", flag: "🇺🇸" },
];

export function countryLabel(code: string | null | undefined, locale?: string): string {
  if (!code) return "";
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase());
  if (!c) return code;
  const en = (locale ?? "").toLowerCase().startsWith("en");
  return `${c.flag} ${en ? c.nameEn : c.name}`;
}

export function countryFlag(code: string | null | undefined): string {
  if (!code) return "";
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase());
  return c?.flag ?? "";
}

/** Curated zone suggestions per country. */
export const ZONE_SUGGESTIONS: Record<CountryCode, string[]> = {
  CI: [
    // Abidjan communes
    "Cocody", "Yopougon", "Plateau", "Marcory", "Treichville",
    "Abobo", "Adjamé", "Koumassi", "Port-Bouët", "Attécoubé",
    "Songon", "Bingerville", "Anyama",
    // Major cities
    "Bouaké", "Yamoussoukro", "San-Pédro", "Daloa", "Korhogo",
    "Man", "Gagnoa", "Abengourou", "Divo", "Soubré",
    "Grand-Bassam", "Dabou", "Agboville",
    "Intérieur du pays",
  ],
  SN: [
    "Dakar", "Pikine", "Guédiawaye", "Rufisque", "Parcelles Assainies",
    "Thiès", "Touba", "Mbour", "Saint-Louis", "Kaolack",
    "Ziguinchor", "Diourbel", "Louga", "Tambacounda",
    "Sénégal entier",
  ],
  ML: [
    "Bamako", "Kati", "Sikasso", "Ségou", "Koutiala",
    "Mopti", "Kayes", "Gao", "Tombouctou",
    "Mali entier",
  ],
  BF: [
    "Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya",
    "Banfora", "Kaya", "Tenkodogo",
    "Burkina entier",
  ],
  BJ: [
    "Cotonou", "Abomey-Calavi", "Porto-Novo", "Parakou",
    "Djougou", "Bohicon", "Natitingou",
    "Bénin entier",
  ],
  TG: [
    "Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé", "Dapaong",
    "Togo entier",
  ],
  NE: [
    "Niamey", "Zinder", "Maradi", "Tahoua", "Agadez",
    "Niger entier",
  ],
  GN: [
    "Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé",
    "Guinée entière",
  ],
  CM: [
    "Douala", "Yaoundé", "Bafoussam", "Bamenda", "Garoua",
    "Maroua", "Ngaoundéré", "Kribi", "Limbé", "Buea",
    "Cameroun entier",
  ],
  FR: [
    "Paris", "Île-de-France", "Lyon", "Marseille", "Toulouse",
    "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux",
    "Lille", "Rennes", "Reims", "Le Havre",
    "France entière",
  ],
  BE: [
    "Bruxelles", "Anvers", "Gand", "Charleroi", "Liège",
    "Bruges", "Namur", "Louvain", "Mons",
    "Belgique entière",
  ],
  CA: [
    "Montréal", "Laval", "Longueuil", "Québec", "Gatineau",
    "Ottawa-Gatineau", "Sherbrooke", "Trois-Rivières",
    "Toronto", "Mississauga", "Vancouver", "Calgary",
    "Canada entier",
  ],
  US: [
    "New York", "Los Angeles", "Chicago", "Houston", "Miami",
    "Washington DC", "Boston", "Atlanta",
    "USA entire",
  ],
};

export function suggestionsFor(country: string | null | undefined): string[] {
  if (!country) return [];
  const key = country.toUpperCase() as CountryCode;
  return ZONE_SUGGESTIONS[key] ?? [];
}

/** Best-effort default country from currency (fallback when profile has none). */
export function defaultCountryFromCurrency(currency: string | null | undefined): CountryCode {
  const c = (currency ?? "").toUpperCase();
  if (c === "EUR") return "FR";
  if (c === "CAD") return "CA";
  return "CI"; // XOF default
}
