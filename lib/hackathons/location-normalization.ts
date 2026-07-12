const COUNTRY_ALIASES: Record<string, string> = {
  ca: "Canada",
  can: "Canada",
  canada: "Canada",
  us: "United States",
  usa: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  "united states of america": "United States",
};

const CANADA_REGIONS: Record<string, string> = {
  ab: "Alberta",
  alberta: "Alberta",
  bc: "British Columbia",
  "british columbia": "British Columbia",
  mb: "Manitoba",
  manitoba: "Manitoba",
  nb: "New Brunswick",
  "new brunswick": "New Brunswick",
  nl: "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  ns: "Nova Scotia",
  "nova scotia": "Nova Scotia",
  nt: "Northwest Territories",
  "northwest territories": "Northwest Territories",
  nu: "Nunavut",
  nunavut: "Nunavut",
  on: "Ontario",
  ontario: "Ontario",
  pe: "Prince Edward Island",
  pei: "Prince Edward Island",
  "prince edward island": "Prince Edward Island",
  qc: "Quebec",
  quebec: "Quebec",
  québec: "Quebec",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  yt: "Yukon",
  yukon: "Yukon",
};

const US_REGIONS: Record<string, string> = {
  al: "Alabama",
  alabama: "Alabama",
  ak: "Alaska",
  alaska: "Alaska",
  az: "Arizona",
  arizona: "Arizona",
  ar: "Arkansas",
  arkansas: "Arkansas",
  ca: "California",
  california: "California",
  co: "Colorado",
  colorado: "Colorado",
  ct: "Connecticut",
  connecticut: "Connecticut",
  de: "Delaware",
  delaware: "Delaware",
  dc: "District of Columbia",
  "district of columbia": "District of Columbia",
  fl: "Florida",
  florida: "Florida",
  ga: "Georgia",
  georgia: "Georgia",
  hi: "Hawaii",
  hawaii: "Hawaii",
  id: "Idaho",
  idaho: "Idaho",
  il: "Illinois",
  illinois: "Illinois",
  in: "Indiana",
  indiana: "Indiana",
  ia: "Iowa",
  iowa: "Iowa",
  ks: "Kansas",
  kansas: "Kansas",
  ky: "Kentucky",
  kentucky: "Kentucky",
  la: "Louisiana",
  louisiana: "Louisiana",
  me: "Maine",
  maine: "Maine",
  md: "Maryland",
  maryland: "Maryland",
  ma: "Massachusetts",
  massachusetts: "Massachusetts",
  mi: "Michigan",
  michigan: "Michigan",
  mn: "Minnesota",
  minnesota: "Minnesota",
  ms: "Mississippi",
  mississippi: "Mississippi",
  mo: "Missouri",
  missouri: "Missouri",
  mt: "Montana",
  montana: "Montana",
  ne: "Nebraska",
  nebraska: "Nebraska",
  nv: "Nevada",
  nevada: "Nevada",
  nh: "New Hampshire",
  "new hampshire": "New Hampshire",
  nj: "New Jersey",
  "new jersey": "New Jersey",
  nm: "New Mexico",
  "new mexico": "New Mexico",
  ny: "New York",
  "new york": "New York",
  nc: "North Carolina",
  "north carolina": "North Carolina",
  nd: "North Dakota",
  "north dakota": "North Dakota",
  oh: "Ohio",
  ohio: "Ohio",
  ok: "Oklahoma",
  oklahoma: "Oklahoma",
  or: "Oregon",
  oregon: "Oregon",
  pa: "Pennsylvania",
  pennsylvania: "Pennsylvania",
  ri: "Rhode Island",
  "rhode island": "Rhode Island",
  sc: "South Carolina",
  "south carolina": "South Carolina",
  sd: "South Dakota",
  "south dakota": "South Dakota",
  tn: "Tennessee",
  tennessee: "Tennessee",
  tx: "Texas",
  texas: "Texas",
  ut: "Utah",
  utah: "Utah",
  vt: "Vermont",
  vermont: "Vermont",
  va: "Virginia",
  virginia: "Virginia",
  wa: "Washington",
  washington: "Washington",
  wv: "West Virginia",
  "west virginia": "West Virginia",
  wi: "Wisconsin",
  wisconsin: "Wisconsin",
  wy: "Wyoming",
  wyoming: "Wyoming",
};

function cleanKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function compactKey(value: string) {
  return cleanKey(value).replace(/[^a-z0-9]/g, "");
}

function normalizeLooseName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed || !/^[a-z\s.'-]+$/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) {
    return trimmed;
  }

  return trimmed
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

export function normalizeCountry(value: string): string;
export function normalizeCountry(value: undefined): undefined;
export function normalizeCountry(value: string | undefined): string | undefined;
export function normalizeCountry(value: string | undefined) {
  if (!value) {
    return value;
  }

  const key = cleanKey(value);
  const compactedKey = compactKey(value);

  return (
    COUNTRY_ALIASES[key] ??
    COUNTRY_ALIASES[compactedKey] ??
    (CANADA_REGIONS[key] || CANADA_REGIONS[compactedKey] ? "Canada" : undefined) ??
    (US_REGIONS[key] || US_REGIONS[compactedKey] ? "United States" : undefined) ??
    normalizeLooseName(value)
  );
}

function normalizeRegion(value: string, country: string | undefined): string;
function normalizeRegion(value: undefined, country: string | undefined): undefined;
function normalizeRegion(value: string | undefined, country: string | undefined): string | undefined;
function normalizeRegion(value: string | undefined, country: string | undefined) {
  if (!value) {
    return value;
  }

  const normalizedCountry = country ? normalizeCountry(country) : undefined;
  const key = cleanKey(value);
  const compactedKey = compactKey(value);

  if (normalizedCountry === "Canada") {
    return CANADA_REGIONS[key] ?? CANADA_REGIONS[compactedKey] ?? normalizeLooseName(value);
  }

  if (normalizedCountry === "United States") {
    return US_REGIONS[key] ?? US_REGIONS[compactedKey] ?? normalizeLooseName(value);
  }

  return CANADA_REGIONS[key] ?? CANADA_REGIONS[compactedKey] ?? US_REGIONS[key] ?? US_REGIONS[compactedKey] ?? normalizeLooseName(value);
}

function normalizeCity(value: string): string;
function normalizeCity(value: undefined): undefined;
function normalizeCity(value: string | undefined): string | undefined;
function normalizeCity(value: string | undefined) {
  return value ? normalizeLooseName(value) : value;
}

export function normalizeLocationPayload<T extends { city?: string; country: string; region?: string }>(value: T): T {
  const country = normalizeCountry(value.country);

  return {
    ...value,
    city: normalizeCity(value.city),
    country,
    region: normalizeRegion(value.region, country),
  };
}
