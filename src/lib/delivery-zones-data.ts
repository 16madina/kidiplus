// Curated per-country delivery zone suggestions + full world country list.
//
// Used by the seller delivery-zones editor as autocomplete hints. Sellers
// can still type any free-form zone name — this is guidance, not a whitelist.

export type Continent = "AF" | "EU" | "AS" | "NA" | "SA" | "OC" | "AN";

export type CountryOption = {
  code: string;      // ISO 3166-1 alpha-2
  name: string;      // display name (fr)
  nameEn: string;    // display name (en)
  flag: string;
  continent: Continent;
};

// Continent labels
export const CONTINENT_LABEL: Record<Continent, { fr: string; en: string }> = {
  AF: { fr: "Afrique",        en: "Africa" },
  EU: { fr: "Europe",         en: "Europe" },
  AS: { fr: "Asie",           en: "Asia" },
  NA: { fr: "Amérique du Nord", en: "North America" },
  SA: { fr: "Amérique du Sud",  en: "South America" },
  OC: { fr: "Océanie",        en: "Oceania" },
  AN: { fr: "Antarctique",    en: "Antarctica" },
};

export const COUNTRIES: CountryOption[] = [
  // ===== Africa =====
  { code: "DZ", name: "Algérie",             nameEn: "Algeria",              flag: "🇩🇿", continent: "AF" },
  { code: "AO", name: "Angola",              nameEn: "Angola",               flag: "🇦🇴", continent: "AF" },
  { code: "BJ", name: "Bénin",               nameEn: "Benin",                flag: "🇧🇯", continent: "AF" },
  { code: "BW", name: "Botswana",            nameEn: "Botswana",             flag: "🇧🇼", continent: "AF" },
  { code: "BF", name: "Burkina Faso",        nameEn: "Burkina Faso",         flag: "🇧🇫", continent: "AF" },
  { code: "BI", name: "Burundi",             nameEn: "Burundi",              flag: "🇧🇮", continent: "AF" },
  { code: "CV", name: "Cap-Vert",            nameEn: "Cape Verde",           flag: "🇨🇻", continent: "AF" },
  { code: "CM", name: "Cameroun",            nameEn: "Cameroon",             flag: "🇨🇲", continent: "AF" },
  { code: "CF", name: "Centrafrique",        nameEn: "Central African Rep.", flag: "🇨🇫", continent: "AF" },
  { code: "TD", name: "Tchad",               nameEn: "Chad",                 flag: "🇹🇩", continent: "AF" },
  { code: "KM", name: "Comores",             nameEn: "Comoros",              flag: "🇰🇲", continent: "AF" },
  { code: "CG", name: "Congo",               nameEn: "Congo",                flag: "🇨🇬", continent: "AF" },
  { code: "CD", name: "RD Congo",            nameEn: "DR Congo",             flag: "🇨🇩", continent: "AF" },
  { code: "CI", name: "Côte d'Ivoire",       nameEn: "Côte d'Ivoire",        flag: "🇨🇮", continent: "AF" },
  { code: "DJ", name: "Djibouti",            nameEn: "Djibouti",             flag: "🇩🇯", continent: "AF" },
  { code: "EG", name: "Égypte",              nameEn: "Egypt",                flag: "🇪🇬", continent: "AF" },
  { code: "GQ", name: "Guinée équatoriale",  nameEn: "Equatorial Guinea",    flag: "🇬🇶", continent: "AF" },
  { code: "ER", name: "Érythrée",            nameEn: "Eritrea",              flag: "🇪🇷", continent: "AF" },
  { code: "SZ", name: "Eswatini",            nameEn: "Eswatini",             flag: "🇸🇿", continent: "AF" },
  { code: "ET", name: "Éthiopie",            nameEn: "Ethiopia",             flag: "🇪🇹", continent: "AF" },
  { code: "GA", name: "Gabon",               nameEn: "Gabon",                flag: "🇬🇦", continent: "AF" },
  { code: "GM", name: "Gambie",              nameEn: "Gambia",               flag: "🇬🇲", continent: "AF" },
  { code: "GH", name: "Ghana",               nameEn: "Ghana",                flag: "🇬🇭", continent: "AF" },
  { code: "GN", name: "Guinée",              nameEn: "Guinea",               flag: "🇬🇳", continent: "AF" },
  { code: "GW", name: "Guinée-Bissau",       nameEn: "Guinea-Bissau",        flag: "🇬🇼", continent: "AF" },
  { code: "KE", name: "Kenya",               nameEn: "Kenya",                flag: "🇰🇪", continent: "AF" },
  { code: "LS", name: "Lesotho",             nameEn: "Lesotho",              flag: "🇱🇸", continent: "AF" },
  { code: "LR", name: "Libéria",             nameEn: "Liberia",              flag: "🇱🇷", continent: "AF" },
  { code: "LY", name: "Libye",               nameEn: "Libya",                flag: "🇱🇾", continent: "AF" },
  { code: "MG", name: "Madagascar",          nameEn: "Madagascar",           flag: "🇲🇬", continent: "AF" },
  { code: "MW", name: "Malawi",              nameEn: "Malawi",               flag: "🇲🇼", continent: "AF" },
  { code: "ML", name: "Mali",                nameEn: "Mali",                 flag: "🇲🇱", continent: "AF" },
  { code: "MR", name: "Mauritanie",          nameEn: "Mauritania",           flag: "🇲🇷", continent: "AF" },
  { code: "MU", name: "Maurice",             nameEn: "Mauritius",            flag: "🇲🇺", continent: "AF" },
  { code: "MA", name: "Maroc",               nameEn: "Morocco",              flag: "🇲🇦", continent: "AF" },
  { code: "MZ", name: "Mozambique",          nameEn: "Mozambique",           flag: "🇲🇿", continent: "AF" },
  { code: "NA", name: "Namibie",             nameEn: "Namibia",              flag: "🇳🇦", continent: "AF" },
  { code: "NE", name: "Niger",               nameEn: "Niger",                flag: "🇳🇪", continent: "AF" },
  { code: "NG", name: "Nigéria",             nameEn: "Nigeria",              flag: "🇳🇬", continent: "AF" },
  { code: "RW", name: "Rwanda",              nameEn: "Rwanda",               flag: "🇷🇼", continent: "AF" },
  { code: "ST", name: "Sao Tomé-et-Principe", nameEn: "São Tomé & Príncipe", flag: "🇸🇹", continent: "AF" },
  { code: "SN", name: "Sénégal",             nameEn: "Senegal",              flag: "🇸🇳", continent: "AF" },
  { code: "SC", name: "Seychelles",          nameEn: "Seychelles",           flag: "🇸🇨", continent: "AF" },
  { code: "SL", name: "Sierra Leone",        nameEn: "Sierra Leone",         flag: "🇸🇱", continent: "AF" },
  { code: "SO", name: "Somalie",             nameEn: "Somalia",              flag: "🇸🇴", continent: "AF" },
  { code: "ZA", name: "Afrique du Sud",      nameEn: "South Africa",         flag: "🇿🇦", continent: "AF" },
  { code: "SS", name: "Soudan du Sud",       nameEn: "South Sudan",          flag: "🇸🇸", continent: "AF" },
  { code: "SD", name: "Soudan",              nameEn: "Sudan",                flag: "🇸🇩", continent: "AF" },
  { code: "TZ", name: "Tanzanie",            nameEn: "Tanzania",             flag: "🇹🇿", continent: "AF" },
  { code: "TG", name: "Togo",                nameEn: "Togo",                 flag: "🇹🇬", continent: "AF" },
  { code: "TN", name: "Tunisie",             nameEn: "Tunisia",              flag: "🇹🇳", continent: "AF" },
  { code: "UG", name: "Ouganda",             nameEn: "Uganda",               flag: "🇺🇬", continent: "AF" },
  { code: "ZM", name: "Zambie",              nameEn: "Zambia",               flag: "🇿🇲", continent: "AF" },
  { code: "ZW", name: "Zimbabwe",            nameEn: "Zimbabwe",             flag: "🇿🇼", continent: "AF" },

  // ===== Europe =====
  { code: "AL", name: "Albanie",             nameEn: "Albania",              flag: "🇦🇱", continent: "EU" },
  { code: "AD", name: "Andorre",             nameEn: "Andorra",              flag: "🇦🇩", continent: "EU" },
  { code: "AT", name: "Autriche",            nameEn: "Austria",              flag: "🇦🇹", continent: "EU" },
  { code: "BY", name: "Biélorussie",         nameEn: "Belarus",              flag: "🇧🇾", continent: "EU" },
  { code: "BE", name: "Belgique",            nameEn: "Belgium",              flag: "🇧🇪", continent: "EU" },
  { code: "BA", name: "Bosnie-Herzégovine",  nameEn: "Bosnia & Herzegovina", flag: "🇧🇦", continent: "EU" },
  { code: "BG", name: "Bulgarie",            nameEn: "Bulgaria",             flag: "🇧🇬", continent: "EU" },
  { code: "HR", name: "Croatie",             nameEn: "Croatia",              flag: "🇭🇷", continent: "EU" },
  { code: "CY", name: "Chypre",              nameEn: "Cyprus",               flag: "🇨🇾", continent: "EU" },
  { code: "CZ", name: "Tchéquie",            nameEn: "Czechia",              flag: "🇨🇿", continent: "EU" },
  { code: "DK", name: "Danemark",            nameEn: "Denmark",              flag: "🇩🇰", continent: "EU" },
  { code: "EE", name: "Estonie",             nameEn: "Estonia",              flag: "🇪🇪", continent: "EU" },
  { code: "FI", name: "Finlande",            nameEn: "Finland",              flag: "🇫🇮", continent: "EU" },
  { code: "FR", name: "France",              nameEn: "France",               flag: "🇫🇷", continent: "EU" },
  { code: "DE", name: "Allemagne",           nameEn: "Germany",              flag: "🇩🇪", continent: "EU" },
  { code: "GR", name: "Grèce",               nameEn: "Greece",               flag: "🇬🇷", continent: "EU" },
  { code: "HU", name: "Hongrie",             nameEn: "Hungary",              flag: "🇭🇺", continent: "EU" },
  { code: "IS", name: "Islande",             nameEn: "Iceland",              flag: "🇮🇸", continent: "EU" },
  { code: "IE", name: "Irlande",             nameEn: "Ireland",              flag: "🇮🇪", continent: "EU" },
  { code: "IT", name: "Italie",              nameEn: "Italy",                flag: "🇮🇹", continent: "EU" },
  { code: "XK", name: "Kosovo",              nameEn: "Kosovo",               flag: "🇽🇰", continent: "EU" },
  { code: "LV", name: "Lettonie",            nameEn: "Latvia",               flag: "🇱🇻", continent: "EU" },
  { code: "LI", name: "Liechtenstein",       nameEn: "Liechtenstein",        flag: "🇱🇮", continent: "EU" },
  { code: "LT", name: "Lituanie",            nameEn: "Lithuania",            flag: "🇱🇹", continent: "EU" },
  { code: "LU", name: "Luxembourg",          nameEn: "Luxembourg",           flag: "🇱🇺", continent: "EU" },
  { code: "MT", name: "Malte",               nameEn: "Malta",                flag: "🇲🇹", continent: "EU" },
  { code: "MD", name: "Moldavie",            nameEn: "Moldova",              flag: "🇲🇩", continent: "EU" },
  { code: "MC", name: "Monaco",              nameEn: "Monaco",               flag: "🇲🇨", continent: "EU" },
  { code: "ME", name: "Monténégro",          nameEn: "Montenegro",           flag: "🇲🇪", continent: "EU" },
  { code: "NL", name: "Pays-Bas",            nameEn: "Netherlands",          flag: "🇳🇱", continent: "EU" },
  { code: "MK", name: "Macédoine du Nord",   nameEn: "North Macedonia",      flag: "🇲🇰", continent: "EU" },
  { code: "NO", name: "Norvège",             nameEn: "Norway",               flag: "🇳🇴", continent: "EU" },
  { code: "PL", name: "Pologne",             nameEn: "Poland",               flag: "🇵🇱", continent: "EU" },
  { code: "PT", name: "Portugal",            nameEn: "Portugal",             flag: "🇵🇹", continent: "EU" },
  { code: "RO", name: "Roumanie",            nameEn: "Romania",              flag: "🇷🇴", continent: "EU" },
  { code: "RU", name: "Russie",              nameEn: "Russia",               flag: "🇷🇺", continent: "EU" },
  { code: "SM", name: "Saint-Marin",         nameEn: "San Marino",           flag: "🇸🇲", continent: "EU" },
  { code: "RS", name: "Serbie",              nameEn: "Serbia",               flag: "🇷🇸", continent: "EU" },
  { code: "SK", name: "Slovaquie",           nameEn: "Slovakia",             flag: "🇸🇰", continent: "EU" },
  { code: "SI", name: "Slovénie",            nameEn: "Slovenia",             flag: "🇸🇮", continent: "EU" },
  { code: "ES", name: "Espagne",             nameEn: "Spain",                flag: "🇪🇸", continent: "EU" },
  { code: "SE", name: "Suède",               nameEn: "Sweden",               flag: "🇸🇪", continent: "EU" },
  { code: "CH", name: "Suisse",              nameEn: "Switzerland",          flag: "🇨🇭", continent: "EU" },
  { code: "UA", name: "Ukraine",             nameEn: "Ukraine",              flag: "🇺🇦", continent: "EU" },
  { code: "GB", name: "Royaume-Uni",         nameEn: "United Kingdom",       flag: "🇬🇧", continent: "EU" },
  { code: "VA", name: "Vatican",             nameEn: "Vatican City",         flag: "🇻🇦", continent: "EU" },

  // ===== Asia =====
  { code: "AF", name: "Afghanistan",         nameEn: "Afghanistan",          flag: "🇦🇫", continent: "AS" },
  { code: "AM", name: "Arménie",             nameEn: "Armenia",              flag: "🇦🇲", continent: "AS" },
  { code: "AZ", name: "Azerbaïdjan",         nameEn: "Azerbaijan",           flag: "🇦🇿", continent: "AS" },
  { code: "BH", name: "Bahreïn",             nameEn: "Bahrain",              flag: "🇧🇭", continent: "AS" },
  { code: "BD", name: "Bangladesh",          nameEn: "Bangladesh",           flag: "🇧🇩", continent: "AS" },
  { code: "BT", name: "Bhoutan",             nameEn: "Bhutan",               flag: "🇧🇹", continent: "AS" },
  { code: "BN", name: "Brunei",              nameEn: "Brunei",               flag: "🇧🇳", continent: "AS" },
  { code: "KH", name: "Cambodge",            nameEn: "Cambodia",             flag: "🇰🇭", continent: "AS" },
  { code: "CN", name: "Chine",               nameEn: "China",                flag: "🇨🇳", continent: "AS" },
  { code: "GE", name: "Géorgie",             nameEn: "Georgia",              flag: "🇬🇪", continent: "AS" },
  { code: "IN", name: "Inde",                nameEn: "India",                flag: "🇮🇳", continent: "AS" },
  { code: "ID", name: "Indonésie",           nameEn: "Indonesia",            flag: "🇮🇩", continent: "AS" },
  { code: "IR", name: "Iran",                nameEn: "Iran",                 flag: "🇮🇷", continent: "AS" },
  { code: "IQ", name: "Irak",                nameEn: "Iraq",                 flag: "🇮🇶", continent: "AS" },
  { code: "IL", name: "Israël",              nameEn: "Israel",               flag: "🇮🇱", continent: "AS" },
  { code: "JP", name: "Japon",               nameEn: "Japan",                flag: "🇯🇵", continent: "AS" },
  { code: "JO", name: "Jordanie",            nameEn: "Jordan",               flag: "🇯🇴", continent: "AS" },
  { code: "KZ", name: "Kazakhstan",          nameEn: "Kazakhstan",           flag: "🇰🇿", continent: "AS" },
  { code: "KW", name: "Koweït",              nameEn: "Kuwait",               flag: "🇰🇼", continent: "AS" },
  { code: "KG", name: "Kirghizistan",        nameEn: "Kyrgyzstan",           flag: "🇰🇬", continent: "AS" },
  { code: "LA", name: "Laos",                nameEn: "Laos",                 flag: "🇱🇦", continent: "AS" },
  { code: "LB", name: "Liban",               nameEn: "Lebanon",              flag: "🇱🇧", continent: "AS" },
  { code: "MY", name: "Malaisie",            nameEn: "Malaysia",             flag: "🇲🇾", continent: "AS" },
  { code: "MV", name: "Maldives",            nameEn: "Maldives",             flag: "🇲🇻", continent: "AS" },
  { code: "MN", name: "Mongolie",            nameEn: "Mongolia",             flag: "🇲🇳", continent: "AS" },
  { code: "MM", name: "Birmanie",            nameEn: "Myanmar",              flag: "🇲🇲", continent: "AS" },
  { code: "NP", name: "Népal",               nameEn: "Nepal",                flag: "🇳🇵", continent: "AS" },
  { code: "KP", name: "Corée du Nord",       nameEn: "North Korea",          flag: "🇰🇵", continent: "AS" },
  { code: "OM", name: "Oman",                nameEn: "Oman",                 flag: "🇴🇲", continent: "AS" },
  { code: "PK", name: "Pakistan",            nameEn: "Pakistan",             flag: "🇵🇰", continent: "AS" },
  { code: "PS", name: "Palestine",           nameEn: "Palestine",            flag: "🇵🇸", continent: "AS" },
  { code: "PH", name: "Philippines",         nameEn: "Philippines",          flag: "🇵🇭", continent: "AS" },
  { code: "QA", name: "Qatar",               nameEn: "Qatar",                flag: "🇶🇦", continent: "AS" },
  { code: "SA", name: "Arabie saoudite",     nameEn: "Saudi Arabia",         flag: "🇸🇦", continent: "AS" },
  { code: "SG", name: "Singapour",           nameEn: "Singapore",            flag: "🇸🇬", continent: "AS" },
  { code: "KR", name: "Corée du Sud",        nameEn: "South Korea",          flag: "🇰🇷", continent: "AS" },
  { code: "LK", name: "Sri Lanka",           nameEn: "Sri Lanka",            flag: "🇱🇰", continent: "AS" },
  { code: "SY", name: "Syrie",               nameEn: "Syria",                flag: "🇸🇾", continent: "AS" },
  { code: "TW", name: "Taïwan",              nameEn: "Taiwan",               flag: "🇹🇼", continent: "AS" },
  { code: "TJ", name: "Tadjikistan",         nameEn: "Tajikistan",           flag: "🇹🇯", continent: "AS" },
  { code: "TH", name: "Thaïlande",           nameEn: "Thailand",             flag: "🇹🇭", continent: "AS" },
  { code: "TL", name: "Timor oriental",      nameEn: "Timor-Leste",          flag: "🇹🇱", continent: "AS" },
  { code: "TR", name: "Turquie",             nameEn: "Turkey",               flag: "🇹🇷", continent: "AS" },
  { code: "TM", name: "Turkménistan",        nameEn: "Turkmenistan",         flag: "🇹🇲", continent: "AS" },
  { code: "AE", name: "Émirats arabes unis", nameEn: "United Arab Emirates", flag: "🇦🇪", continent: "AS" },
  { code: "UZ", name: "Ouzbékistan",         nameEn: "Uzbekistan",           flag: "🇺🇿", continent: "AS" },
  { code: "VN", name: "Vietnam",             nameEn: "Vietnam",              flag: "🇻🇳", continent: "AS" },
  { code: "YE", name: "Yémen",               nameEn: "Yemen",                flag: "🇾🇪", continent: "AS" },

  // ===== North America =====
  { code: "AG", name: "Antigua-et-Barbuda",  nameEn: "Antigua & Barbuda",    flag: "🇦🇬", continent: "NA" },
  { code: "BS", name: "Bahamas",             nameEn: "Bahamas",              flag: "🇧🇸", continent: "NA" },
  { code: "BB", name: "Barbade",             nameEn: "Barbados",             flag: "🇧🇧", continent: "NA" },
  { code: "BZ", name: "Belize",              nameEn: "Belize",               flag: "🇧🇿", continent: "NA" },
  { code: "CA", name: "Canada",              nameEn: "Canada",               flag: "🇨🇦", continent: "NA" },
  { code: "CR", name: "Costa Rica",          nameEn: "Costa Rica",           flag: "🇨🇷", continent: "NA" },
  { code: "CU", name: "Cuba",                nameEn: "Cuba",                 flag: "🇨🇺", continent: "NA" },
  { code: "DM", name: "Dominique",           nameEn: "Dominica",             flag: "🇩🇲", continent: "NA" },
  { code: "DO", name: "Rép. dominicaine",    nameEn: "Dominican Republic",   flag: "🇩🇴", continent: "NA" },
  { code: "SV", name: "Salvador",            nameEn: "El Salvador",          flag: "🇸🇻", continent: "NA" },
  { code: "GD", name: "Grenade",             nameEn: "Grenada",              flag: "🇬🇩", continent: "NA" },
  { code: "GT", name: "Guatemala",           nameEn: "Guatemala",            flag: "🇬🇹", continent: "NA" },
  { code: "HT", name: "Haïti",               nameEn: "Haiti",                flag: "🇭🇹", continent: "NA" },
  { code: "HN", name: "Honduras",            nameEn: "Honduras",             flag: "🇭🇳", continent: "NA" },
  { code: "JM", name: "Jamaïque",            nameEn: "Jamaica",              flag: "🇯🇲", continent: "NA" },
  { code: "MX", name: "Mexique",             nameEn: "Mexico",               flag: "🇲🇽", continent: "NA" },
  { code: "NI", name: "Nicaragua",           nameEn: "Nicaragua",            flag: "🇳🇮", continent: "NA" },
  { code: "PA", name: "Panama",              nameEn: "Panama",               flag: "🇵🇦", continent: "NA" },
  { code: "KN", name: "Saint-Kitts-et-Nevis", nameEn: "St. Kitts & Nevis",   flag: "🇰🇳", continent: "NA" },
  { code: "LC", name: "Sainte-Lucie",        nameEn: "St. Lucia",            flag: "🇱🇨", continent: "NA" },
  { code: "VC", name: "Saint-Vincent",       nameEn: "St. Vincent",          flag: "🇻🇨", continent: "NA" },
  { code: "TT", name: "Trinité-et-Tobago",   nameEn: "Trinidad & Tobago",    flag: "🇹🇹", continent: "NA" },
  { code: "US", name: "États-Unis",          nameEn: "United States",        flag: "🇺🇸", continent: "NA" },

  // ===== South America =====
  { code: "AR", name: "Argentine",           nameEn: "Argentina",            flag: "🇦🇷", continent: "SA" },
  { code: "BO", name: "Bolivie",             nameEn: "Bolivia",              flag: "🇧🇴", continent: "SA" },
  { code: "BR", name: "Brésil",              nameEn: "Brazil",               flag: "🇧🇷", continent: "SA" },
  { code: "CL", name: "Chili",               nameEn: "Chile",                flag: "🇨🇱", continent: "SA" },
  { code: "CO", name: "Colombie",            nameEn: "Colombia",             flag: "🇨🇴", continent: "SA" },
  { code: "EC", name: "Équateur",            nameEn: "Ecuador",              flag: "🇪🇨", continent: "SA" },
  { code: "GY", name: "Guyana",              nameEn: "Guyana",               flag: "🇬🇾", continent: "SA" },
  { code: "PY", name: "Paraguay",            nameEn: "Paraguay",             flag: "🇵🇾", continent: "SA" },
  { code: "PE", name: "Pérou",               nameEn: "Peru",                 flag: "🇵🇪", continent: "SA" },
  { code: "SR", name: "Suriname",            nameEn: "Suriname",             flag: "🇸🇷", continent: "SA" },
  { code: "UY", name: "Uruguay",             nameEn: "Uruguay",              flag: "🇺🇾", continent: "SA" },
  { code: "VE", name: "Venezuela",           nameEn: "Venezuela",            flag: "🇻🇪", continent: "SA" },

  // ===== Oceania =====
  { code: "AU", name: "Australie",           nameEn: "Australia",            flag: "🇦🇺", continent: "OC" },
  { code: "FJ", name: "Fidji",               nameEn: "Fiji",                 flag: "🇫🇯", continent: "OC" },
  { code: "KI", name: "Kiribati",            nameEn: "Kiribati",             flag: "🇰🇮", continent: "OC" },
  { code: "MH", name: "Îles Marshall",       nameEn: "Marshall Islands",     flag: "🇲🇭", continent: "OC" },
  { code: "FM", name: "Micronésie",          nameEn: "Micronesia",           flag: "🇫🇲", continent: "OC" },
  { code: "NR", name: "Nauru",               nameEn: "Nauru",                flag: "🇳🇷", continent: "OC" },
  { code: "NZ", name: "Nouvelle-Zélande",    nameEn: "New Zealand",          flag: "🇳🇿", continent: "OC" },
  { code: "PW", name: "Palaos",              nameEn: "Palau",                flag: "🇵🇼", continent: "OC" },
  { code: "PG", name: "Papouasie-N.-Guinée", nameEn: "Papua New Guinea",     flag: "🇵🇬", continent: "OC" },
  { code: "WS", name: "Samoa",               nameEn: "Samoa",                flag: "🇼🇸", continent: "OC" },
  { code: "SB", name: "Îles Salomon",        nameEn: "Solomon Islands",      flag: "🇸🇧", continent: "OC" },
  { code: "TO", name: "Tonga",               nameEn: "Tonga",                flag: "🇹🇴", continent: "OC" },
  { code: "TV", name: "Tuvalu",              nameEn: "Tuvalu",               flag: "🇹🇻", continent: "OC" },
  { code: "VU", name: "Vanuatu",             nameEn: "Vanuatu",              flag: "🇻🇺", continent: "OC" },
];

const COUNTRY_BY_CODE: Map<string, CountryOption> = new Map(
  COUNTRIES.map((c) => [c.code, c]),
);

export function countryLabel(code: string | null | undefined, locale?: string): string {
  if (!code) return "";
  const c = COUNTRY_BY_CODE.get(code.toUpperCase());
  if (!c) return code;
  const en = (locale ?? "").toLowerCase().startsWith("en");
  return `${c.flag} ${en ? c.nameEn : c.name}`;
}

export function countryFlag(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_BY_CODE.get(code.toUpperCase())?.flag ?? "";
}

export function continentOfCountry(code: string | null | undefined): Continent | null {
  if (!code) return null;
  return COUNTRY_BY_CODE.get(code.toUpperCase())?.continent ?? null;
}

/** Returns countries grouped by continent, with the user's continent first. */
export function countriesByContinent(
  userCountry: string | null | undefined,
): { continent: Continent; countries: CountryOption[] }[] {
  const userCont = continentOfCountry(userCountry);
  const order: Continent[] = ["AF", "EU", "AS", "NA", "SA", "OC"];
  const sorted = userCont
    ? [userCont, ...order.filter((c) => c !== userCont)]
    : order;
  return sorted.map((cont) => ({
    continent: cont,
    countries: COUNTRIES.filter((c) => c.continent === cont),
  }));
}

function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Search countries by name (localized), ISO code or continent; keeps user's continent first. */
export function searchCountries(
  query: string,
  userCountry: string | null | undefined,
): { continent: Continent; countries: CountryOption[] }[] {
  const q = normalizeSearch(query.trim());
  const all = countriesByContinent(userCountry);
  if (!q) return all;
  return all
    .map(({ continent, countries }) => ({
      continent,
      countries: countries.filter((c) => {
        const haystack = [
          normalizeSearch(c.name),
          normalizeSearch(c.nameEn),
          c.code.toLowerCase(),
          normalizeSearch(CONTINENT_LABEL[continent].fr),
          normalizeSearch(CONTINENT_LABEL[continent].en),
        ];
        return haystack.some((h) => h.includes(q));
      }),
    }))
    .filter(({ countries }) => countries.length > 0);
}


/** Curated zone suggestions per country. */
export const ZONE_SUGGESTIONS: Record<string, string[]> = {
  CI: [
    "Cocody", "Yopougon", "Plateau", "Marcory", "Treichville",
    "Abobo", "Adjamé", "Koumassi", "Port-Bouët", "Attécoubé",
    "Songon", "Bingerville", "Anyama",
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
  ML: ["Bamako", "Kati", "Sikasso", "Ségou", "Koutiala", "Mopti", "Kayes", "Gao", "Tombouctou", "Mali entier"],
  BF: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora", "Kaya", "Tenkodogo", "Burkina entier"],
  BJ: ["Cotonou", "Abomey-Calavi", "Porto-Novo", "Parakou", "Djougou", "Bohicon", "Natitingou", "Bénin entier"],
  TG: ["Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé", "Dapaong", "Togo entier"],
  NE: ["Niamey", "Zinder", "Maradi", "Tahoua", "Agadez", "Niger entier"],
  GN: ["Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé", "Guinée entière"],
  CM: ["Douala", "Yaoundé", "Bafoussam", "Bamenda", "Garoua", "Maroua", "Ngaoundéré", "Kribi", "Limbé", "Buea", "Cameroun entier"],
  FR: [
    "Paris", "Île-de-France", "Lyon", "Marseille", "Toulouse",
    "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux",
    "Lille", "Rennes", "Reims", "Le Havre",
    "France entière",
  ],
  BE: ["Bruxelles", "Anvers", "Gand", "Charleroi", "Liège", "Bruges", "Namur", "Louvain", "Mons", "Belgique entière"],
  CA: [
    "Montréal", "Laval", "Longueuil", "Québec", "Gatineau",
    "Ottawa-Gatineau", "Sherbrooke", "Trois-Rivières",
    "Toronto", "Mississauga", "Vancouver", "Calgary",
    "Canada entier",
  ],
  US: ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "Washington DC", "Boston", "Atlanta", "USA entire"],
};

export function suggestionsFor(country: string | null | undefined): string[] {
  if (!country) return [];
  return ZONE_SUGGESTIONS[country.toUpperCase()] ?? [];
}

/** Best-effort default country from currency (fallback when profile has none). */
export function defaultCountryFromCurrency(currency: string | null | undefined): string {
  const c = (currency ?? "").toUpperCase();
  if (c === "EUR") return "FR";
  if (c === "CAD") return "CA";
  if (c === "USD") return "US";
  return "CI"; // XOF default
}
