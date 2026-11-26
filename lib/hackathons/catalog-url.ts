import { CATALOG_SNAPSHOT_URL, EARLY_CATALOG_GLOBAL } from "@/lib/hackathons/catalog-client";
import {
  normalizeCatalogSort,
  normalizeSearchFilters,
  type CatalogSort,
  type HackathonSearchFilters,
} from "@/lib/hackathons/search-filters";

/* /hackathons is one static page for every URL, so the query string is read
   in the browser. These helpers decide whether a URL is the plain catalog
   (served straight from the static page) or a filtered view (fetched from the
   API after the page loads). */

export const DEFAULT_SEARCH_FILTERS: HackathonSearchFilters = {
  beginnerFriendly: "any",
  countries: [],
  datePeriod: "any",
  distanceKm: "any",
  format: "any",
  highSchoolersOnly: "any",
  name: "",
  travelReimbursement: "any",
};

export type CatalogUrlRequest = {
  filters: HackathonSearchFilters;
  sort: CatalogSort;
  /* No filter and the default order: exactly what the static page shows. */
  isDefault: boolean;
};

export const DEFAULT_CATALOG_REQUEST: CatalogUrlRequest = {
  filters: DEFAULT_SEARCH_FILTERS,
  sort: "soonest",
  isDefault: true,
};

/* The query parameters that change which cards are shown. `search=1` is not
   one of them: the page adds it to every catalog URL. */
const CATALOG_URL_PARAMS = [
  "q",
  "countries",
  "country",
  "datePeriod",
  "distanceKm",
  "format",
  "beginnerFriendly",
  "travelReimbursement",
  "highSchoolersOnly",
  "sort",
] as const;

/** Reads a `location.search` string the same way the server used to read searchParams. */
export function catalogRequestFromSearch(search: string): CatalogUrlRequest {
  const params = new URLSearchParams(search);
  const record: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);

    record[key] = values.length > 1 ? values : values[0];
  }

  const filters = normalizeSearchFilters(record);
  const sort = normalizeCatalogSort(record.sort);
  const isDefault =
    sort === "soonest" &&
    !filters.name &&
    !filters.countries.length &&
    filters.datePeriod === "any" &&
    filters.distanceKm === "any" &&
    filters.format === "any" &&
    filters.beginnerFriendly === "any" &&
    filters.highSchoolersOnly === "any" &&
    filters.travelReimbursement === "any";

  return isDefault ? DEFAULT_CATALOG_REQUEST : { filters, sort, isDefault };
}

/* The attribute the boot script below sets on <html>, and the value it sets. */
export const CATALOG_URL_ATTRIBUTE = "data-catalog-url";

/* Runs inline, before the static cards paint. On a filtered URL the static
   HTML still holds the unfiltered cards; marking <html> lets a CSS rule in
   app/globals.css keep them hidden until the browser has swapped in the
   filtered view (components/hackathon-catalog.tsx clears the mark). It errs
   toward hiding: a parameter that later normalizes away costs one blank
   moment, never wrong cards.

   The same URL also needs the catalog file its results are selected from, so
   the download starts here, while the HTML is still parsing, rather than once
   the JavaScript has loaded and hydrated (lib/hackathons/catalog-client.ts
   picks the promise up). Dependency-free ES5 and wrapped in try/catch, like
   the theme boot script. */
export const CATALOG_URL_BOOT_SCRIPT = `try{if(/[?&](?:${CATALOG_URL_PARAMS.join(
  "|"
)})=[^&]/.test(location.search)){document.documentElement.setAttribute("${CATALOG_URL_ATTRIBUTE}","filtered");window.${EARLY_CATALOG_GLOBAL}=fetch("${CATALOG_SNAPSHOT_URL}").then(function(r){return r.ok?r.json():null})["catch"](function(){return null})}}catch(e){}`;
