// Street-address autocomplete backed by Photon (photon.komoot.io) —
// free OpenStreetMap geocoder, no API key, CORS-enabled, typeahead-friendly.
//
// Works best in well-mapped countries (CA, US, FR, BE, CH…). Failures and
// empty results degrade silently: the form stays a plain text input.

export type AddressSuggestion = {
  /** Human-readable one-line label for the dropdown. */
  label: string;
  street: string | null;
  houseNumber: string | null;
  city: string | null;
  postcode: string | null;
  region: string | null;
  countryCode: string | null;
};

type PhotonFeature = {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
    countrycode?: string;
    osm_key?: string;
  };
};

// Photon only localizes for a handful of languages.
function photonLang(lang: string | undefined): string {
  const l = (lang ?? "").slice(0, 2).toLowerCase();
  return l === "fr" || l === "de" || l === "en" ? l : "en";
}

export async function searchAddresses(
  query: string,
  opts: {
    /** ISO-2 country filter (results outside it are dropped). */
    country?: string | null;
    lang?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(opts.limit ?? 6, 1), 10) * 2),
    lang: photonLang(opts.lang),
  });

  let features: PhotonFeature[];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal: opts.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    features = json.features ?? [];
  } catch {
    return [];
  }

  const wantCountry = (opts.country ?? "").trim().toUpperCase();
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];

  for (const f of features) {
    const p = f.properties ?? {};
    const cc = (p.countrycode ?? "").toUpperCase();
    if (wantCountry && cc && cc !== wantCountry) continue;

    // Streets and house numbers only — skip POIs, regions, countries.
    const street = p.street ?? (p.osm_key === "highway" ? (p.name ?? null) : null);
    if (!street) continue;

    const city = p.city ?? p.town ?? p.village ?? null;
    const houseNumber = p.housenumber ?? null;
    const streetLine = [houseNumber, street].filter(Boolean).join(" ");
    const label = [streetLine, city, p.postcode].filter(Boolean).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);

    out.push({
      label,
      street,
      houseNumber,
      city,
      postcode: p.postcode ?? null,
      region: p.state ?? null,
      countryCode: cc || null,
    });
    if (out.length >= (opts.limit ?? 6)) break;
  }
  return out;
}
