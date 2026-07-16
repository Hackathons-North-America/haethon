import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { cities } from "@/lib/db/schema";

export type CitySuggestion = {
  id: number;
  name: string;
  region: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

const SUGGESTION_LIMIT = 8;

/**
 * Autocomplete over the self-hosted GeoNames cities table — no external
 * geocoding API. Prefix matches rank above substring matches, then bigger
 * cities first, so "San" surfaces San Francisco before San Marino. The ascii
 * name is matched too so "Montreal" finds "Montréal".
 */
export async function searchCities(query: string): Promise<CitySuggestion[]> {
  const term = query.trim();

  if (term.length < 2) {
    return [];
  }

  const pattern = `%${term}%`;
  const prefixPattern = `${term}%`;

  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      region: cities.region,
      country: cities.country,
      countryCode: cities.countryCode,
      latitude: cities.latitude,
      longitude: cities.longitude,
    })
    .from(cities)
    .where(sql`${cities.name} ILIKE ${pattern} OR ${cities.asciiName} ILIKE ${pattern}`)
    .orderBy(
      sql`case when ${cities.name} ILIKE ${prefixPattern} or ${cities.asciiName} ILIKE ${prefixPattern} then 0 else 1 end`,
      sql`${cities.population} desc`
    )
    .limit(SUGGESTION_LIMIT);

  return rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  }));
}

/**
 * Resolves a free-text city/region/country to coordinates using the cities
 * table. This is the fallback for write paths that never went through the
 * city combobox (JSON imports, the review queue, admin edits), so every
 * published hackathon can carry coordinates without a geocoding call. A
 * region match is preferred (Waterloo, Ontario vs Waterloo, Iowa); ties go
 * to the biggest city.
 */
export async function resolveCityCoordinates(location: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): Promise<{ latitude: number; longitude: number; countryCode: string } | null> {
  const city = location.city?.trim();

  if (!city) {
    return null;
  }

  const region = location.region?.trim();
  const country = location.country?.trim();

  const [row] = await db
    .select({
      latitude: cities.latitude,
      longitude: cities.longitude,
      countryCode: cities.countryCode,
    })
    .from(cities)
    .where(
      sql`(lower(${cities.name}) = lower(${city}) or lower(${cities.asciiName}) = lower(${city}))${
        country ? sql` and (lower(${cities.country}) = lower(${country}) or lower(${cities.countryCode}) = lower(${country}))` : sql``
      }`
    )
    .orderBy(
      region
        ? sql`case when lower(${cities.region}) = lower(${region}) then 0 else 1 end, ${cities.population} desc`
        : sql`${cities.population} desc`
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    countryCode: row.countryCode,
  };
}

/**
 * Builds the hackathon_locations column values for a normalized payload.
 * Coordinates from the payload (city combobox) win; otherwise the city is
 * resolved against the local cities table. Both stay null only when the city
 * is unknown — the catalog treats those as "no distance filter match".
 */
export async function hackathonLocationValues(payload: {
  city?: string | null;
  region?: string | null;
  country: string;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  let latitude = payload.latitude ?? null;
  let longitude = payload.longitude ?? null;
  let countryCode = payload.countryCode ?? null;

  if (latitude === null || longitude === null) {
    const resolved = await resolveCityCoordinates(payload);

    if (resolved) {
      latitude = resolved.latitude;
      longitude = resolved.longitude;
      countryCode ??= resolved.countryCode;
    }
  }

  const hasCoordinates = latitude !== null && longitude !== null;

  return {
    city: payload.city ?? null,
    region: payload.region ?? null,
    country: payload.country,
    countryCode,
    latitude: hasCoordinates ? latitude!.toFixed(6) : null,
    longitude: hasCoordinates ? longitude!.toFixed(6) : null,
    coordinates: hasCoordinates ? { lat: latitude!, lng: longitude! } : null,
  };
}
