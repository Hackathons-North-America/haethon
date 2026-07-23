"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  Globe2,
  LayoutGrid,
  ListOrdered,
  LocateFixed,
  MapPin,
  Navigation,
  PlusSquare,
  Search,
  Settings2,
  Trophy,
  X,
} from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { HackathonRankingList } from "@/components/hackathon-ranking-list";
import { HackathonTierList } from "@/components/hackathon-tier-list";
import type { GeoPoint } from "@/lib/geo";
import { countryOptions } from "@/lib/hackathons/countries";
import { filterLocalHackathonCatalog } from "@/lib/hackathons/local-catalog-search";
import { assignTiers, sortByEloDescending, sortByEloWithLocalBoost } from "@/lib/hackathons/ranking";
import { activeRegionPreset, regionPresets } from "@/lib/hackathons/region-presets";
import type { RegionPresetId } from "@/lib/hackathons/region-presets";
import { datePeriodOptions, distanceOptions, viewModeOptions } from "@/lib/hackathons/search-filters";
import type {
  DatePeriod,
  DistanceFilter,
  FeatureFilter,
  HackathonFormatFilter,
  HackathonSearchFilters,
  HackathonViewMode,
} from "@/lib/hackathons/search-filters";

const countryListboxId = "hackathon-country-options";
const countryPopoverId = "hackathon-country-popover";
const datePopoverId = "hackathon-date-popover";
const formatPopoverId = "hackathon-format-popover";
const featurePopoverId = "hackathon-feature-popover";
const distancePopoverId = "hackathon-distance-popover";

type OpenPopover = "countries" | "date" | "format" | "features" | "distance" | null;

/* The user's position for the distance filter (and, via countryCode, the
   Browse/Ranking views' "push local hackathons to the top" boost). IP-based
   (free Vercel geo headers, no permission prompt) by default; "precise" comes
   from the browser geolocation API when the user asks for it — that path has
   no country of its own, so countryCode stays null and the boost no-ops. */
type UserOrigin = GeoPoint & { label: string | null; precise: boolean; countryCode?: string | null };

const viewModeIcons: Record<HackathonViewMode, typeof LayoutGrid> = {
  grid: LayoutGrid,
  tier: Trophy,
  ranking: ListOrdered,
};

const formatOptions: { label: string; value: HackathonFormatFilter; detail: string }[] = [
  { label: "Any format", value: "any", detail: "Show online and in person events" },
  { label: "Online", value: "online", detail: "Remote hackathons you can join anywhere" },
  { label: "In person", value: "in_person", detail: "Venue based hackathons and local events" },
];

function hasActiveFilters({
  beginnerFriendly,
  countries,
  datePeriod,
  distanceKm,
  format,
  highSchoolersOnly,
  name,
  travelReimbursement,
}: HackathonSearchFilters) {
  return Boolean(
    name.trim() ||
      countries.length ||
      datePeriod !== "any" ||
      distanceKm !== "any" ||
      format !== "any" ||
      beginnerFriendly !== "any" ||
      highSchoolersOnly !== "any" ||
      travelReimbursement !== "any"
  );
}

function replaceSearchUrl(
  {
    beginnerFriendly,
    countries,
    datePeriod,
    distanceKm,
    format,
    highSchoolersOnly,
    name,
    travelReimbursement,
    view,
  }: HackathonSearchFilters,
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

  if (distanceKm !== "any") {
    params.set("distanceKm", String(distanceKm));
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

  if (highSchoolersOnly !== "any") {
    params.set("highSchoolersOnly", highSchoolersOnly);
  }

  if (view !== "grid") {
    params.set("view", view);
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
  const [distanceKm, setDistanceKm] = useState<DistanceFilter>(initialFilters.distanceKm);
  const [origin, setOrigin] = useState<UserOrigin | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "locating" | "ready" | "error">("idle");
  const [format, setFormat] = useState<HackathonFormatFilter>(initialFilters.format);
  const [beginnerFriendly, setBeginnerFriendly] = useState<FeatureFilter>(initialFilters.beginnerFriendly);
  const [travelReimbursement, setTravelReimbursement] = useState<FeatureFilter>(initialFilters.travelReimbursement);
  const [highSchoolersOnly, setHighSchoolersOnly] = useState<FeatureFilter>(initialFilters.highSchoolersOnly);
  const [view, setView] = useState<HackathonViewMode>(initialFilters.view);
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

  /* Browser geolocation — accurate but shows a permission prompt, so it is
     only used on explicit request or when the free IP lookup has nothing. */
  function locateWithBrowser() {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: null,
          precise: true,
        });
        setLocationState("ready");
      },
      () => setLocationState("error"),
      { maximumAge: 5 * 60 * 1000, timeout: 10_000 }
    );
  }

  /* Prompt-free: Vercel's IP geo headers via /api/geo (city-level, free).
     Returns whether a position was found, so callers can decide whether to
     escalate to the (permission-prompting) browser API. */
  async function locateViaIp() {
    try {
      const response = await fetch("/api/geo");
      const body = (await response.json()) as {
        data: { latitude: number; longitude: number; city: string | null; countryCode: string | null } | null;
      };

      if (body.data) {
        setOrigin({ ...body.data, label: body.data.city, precise: false });
        setLocationState("ready");
        return true;
      }
    } catch {
      // Fall through to the browser API.
    }

    return false;
  }

  /* Used when the visitor explicitly asks for location (a distance filter
     pick): IP lookup first, then the browser prompt if that came up empty. */
  async function locate() {
    setLocationState("locating");

    if (await locateViaIp()) {
      return;
    }

    locateWithBrowser();
  }

  /* Runs on every load, prompt-free, so the Browse/Ranking views can push the
     visitor's own country to the top without them doing anything. Distance
     picks trigger the full locate() (with a browser-prompt fallback) from
     their own click handler; this only ever does the silent IP lookup. */
  useEffect(() => {
    const timeout = setTimeout(() => void locateViaIp(), 0);

    return () => clearTimeout(timeout);
  }, []);

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
    { key: "highSchoolersOnly", label: "High school only", value: highSchoolersOnly, setValue: setHighSchoolersOnly },
  ];

  const currentFilters = useMemo(
    () => ({
      beginnerFriendly,
      countries,
      datePeriod,
      distanceKm,
      format,
      highSchoolersOnly,
      name,
      travelReimbursement,
      view,
    }),
    [beginnerFriendly, countries, datePeriod, distanceKm, format, highSchoolersOnly, name, travelReimbursement, view]
  );
  const activeFilters = useMemo(() => hasActiveFilters(currentFilters), [currentFilters]);
  const filteredHackathons = useMemo(
    () => filterLocalHackathonCatalog(catalog, currentFilters, origin),
    [catalog, currentFilters, origin]
  );
  /* eloRating/countryCode are optional on HackathonCardData (some call sites,
     like the admin preview card, don't have them) but always present on the
     real catalog snapshot these views render — normalized here once so the
     ranking helpers below can rely on a definite number. */
  const rankableHackathons = useMemo(
    () => filteredHackathons.map((hackathon) => ({ ...hackathon, eloRating: hackathon.eloRating ?? 1500 })),
    [filteredHackathons]
  );
  const originCountryCode = origin?.countryCode ?? null;
  const eloRankedHackathons = useMemo(
    () => sortByEloWithLocalBoost(rankableHackathons, originCountryCode),
    [rankableHackathons, originCountryCode]
  );
  /* The catalog arrives with past (recurring) editions already ordered after
     everything upcoming; splitting on isPast keeps that order while letting the
     grid draw an explicit archive divider between the two groups. Grid view is
     Elo-ranked like the other views, so the split reads off eloRankedHackathons
     rather than the raw filtered list. */
  const upcomingHackathons = useMemo(
    () => eloRankedHackathons.filter((hackathon) => !hackathon.isPast),
    [eloRankedHackathons]
  );
  const pastHackathons = useMemo(
    () => eloRankedHackathons.filter((hackathon) => hackathon.isPast),
    [eloRankedHackathons]
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
  const faceoffRanks = useMemo(
    () => new Map(sortByEloDescending(rankableHackathons).map((hackathon, index) => [hackathon.id, index + 1])),
    [rankableHackathons]
  );
  const faceoffTiers = useMemo(
    () =>
      new Map(
        assignTiers(rankableHackathons).flatMap((group) =>
          group.hackathons.map((hackathon) => [hackathon.id, group.tier] as const)
        )
      ),
    [rankableHackathons]
  );
  const renderCardNode =
    renderCard ??
    ((hackathon: HackathonCardData) => (
      <HackathonCard
        hackathon={hackathon}
        rank={faceoffRanks.get(hackathon.id)}
        tier={faceoffTiers.get(hackathon.id)}
      />
    ));

  const selectedDateLabel = datePeriodOptions.find((option) => option.value === datePeriod)?.label ?? "Any date";
  const selectedFormatLabel = formatOptions.find((option) => option.value === format)?.label ?? "Any format";
  const selectedDistanceLabel =
    distanceKm === "any"
      ? "Any distance"
      : locationState === "error"
        ? "Location unavailable"
        : `Within ${distanceKm} km`;
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
    setDistanceKm("any");
    setFormat("any");
    setBeginnerFriendly("any");
    setTravelReimbursement("any");
    setHighSchoolersOnly("any");
  }

  return (
    <>
      <section aria-label="Hackathon filters" className="px-5 pb-7 pt-14 sm:pt-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="relative mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <div
              aria-label="Region filters"
              className="inline-flex items-center gap-1 p-1.5"
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
              className="inline-flex min-h-10 items-center gap-2 px-4 text-sm font-semibold text-navy dark:text-wheat transition-colors hover:text-cabernet dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 sm:absolute sm:right-0"
              href="/submit"
            >
              <PlusSquare aria-hidden="true" className="size-4" />
              New entry
            </Link>
          </div>

          <form
            className="relative z-30 flex flex-col p-2 md:flex-row md:items-stretch"
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

            <div className="relative min-h-[4.2rem] min-w-0 flex-1">
              {distanceKm !== "any" ? <input name="distanceKm" type="hidden" value={distanceKm} /> : null}
              <button
                aria-controls={distancePopoverId}
                aria-expanded={openPopover === "distance"}
                aria-label="Distance"
                className={`flex min-h-[4.2rem] w-full min-w-0 flex-col justify-start rounded-[2rem] px-6 py-3 text-left hover:bg-ivory dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                  openPopover === "distance" ? "bg-ivory dark:bg-white/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : ""
                }`}
                onClick={() => setOpenPopover((current) => (current === "distance" ? null : "distance"))}
                type="button"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat">
                  <Navigation aria-hidden="true" className="size-3.5" />
                  Near me
                </span>
                <span className="mt-1 block truncate text-sm leading-5 text-navy/55 dark:text-wheat/55">
                  {distanceKm !== "any" && locationState === "locating" ? "Finding you..." : selectedDistanceLabel}
                </span>
              </button>
              {openPopover === "distance" ? (
                <div
                  className="absolute left-0 top-[calc(100%+0.9rem)] z-50 w-full min-w-[19rem] rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:w-[24rem]"
                  id={distancePopoverId}
                >
                  <div className="grid gap-2">
                    {distanceOptions.map((option) => {
                      const selected = distanceKm === option.value;

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
                            setDistanceKm(option.value);
                            setOpenPopover(null);

                            if (option.value !== "any" && !origin && locationState === "idle") {
                              void locate();
                            }
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
                  <div className="mt-3 border-t border-navy/10 dark:border-white/10 pt-3">
                    {locationState === "error" ? (
                      <p className="mb-2 text-xs leading-5 text-cabernet dark:text-[#e4a3ab]">
                        We couldn&apos;t find your location. Allow location access in your browser and try again.
                      </p>
                    ) : origin ? (
                      <p className="mb-2 text-xs leading-5 text-navy/55 dark:text-wheat/55">
                        {origin.precise
                          ? "Using your precise location."
                          : `Using your approximate location${origin.label ? ` near ${origin.label}` : ""}.`}
                      </p>
                    ) : null}
                    {!origin?.precise ? (
                      <button
                        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-navy/15 dark:border-white/15 px-4 text-xs font-semibold text-navy dark:text-wheat transition-colors hover:border-navy dark:hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 disabled:opacity-50"
                        disabled={locationState === "locating"}
                        onClick={locateWithBrowser}
                        type="button"
                      >
                        <LocateFixed aria-hidden="true" className="size-3.5" />
                        {locationState === "locating" ? "Locating..." : "Use precise location"}
                      </button>
                    ) : null}
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
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat sm:text-4xl">
              {view === "tier" ? "Tier list" : view === "ranking" ? "Elo ranking" : "Upcoming hackathons"}
            </h1>
            <div
              aria-label="Hackathon view"
              className="inline-flex items-center gap-1 rounded-full border border-navy/10 bg-white/70 p-1 shadow-[0_10px_32px_-14px_rgba(29,42,68,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]"
              role="tablist"
            >
              {viewModeOptions.map((option) => {
                const Icon = viewModeIcons[option.value];
                const active = view === option.value;

                return (
                  <button
                    aria-selected={active}
                    className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
                      active
                        ? "bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414]"
                        : "text-navy/55 hover:bg-navy/[0.05] hover:text-navy dark:text-wheat/55 dark:hover:bg-white/5 dark:hover:text-wheat"
                    }`}
                    key={option.value}
                    onClick={() => setView(option.value)}
                    role="tab"
                    type="button"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {view === "grid" && !activeFilters ? (
            <p className="mb-6 -mt-3 text-sm leading-5 text-navy/50 dark:text-wheat/50">
              Ranked by Face Off Elo{originCountryCode ? " — hackathons near you first." : "."}
            </p>
          ) : null}

          {filteredHackathons.length ? (
            view === "tier" ? (
              <HackathonTierList hackathons={rankableHackathons} />
            ) : view === "ranking" ? (
              <HackathonRankingList hackathons={eloRankedHackathons} localCountryCode={originCountryCode} />
            ) : (
              <>
                {upcomingHackathons.length ? (
                  <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
                    {upcomingHackathons.map((hackathon) => (
                      <Fragment key={hackathon.id}>{renderCardNode(hackathon, cardHelpers)}</Fragment>
                    ))}
                  </div>
                ) : null}

                {/* Past recurring editions sit below a labeled rule so the cutoff
                    between live events and the archive is unmistakable. */}
                {pastHackathons.length ? (
                  <>
                    <div
                      aria-label="Archived hackathons"
                      className={`flex items-center gap-4 ${upcomingHackathons.length ? "mt-14" : "mt-2"}`}
                      role="separator"
                    >
                      <span aria-hidden="true" className="h-px flex-1 bg-navy/15 dark:bg-white/15" />
                      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-navy/55 dark:text-wheat/55">
                        <Archive aria-hidden="true" className="size-3.5" />
                        Archived · awaiting next edition
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-navy/15 dark:bg-white/15" />
                    </div>
                    <div className="mt-10 grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
                      {pastHackathons.map((hackathon) => (
                        <Fragment key={hackathon.id}>{renderCardNode(hackathon, cardHelpers)}</Fragment>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )
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
