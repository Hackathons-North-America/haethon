"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Globe2, MapPin, Search, Settings2, X } from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { countryOptions } from "@/lib/hackathons/countries";
import { datePeriodOptions, dateRangeForPeriod } from "@/lib/hackathons/search-filters";
import type {
  DatePeriod,
  FeatureFilter,
  HackathonFormatFilter,
  HackathonSearchFilters,
} from "@/lib/hackathons/search-filters";

type HackathonSearchResponse = {
  data?: HackathonCardData[];
  error?: unknown;
};

const countryListboxId = "hackathon-country-options";

function buildSearchParams({
  beginnerFriendly,
  countries,
  datePeriod,
  format,
  name,
  travelReimbursement,
}: HackathonSearchFilters) {
  const params = new URLSearchParams({ limit: "48" });
  const trimmedName = name.trim();
  const range = dateRangeForPeriod(datePeriod);

  if (trimmedName) {
    params.set("q", trimmedName);
  }

  countries.forEach((country) => params.append("countries", country));

  if (range) {
    params.set("startsAfter", range.startsAfter.toISOString());
    params.set("startsBefore", range.startsBefore.toISOString());
  }

  if (format !== "any") {
    params.set("format", format);
  }

  if (beginnerFriendly !== "any") {
    params.set("beginnerFriendly", beginnerFriendly === "on" ? "true" : "false");
  }

  if (travelReimbursement !== "any") {
    params.set("travelReimbursement", travelReimbursement === "on" ? "true" : "false");
  }

  return params;
}

function hasActiveFilters({
  beginnerFriendly,
  countries,
  datePeriod,
  format,
  name,
  travelReimbursement,
}: HackathonSearchFilters) {
  return Boolean(
    name.trim() ||
      countries.length ||
      datePeriod !== "any" ||
      format !== "any" ||
      beginnerFriendly !== "any" ||
      travelReimbursement !== "any"
  );
}

function replaceSearchUrl({
  beginnerFriendly,
  countries,
  datePeriod,
  format,
  name,
  travelReimbursement,
}: HackathonSearchFilters) {
  const params = new URLSearchParams();

  if (name.trim()) {
    params.set("q", name.trim());
  }

  countries.forEach((country) => params.append("countries", country));

  if (datePeriod !== "any") {
    params.set("datePeriod", datePeriod);
  }

  if (format !== "any") {
    params.set("format", format);
  }

  if (beginnerFriendly !== "any") {
    params.set("beginnerFriendly", beginnerFriendly);
  }

  if (travelReimbursement !== "any") {
    params.set("travelReimbursement", travelReimbursement);
  }

  const query = params.toString();
  window.history.replaceState(null, "", query ? `/hackathons?${query}` : "/hackathons");
}

export function HackathonSearch({
  initialFilters,
  initialHackathons,
}: {
  initialFilters: HackathonSearchFilters;
  initialHackathons: HackathonCardData[];
}) {
  const [name, setName] = useState(initialFilters.name);
  const [countries, setCountries] = useState(initialFilters.countries);
  const [countryQuery, setCountryQuery] = useState("");
  const [datePeriod, setDatePeriod] = useState<DatePeriod>(initialFilters.datePeriod);
  const [format, setFormat] = useState<HackathonFormatFilter>(initialFilters.format);
  const [beginnerFriendly, setBeginnerFriendly] = useState<FeatureFilter>(initialFilters.beginnerFriendly);
  const [travelReimbursement, setTravelReimbursement] = useState<FeatureFilter>(initialFilters.travelReimbursement);
  const [hackathons, setHackathons] = useState(initialHackathons);
  const [hasSearched, setHasSearched] = useState(() => hasActiveFilters(initialFilters));
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFilters = useMemo(
    () => ({ beginnerFriendly, countries, datePeriod, format, name, travelReimbursement }),
    [beginnerFriendly, countries, datePeriod, format, name, travelReimbursement]
  );
  const activeFilters = useMemo(() => hasActiveFilters(currentFilters), [currentFilters]);
  const countrySuggestions = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return countryOptions
      .filter((option) => !countries.includes(option) && option.toLowerCase().includes(query))
      .slice(0, 8);
  }, [countries, countryQuery]);

  function selectCountry(country: string) {
    setCountries((selectedCountries) =>
      selectedCountries.includes(country) ? selectedCountries : [...selectedCountries, country]
    );
    setCountryQuery("");
  }

  function removeCountry(country: string) {
    setCountries((selectedCountries) => selectedCountries.filter((selectedCountry) => selectedCountry !== country));
  }

  async function runSearch(nextFilters = currentFilters, options = { markSearched: true }) {
    setIsSearching(true);
    setError(null);

    try {
      const params = buildSearchParams(nextFilters);
      const response = await fetch(`/api/hackathons?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error("Search failed.");
      }

      const payload = (await response.json()) as HackathonSearchResponse;

      if (!Array.isArray(payload.data)) {
        throw new Error("Search returned an unexpected response.");
      }

      setHackathons(payload.data);
      setHasSearched(options.markSearched);
      replaceSearchUrl(nextFilters);
    } catch {
      setError("Search is unavailable right now. Try again in a moment.");
    } finally {
      setIsSearching(false);
    }
  }

  function clearSearch() {
    setName("");
    setCountries([]);
    setCountryQuery("");
    setDatePeriod("any");
    setFormat("any");
    setBeginnerFriendly("any");
    setTravelReimbursement("any");
    setHasSearched(false);
    setError(null);
    void runSearch(
      { beginnerFriendly: "any", countries: [], datePeriod: "any", format: "any", name: "", travelReimbursement: "any" },
      { markSearched: false }
    );
  }

  return (
    <>
      <section aria-label="Hackathon filters" className="bg-white px-5 pb-7 pt-14 sm:pt-16">
        <div className="mx-auto max-w-[1120px]">
          <form
            className="relative z-30 flex flex-col rounded-[2.35rem] border border-black/10 bg-white p-2 shadow-[0_10px_36px_rgba(0,0,0,0.14)] md:flex-row md:items-stretch"
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <label className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-[#F7F7F4] hover:bg-[#F7F7F4]">
              <span className="text-xs font-semibold leading-5 text-black">Name</span>
              <input
                className="min-w-0 bg-transparent text-sm leading-5 text-[#706F6B] outline-none placeholder:text-[#706F6B]"
                name="q"
                onChange={(event) => setName(event.target.value)}
                placeholder="Hackathon name"
                type="search"
                value={name}
              />
            </label>

            <div className="relative flex min-h-[4.2rem] min-w-0 flex-[1.2] flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-[#F7F7F4] hover:bg-[#F7F7F4]">
              <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-black">
                <Globe2 aria-hidden="true" className="size-3.5" />
                Countries
              </span>
              {countries.map((country) => (
                <input key={country} name="countries" type="hidden" value={country} />
              ))}
              {countries.length ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {countries.map((country) => (
                    <button
                      aria-label={`Remove ${country}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black hover:border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35"
                      key={country}
                      onClick={() => removeCountry(country)}
                      type="button"
                    >
                      <span className="truncate">{country}</span>
                      <X aria-hidden="true" className="size-3.5 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                aria-autocomplete="list"
                aria-controls={countryListboxId}
                aria-expanded={countrySuggestions.length > 0}
                aria-label="Countries"
                className="mt-1 min-w-0 bg-transparent text-sm leading-5 text-[#706F6B] outline-none placeholder:text-[#706F6B]"
                onChange={(event) => setCountryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && countrySuggestions[0]) {
                    event.preventDefault();
                    selectCountry(countrySuggestions[0]);
                  }

                  if (event.key === "Backspace" && !countryQuery && countries.length) {
                    removeCountry(countries[countries.length - 1]);
                  }
                }}
                placeholder={countries.length ? "Add another country" : "Search countries"}
                role="combobox"
                type="search"
                value={countryQuery}
              />
              {countrySuggestions.length ? (
                <div
                  className="absolute left-3 right-3 top-[calc(100%-0.35rem)] z-50 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-[0_14px_34px_rgba(0,0,0,0.16)]"
                  id={countryListboxId}
                  role="listbox"
                >
                  {countrySuggestions.map((country) => (
                    <button
                      className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-[#F7F7F4] focus-visible:bg-[#F7F7F4] focus-visible:outline-none"
                      key={country}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectCountry(country);
                      }}
                      aria-selected="false"
                      role="option"
                      type="button"
                    >
                      {country}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-[#F7F7F4] hover:bg-[#F7F7F4]">
              <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-black">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                Date
              </span>
              <select
                className="min-w-0 cursor-pointer bg-transparent text-sm leading-5 text-[#706F6B] outline-none"
                name="datePeriod"
                onChange={(event) => setDatePeriod(event.target.value as DatePeriod)}
                value={datePeriod}
              >
                {datePeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-[#F7F7F4] hover:bg-[#F7F7F4]">
              <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-black">
                <MapPin aria-hidden="true" className="size-3.5" />
                Format
              </span>
              <select
                className="min-w-0 cursor-pointer bg-transparent text-sm leading-5 text-[#706F6B] outline-none"
                name="format"
                onChange={(event) => setFormat(event.target.value as HackathonFormatFilter)}
                value={format}
              >
                <option value="any">Any format</option>
                <option value="online">Online</option>
                <option value="in_person">In person</option>
              </select>
            </label>

            <div
              aria-labelledby="hackathon-feature-filters-label"
              className="flex min-h-[4.2rem] min-w-0 flex-[1.6] flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-[#F7F7F4] hover:bg-[#F7F7F4]"
              role="group"
            >
              <span
                className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-black"
                id="hackathon-feature-filters-label"
              >
                <Settings2 aria-hidden="true" className="size-3.5" />
                Features
              </span>
              <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className="sr-only">Beginner friendly</span>
                  <select
                    aria-label="Beginner friendly"
                    className="w-full min-w-0 cursor-pointer bg-transparent text-sm leading-5 text-[#706F6B] outline-none"
                    name="beginnerFriendly"
                    onChange={(event) => setBeginnerFriendly(event.target.value as FeatureFilter)}
                    value={beginnerFriendly}
                  >
                    <option value="any">Beginner any</option>
                    <option value="on">Beginner on</option>
                    <option value="off">Beginner off</option>
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Travel reimbursement</span>
                  <select
                    aria-label="Travel reimbursement"
                    className="w-full min-w-0 cursor-pointer bg-transparent text-sm leading-5 text-[#706F6B] outline-none"
                    name="travelReimbursement"
                    onChange={(event) => setTravelReimbursement(event.target.value as FeatureFilter)}
                    value={travelReimbursement}
                  >
                    <option value="any">Travel any</option>
                    <option value="on">Travel on</option>
                    <option value="off">Travel off</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 px-2 py-2 md:px-3">
              {activeFilters ? (
                <button
                  aria-label="Clear hackathon search"
                  className="grid min-h-12 place-items-center rounded-full border border-black/15 px-4 text-sm font-semibold text-black hover:border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 md:size-12 md:min-h-0 md:px-0"
                  onClick={clearSearch}
                  type="button"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              ) : null}
              <button
                aria-label="Search hackathons"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#D9043D] px-5 text-sm font-semibold text-white hover:bg-[#B80033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 disabled:cursor-wait disabled:bg-[#D9043D]/70 md:size-12 md:min-h-0 md:px-0"
                disabled={isSearching}
                type="submit"
              >
                <Search aria-hidden="true" className="size-5" strokeWidth={2.5} />
                <span className="md:sr-only">{isSearching ? "Searching" : "Search"}</span>
              </button>
            </div>
          </form>

          <div className="mt-4 min-h-6 px-2 text-sm text-[#706F6B]" role="status">
            {error ? (
              <span className="font-semibold text-[#660000]">{error}</span>
            ) : hasSearched ? (
              <span>
                Showing {hackathons.length} {hackathons.length === 1 ? "hackathon" : "hackathons"} matching your search.
              </span>
            ) : (
              <span>Search by name, countries, date, format, or features.</span>
            )}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-7">
            <h1 className="text-3xl font-semibold tracking-normal text-black sm:text-4xl">Upcoming hackathons</h1>
          </div>

          {hackathons.length ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {hackathons.map((hackathon, index) => (
                <HackathonCard hackathon={hackathon} index={index} key={hackathon.id} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-black/10 bg-[#F7F7F4] p-8 text-center">
              <h2 className="text-xl font-semibold text-black">No hackathons match your search</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#706F6B]">
                Try a different name, country selection, date, or feature filter.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
