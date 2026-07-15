"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Check, Globe2, MapPin, PlusSquare, Search, Settings2, X } from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { countryOptions } from "@/lib/hackathons/countries";
import { filterLocalHackathonCatalog } from "@/lib/hackathons/local-catalog-search";
import { activeRegionPreset, regionPresets } from "@/lib/hackathons/region-presets";
import type { RegionPresetId } from "@/lib/hackathons/region-presets";
import { datePeriodOptions } from "@/lib/hackathons/search-filters";
import type {
  DatePeriod,
  FeatureFilter,
  HackathonFormatFilter,
  HackathonSearchFilters,
} from "@/lib/hackathons/search-filters";

const countryListboxId = "hackathon-country-options";
const countryPopoverId = "hackathon-country-popover";
const datePopoverId = "hackathon-date-popover";
const formatPopoverId = "hackathon-format-popover";
const featurePopoverId = "hackathon-feature-popover";

type OpenPopover = "countries" | "date" | "format" | "features" | null;

const formatOptions: { label: string; value: HackathonFormatFilter; detail: string }[] = [
  { label: "Any format", value: "any", detail: "Show online and in person events" },
  { label: "Online", value: "online", detail: "Remote hackathons you can join anywhere" },
  { label: "In person", value: "in_person", detail: "Venue based hackathons and local events" },
];

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

function replaceSearchUrl(
  { beginnerFriendly, countries, datePeriod, format, name, travelReimbursement }: HackathonSearchFilters,
  basePath: string
) {
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
  window.history.replaceState(null, "", query ? `${basePath}?${query}` : basePath);
}

/* Helpers handed to a custom card renderer so it can reflect edits/removals back
   into the grid's state (used by the admin view's edit/delete controls). */
export type HackathonCardHelpers = {
  updateCard: (next: HackathonCardData) => void;
  removeCard: (id: string) => void;
};

export function HackathonSearch({
  initialFilters,
  initialHackathons,
  basePath = "/hackathons",
  renderCard,
}: {
  initialFilters: HackathonSearchFilters;
  initialHackathons: HackathonCardData[];
  /* Path the filter state is written back to via history.replaceState. Defaults
     to the public page; the admin view passes its own route. */
  basePath?: string;
  /* Overrides how each grid card renders. Defaults to a plain HackathonCard; the
     admin view wraps it with edit/delete controls. */
  renderCard?: (hackathon: HackathonCardData, helpers: HackathonCardHelpers) => ReactNode;
}) {
  const [name, setName] = useState(initialFilters.name);
  const [countries, setCountries] = useState(initialFilters.countries);
  const [countryQuery, setCountryQuery] = useState("");
  const [datePeriod, setDatePeriod] = useState<DatePeriod>(initialFilters.datePeriod);
  const [format, setFormat] = useState<HackathonFormatFilter>(initialFilters.format);
  const [beginnerFriendly, setBeginnerFriendly] = useState<FeatureFilter>(initialFilters.beginnerFriendly);
  const [travelReimbursement, setTravelReimbursement] = useState<FeatureFilter>(initialFilters.travelReimbursement);
  const [catalog, setCatalog] = useState(initialHackathons);
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const filterFormRef = useRef<HTMLFormElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);
  const countryRowRef = useRef<HTMLDivElement>(null);
  const [countriesOverflow, setCountriesOverflow] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!filterFormRef.current?.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (openPopover === "countries") {
      countrySearchRef.current?.focus();
    }
  }, [openPopover]);

  useEffect(() => {
    const row = countryRowRef.current;

    if (!row) {
      return;
    }

    const checkOverflow = () => setCountriesOverflow(row.scrollWidth > row.clientWidth + 1);

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(row);

    return () => observer.disconnect();
  }, [countries]);

  const featureTags: {
    key: string;
    label: string;
    value: FeatureFilter;
    setValue: (next: FeatureFilter) => void;
  }[] = [
    { key: "beginnerFriendly", label: "Beginner friendly", value: beginnerFriendly, setValue: setBeginnerFriendly },
    {
      key: "travelReimbursement",
      label: "Travel reimbursements",
      value: travelReimbursement,
      setValue: setTravelReimbursement,
    },
  ];

  const currentFilters = useMemo(
    () => ({ beginnerFriendly, countries, datePeriod, format, name, travelReimbursement }),
    [beginnerFriendly, countries, datePeriod, format, name, travelReimbursement]
  );
  const activeFilters = useMemo(() => hasActiveFilters(currentFilters), [currentFilters]);
  const filteredHackathons = useMemo(
    () => filterLocalHackathonCatalog(catalog, currentFilters),
    [catalog, currentFilters]
  );
  const selectedPreset = useMemo(() => activeRegionPreset({ countries, format }), [countries, format]);
  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();

    return countryOptions.filter((option) => !query || option.toLowerCase().includes(query));
  }, [countryQuery]);

  useEffect(() => {
    replaceSearchUrl(currentFilters, basePath);
  }, [basePath, currentFilters]);

  const cardHelpers = useMemo<HackathonCardHelpers>(
    () => ({
      updateCard: (next) => setCatalog((current) => current.map((entry) => (entry.id === next.id ? next : entry))),
      removeCard: (id) => setCatalog((current) => current.filter((entry) => entry.id !== id)),
    }),
    []
  );
  const renderCardNode = renderCard ?? ((hackathon: HackathonCardData) => <HackathonCard hackathon={hackathon} />);

  const selectedDateLabel = datePeriodOptions.find((option) => option.value === datePeriod)?.label ?? "Any date";
  const selectedFormatLabel = formatOptions.find((option) => option.value === format)?.label ?? "Any format";
  const selectedFeatureLabels = featureTags.filter((tag) => tag.value === "on").map((tag) => tag.label);

  function selectCountry(country: string) {
    setCountries((selectedCountries) =>
      selectedCountries.includes(country) ? selectedCountries : [...selectedCountries, country]
    );
    setCountryQuery("");
  }

  function removeCountry(country: string) {
    setCountries((selectedCountries) => selectedCountries.filter((selectedCountry) => selectedCountry !== country));
  }

  function toggleCountry(country: string) {
    if (countries.includes(country)) {
      removeCountry(country);
      return;
    }

    selectCountry(country);
  }

  function countryDetail(country: string) {
    if (country === "Canada" || country === "United States" || country === "Mexico") {
      return "North America";
    }

    if (country === "United Kingdom" || country === "Ireland" || country === "France" || country === "Germany") {
      return "Frequent hackathon market";
    }

    return "International destination";
  }

  function applyRegionPreset(presetId: RegionPresetId) {
    const preset = regionPresets.find((option) => option.id === presetId);

    if (!preset) {
      return;
    }

    // A second click on the active preset clears it back to "all".
    const nextCountries = selectedPreset === presetId ? [] : [...preset.filters.countries];
    const nextFormat = selectedPreset === presetId ? "any" : preset.filters.format;

    setCountries(nextCountries);
    setCountryQuery("");
    setFormat(nextFormat);
  }

  function clearSearch() {
    setName("");
    setCountries([]);
    setCountryQuery("");
    setDatePeriod("any");
    setFormat("any");
    setBeginnerFriendly("any");
    setTravelReimbursement("any");
  }

  return (
    <>
      <section aria-label="Hackathon filters" className="px-5 pb-7 pt-14 sm:pt-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="relative mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <div
              aria-label="Region filters"
              className="inline-flex items-center gap-1 rounded-full border border-navy/10 bg-white/70 p-1.5 shadow-[0_10px_32px_-14px_rgba(29,42,68,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_12px_36px_-14px_rgba(0,0,0,0.6)]"
              role="group"
            >
              {regionPresets.map((preset) => {
                const active = selectedPreset === preset.id;

                return (
                  <button
                    aria-pressed={active}
                    className={`group inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-all sm:gap-2 sm:px-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                      active
                        ? "bg-cabernet text-wheat shadow-[0_8px_20px_-8px_rgba(114,28,36,0.55)] dark:bg-wheat dark:text-[#141414] dark:shadow-[0_8px_20px_-8px_rgba(244,235,217,0.35)]"
                        : "text-navy/55 hover:bg-navy/[0.05] hover:text-navy dark:text-wheat/55 dark:hover:bg-white/5 dark:hover:text-wheat"
                    }`}
                    key={preset.id}
                    onClick={() => applyRegionPreset(preset.id)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`text-lg leading-none transition-[transform,filter] duration-300 group-hover:scale-110 ${
                        active ? "" : "grayscale group-hover:grayscale-0"
                      }`}
                    >
                      {preset.emoji}
                    </span>
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 dark:border-white/15 px-4 text-sm font-semibold text-navy dark:text-wheat transition-colors hover:border-navy dark:hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 sm:absolute sm:right-0"
              href="/submit"
            >
              <PlusSquare aria-hidden="true" className="size-4" />
              New entry
            </Link>
          </div>

          <form
            className="relative z-30 flex flex-col rounded-[2.35rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-2 shadow-[0_10px_36px_rgba(0,0,0,0.14)] md:flex-row md:items-stretch"
            ref={filterFormRef}
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3 text-left focus-within:bg-ivory dark:focus-within:bg-white/10 hover:bg-ivory dark:hover:bg-white/10">
              <span className="text-xs font-semibold leading-5 text-navy dark:text-wheat">Name</span>
              <input
                className="min-w-0 bg-transparent text-sm leading-5 text-navy/55 dark:text-wheat/55 outline-none placeholder:text-navy/55 dark:placeholder:text-wheat/40"
                name="q"
                onChange={(event) => setName(event.target.value)}
                placeholder="Hackathon name"
                type="search"
                value={name}
              />
            </label>

            <div className="relative min-h-[4.2rem] min-w-0 flex-[1.25]">
              {countries.map((country) => (
                <input key={country} name="countries" type="hidden" value={country} />
              ))}
              <button
                aria-controls={countryPopoverId}
                aria-expanded={openPopover === "countries"}
                aria-label="Countries"
                className={`flex min-h-[4.2rem] w-full min-w-0 flex-col justify-start rounded-[2rem] px-6 py-3 text-left hover:bg-ivory dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                  openPopover === "countries" ? "bg-ivory dark:bg-white/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : ""
                }`}
                onClick={() => setOpenPopover((current) => (current === "countries" ? null : "countries"))}
                type="button"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat">
                  <Globe2 aria-hidden="true" className="size-3.5" />
                  Countries
                </span>
                {countries.length ? (
                  <span className="relative mt-1 block min-w-0">
                    <span className="flex min-w-0 flex-nowrap gap-1.5 overflow-hidden" ref={countryRowRef}>
                      {countries.map((country) => (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-navy dark:text-wheat"
                          key={country}
                        >
                          <span>{country}</span>
                        </span>
                      ))}
                    </span>
                    {countriesOverflow ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-ivory via-ivory dark:from-[#1f1f1f] dark:via-[#1f1f1f] pl-6 pr-1 text-xs font-semibold text-navy/55 dark:text-wheat/55"
                      >
                        ...
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="mt-1 text-sm leading-5 text-navy/55 dark:text-wheat/55">Search countries</span>
                )}
              </button>
              {openPopover === "countries" ? (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+0.9rem)] z-50 overflow-hidden rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:left-[-1rem] md:right-auto md:w-[34rem]"
                  id={countryPopoverId}
                >
                  <div className="flex items-center gap-2 rounded-full border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3">
                    <Search aria-hidden="true" className="size-4 text-navy/55 dark:text-wheat/55" />
                    <input
                      aria-autocomplete="list"
                      aria-controls={countryListboxId}
                      aria-expanded="true"
                      aria-label="Search countries"
                      className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-navy dark:text-wheat outline-none placeholder:text-navy/55 dark:placeholder:text-wheat/40"
                      onChange={(event) => setCountryQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && filteredCountries[0]) {
                          event.preventDefault();
                          toggleCountry(filteredCountries[0]);
                        }
                      }}
                      placeholder="Search countries"
                      ref={countrySearchRef}
                      role="combobox"
                      type="search"
                      value={countryQuery}
                    />
                  </div>
                  {countries.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {countries.map((country) => (
                        <button
                          aria-label={`Remove ${country}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-navy dark:text-wheat hover:border-navy dark:hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40"
                          key={country}
                          onClick={() => removeCountry(country)}
                          type="button"
                        >
                          {country}
                          <X aria-hidden="true" className="size-3.5" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className="mt-4 grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
                    id={countryListboxId}
                    role="listbox"
                  >
                    {filteredCountries.map((country) => {
                      const selected = countries.includes(country);

                      return (
                        <button
                          aria-selected={selected}
                          className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                            selected
                              ? "border-cabernet/35 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10"
                              : "border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] hover:border-navy/20 hover:bg-ivory dark:hover:bg-white/10"
                          }`}
                          key={country}
                          onClick={() => toggleCountry(country)}
                          role="option"
                          type="button"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-navy dark:text-wheat">{country}</span>
                            <span className="mt-0.5 block truncate text-xs text-navy/55 dark:text-wheat/55">{countryDetail(country)}</span>
                          </span>
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                              selected ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white" : "border-navy/15 dark:border-white/15 text-transparent"
                            }`}
                          >
                            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                          </span>
                        </button>
                      );
                    })}
                    {!filteredCountries.length ? (
                      <div className="col-span-full rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-5 text-sm font-semibold text-navy/55 dark:text-wheat/55">
                        No countries match that search.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative min-h-[4.2rem] min-w-0 flex-1">
              <input name="datePeriod" type="hidden" value={datePeriod} />
              <button
                aria-controls={datePopoverId}
                aria-expanded={openPopover === "date"}
                aria-label="Date"
                className={`flex min-h-[4.2rem] w-full min-w-0 flex-col justify-start rounded-[2rem] px-6 py-3 text-left hover:bg-ivory dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                  openPopover === "date" ? "bg-ivory dark:bg-white/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : ""
                }`}
                onClick={() => setOpenPopover((current) => (current === "date" ? null : "date"))}
                type="button"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat">
                  <CalendarDays aria-hidden="true" className="size-3.5" />
                  Date
                </span>
                <span className="mt-1 block truncate text-sm leading-5 text-navy/55 dark:text-wheat/55">{selectedDateLabel}</span>
              </button>
              {openPopover === "date" ? (
                <div
                  className="absolute left-0 top-[calc(100%+0.9rem)] z-50 w-full min-w-[18rem] rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:w-[24rem]"
                  id={datePopoverId}
                >
                  <div className="grid gap-2">
                    {datePeriodOptions.map((option) => {
                      const selected = datePeriod === option.value;

                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex min-h-[3.5rem] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                            selected
                              ? "border-cabernet/35 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10"
                              : "border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] hover:border-navy/20 hover:bg-ivory dark:hover:bg-white/10"
                          }`}
                          key={option.value}
                          onClick={() => {
                            setDatePeriod(option.value);
                            setOpenPopover(null);
                          }}
                          type="button"
                        >
                          <span className="text-sm font-semibold text-navy dark:text-wheat">{option.label}</span>
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                              selected ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white" : "border-navy/15 dark:border-white/15 text-transparent"
                            }`}
                          >
                            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative min-h-[4.2rem] min-w-0 flex-1">
              <input name="format" type="hidden" value={format} />
              <button
                aria-controls={formatPopoverId}
                aria-expanded={openPopover === "format"}
                aria-label="Format"
                className={`flex min-h-[4.2rem] w-full min-w-0 flex-col justify-start rounded-[2rem] px-6 py-3 text-left hover:bg-ivory dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                  openPopover === "format" ? "bg-ivory dark:bg-white/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : ""
                }`}
                onClick={() => setOpenPopover((current) => (current === "format" ? null : "format"))}
                type="button"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat">
                  <MapPin aria-hidden="true" className="size-3.5" />
                  Format
                </span>
                <span className="mt-1 block truncate text-sm leading-5 text-navy/55 dark:text-wheat/55">{selectedFormatLabel}</span>
              </button>
              {openPopover === "format" ? (
                <div
                  className="absolute left-0 top-[calc(100%+0.9rem)] z-50 w-full min-w-[19rem] rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:w-[24rem]"
                  id={formatPopoverId}
                >
                  <div className="grid gap-2">
                    {formatOptions.map((option) => {
                      const selected = format === option.value;

                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                            selected
                              ? "border-cabernet/35 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10"
                              : "border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] hover:border-navy/20 hover:bg-ivory dark:hover:bg-white/10"
                          }`}
                          key={option.value}
                          onClick={() => {
                            setFormat(option.value);
                            setOpenPopover(null);
                          }}
                          type="button"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-navy dark:text-wheat">{option.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-navy/55 dark:text-wheat/55">{option.detail}</span>
                          </span>
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                              selected ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white" : "border-navy/15 dark:border-white/15 text-transparent"
                            }`}
                          >
                            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative min-h-[4.2rem] min-w-0 flex-[1.5]">
              {featureTags.map((tag) =>
                tag.value !== "any" ? <input key={tag.key} name={tag.key} type="hidden" value={tag.value} /> : null
              )}
              <button
                aria-controls={featurePopoverId}
                aria-expanded={openPopover === "features"}
                aria-labelledby="hackathon-feature-filters-label"
                className={`flex min-h-[4.2rem] w-full min-w-0 flex-col justify-start rounded-[2rem] px-6 py-3 text-left hover:bg-ivory dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                  openPopover === "features" ? "bg-ivory dark:bg-white/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : ""
                }`}
                onClick={() => setOpenPopover((current) => (current === "features" ? null : "features"))}
                type="button"
              >
                <span
                  className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat"
                  id="hackathon-feature-filters-label"
                >
                  <Settings2 aria-hidden="true" className="size-3.5" />
                  Features
                </span>
                <span className="mt-1 block truncate text-sm leading-5 text-navy/55 dark:text-wheat/55">
                  {selectedFeatureLabels.length ? selectedFeatureLabels.join(", ") : "Add features"}
                </span>
              </button>
              {openPopover === "features" ? (
                <div
                  className="absolute right-0 top-[calc(100%+0.9rem)] z-50 w-full min-w-[20rem] rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-5 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:w-[27rem]"
                  id={featurePopoverId}
                >
                  <div className="flex flex-wrap gap-3">
                    {featureTags.map((tag) => {
                      const active = tag.value === "on";

                      return (
                        <button
                          aria-pressed={active}
                          className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                            active
                              ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white hover:bg-[#5c151c]"
                              : "border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] text-navy dark:text-wheat hover:border-navy dark:hover:border-white/60"
                          }`}
                          key={tag.key}
                          onClick={() => tag.setValue(active ? "any" : "on")}
                          type="button"
                        >
                          <span
                            className={`grid size-5 place-items-center rounded-full border ${
                              active ? "border-wheat text-wheat" : "border-navy/15 dark:border-white/15 text-transparent"
                            }`}
                          >
                            <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                          </span>
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 px-2 py-2 md:px-3">
              {activeFilters ? (
                <button
                  aria-label="Clear hackathon search"
                  className="grid min-h-12 place-items-center rounded-full border border-navy/15 dark:border-white/15 px-4 text-sm font-semibold text-navy dark:text-wheat hover:border-navy dark:hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 md:size-12 md:min-h-0 md:px-0"
                  onClick={clearSearch}
                  type="button"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-4 min-h-6 px-2 text-sm text-navy/55 dark:text-wheat/55" role="status">
            {activeFilters ? (
              <span>
                Showing {filteredHackathons.length} {filteredHackathons.length === 1 ? "hackathon" : "hackathons"} matching your search.
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-7">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat sm:text-4xl">Upcoming hackathons</h1>
          </div>

          {filteredHackathons.length ? (
            <>
              <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {filteredHackathons.map((hackathon) => (
                  <Fragment key={hackathon.id}>{renderCardNode(hackathon, cardHelpers)}</Fragment>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-8 text-center">
              <h2 className="text-xl font-semibold text-navy dark:text-wheat">No hackathons match your search</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-navy/55 dark:text-wheat/55">
                Try a different name, country selection, date, or feature filter.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
