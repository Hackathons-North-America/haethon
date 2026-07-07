import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

export type RegionPresetId = "north-america" | "international" | "online";

// Countries counted as "International" — major European and Asian markets plus
// the destinations that reliably host large hackathons (Singapore, Switzerland, UAE...).
export const internationalCountries = [
  // Europe
  "United Kingdom",
  "Germany",
  "France",
  "Netherlands",
  "Spain",
  "Italy",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Ireland",
  "Poland",
  "Portugal",
  "Belgium",
  "Austria",
  "Czechia",
  "Estonia",
  // Asia & Middle East
  "India",
  "China",
  "Japan",
  "South Korea",
  "Singapore",
  "Taiwan",
  "Indonesia",
  "Vietnam",
  "Thailand",
  "Philippines",
  "Malaysia",
  "Israel",
  "United Arab Emirates",
  // Oceania
  "Australia",
  "New Zealand",
];

const northAmericaCountries = ["Canada", "United States"];

export type RegionPreset = {
  id: RegionPresetId;
  label: string;
  emoji: string;
  filters: Pick<HackathonSearchFilters, "countries" | "format">;
};

export const regionPresets: RegionPreset[] = [
  {
    id: "north-america",
    label: "North America",
    emoji: "🌎",
    filters: { countries: northAmericaCountries, format: "in_person" },
  },
  {
    id: "international",
    label: "International",
    emoji: "✈️",
    filters: { countries: internationalCountries, format: "in_person" },
  },
  {
    id: "online",
    label: "Online",
    emoji: "💻",
    filters: { countries: [], format: "online" },
  },
];

function sameCountrySet(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  const setB = new Set(b);
  return a.every((country) => setB.has(country));
}

export function activeRegionPreset(filters: Pick<HackathonSearchFilters, "countries" | "format">) {
  return (
    regionPresets.find(
      (preset) =>
        preset.filters.format === filters.format && sameCountrySet(preset.filters.countries, filters.countries)
    )?.id ?? null
  );
}
